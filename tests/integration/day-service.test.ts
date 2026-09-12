import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, resetDatabase, testPrisma, type Fixture } from './helpers';

/**
 * Day materialisation, with particular attention to two things that bit in
 * practice:
 *
 *  - concurrent requests for the same not-yet-generated day, which used to race
 *    each other into the (userId, date) unique index
 *  - the snapshot guarantee: a generated day must not change when the plan does
 */

let fixture: Fixture;
let dayService: typeof import('@/lib/server/day-service');

beforeAll(async () => {
  dayService = await import('@/lib/server/day-service');
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
});

describe('ensureDailyPlan', () => {
  it('generates the day from the active plan', async () => {
    // 2026-09-14 is a Monday, a training day in the fixture schedule.
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    const plan = await testPrisma().dailyPlan.findUniqueOrThrow({
      where: { id },
      include: { meals: { include: { items: true }, orderBy: { sortOrder: 'asc' } } },
    });

    expect(plan.dayTypeName).toBe('Training');
    expect(plan.dayTypeIsTraining).toBe(true);
    expect(plan.meals).toHaveLength(2);
    expect(plan.meals[0]!.items.map((i) => [i.foodName, i.quantity])).toEqual([
      ['White rice', 225],
      ['Chicken breast', 175],
    ]);
  });

  it('is idempotent: opening the same day twice returns the same row', async () => {
    const first = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');
    const second = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    expect(second).toBe(first);
    expect(await testPrisma().dailyPlan.count()).toBe(1);
    expect(await testPrisma().dailyMeal.count()).toBe(2);
  });

  it('survives concurrent requests for the same new day', async () => {
    // The Today screen links to the previous and next day and Next prefetches
    // those links, so a navigation racing its own prefetch is routine. Before
    // the advisory lock this threw a unique-constraint error on
    // daily_plans_userId_date_key.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => dayService.ensureDailyPlan(fixture.userId, '2026-09-15')),
    );

    // Every caller gets the same day back.
    expect(new Set(results).size).toBe(1);

    // And exactly one day was created, with no duplicated meals.
    expect(await testPrisma().dailyPlan.count()).toBe(1);
    expect(await testPrisma().dailyMeal.count()).toBe(2);
    expect(await testPrisma().dailyMealItem.count()).toBe(4);
  });

  it('survives concurrent requests for several different days at once', async () => {
    const dates = ['2026-09-16', '2026-09-17', '2026-09-18'];
    await Promise.all(
      dates.flatMap((date) => [
        dayService.ensureDailyPlan(fixture.userId, date),
        dayService.ensureDailyPlan(fixture.userId, date),
      ]),
    );

    expect(await testPrisma().dailyPlan.count()).toBe(3);
    expect(await testPrisma().dailyMeal.count()).toBe(6);
  });

  it('uses rest-day quantities on a rest day', async () => {
    // 2026-09-19 is a Saturday.
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-19');
    const plan = await testPrisma().dailyPlan.findUniqueOrThrow({
      where: { id },
      include: { meals: { include: { items: true }, orderBy: { sortOrder: 'asc' } } },
    });

    expect(plan.dayTypeName).toBe('Rest');
    expect(plan.meals[0]!.items.find((i) => i.foodName === 'White rice')!.quantity).toBe(175);
    // Meal B has no rice at all on a rest day, so only the bagels remain.
    expect(plan.meals[1]!.items.map((i) => i.foodName)).toEqual(['Bagels']);
  });

  it('does not regenerate a day that already exists', async () => {
    const prisma = testPrisma();
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    const meal = await prisma.dailyMeal.findFirstOrThrow({ where: { dailyPlanId: id } });
    await prisma.dailyMeal.update({
      where: { id: meal.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    // Change the plan underneath it.
    await prisma.food.update({
      where: { id: fixture.foods.rice! },
      data: { name: 'Basmati rice' },
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    const after = await prisma.dailyMeal.findUniqueOrThrow({
      where: { id: meal.id },
      include: { items: true },
    });
    expect(after.status).toBe('COMPLETED');
    expect(after.items.some((i) => i.foodName === 'White rice')).toBe(true);
    expect(after.items.some((i) => i.foodName === 'Basmati rice')).toBe(false);
  });

  it('keeps completions when a day is deliberately regenerated', async () => {
    const prisma = testPrisma();
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    await prisma.dailyMeal.updateMany({
      where: { dailyPlanId: id, name: 'Meal A' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', { regenerate: true });

    const mealA = await prisma.dailyMeal.findFirstOrThrow({
      where: { dailyPlanId: id, name: 'Meal A' },
    });
    expect(mealA.status).toBe('COMPLETED');
    expect(await prisma.dailyMeal.count({ where: { dailyPlanId: id } })).toBe(2);
  });

  it('switches day type on request and rebuilds the quantities', async () => {
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');
    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', {
      dayTypeId: fixture.restId,
      regenerate: true,
    });

    const plan = await testPrisma().dailyPlan.findUniqueOrThrow({
      where: { id },
      include: { meals: { include: { items: true }, orderBy: { sortOrder: 'asc' } } },
    });

    expect(plan.dayTypeName).toBe('Rest');
    expect(plan.meals[0]!.items.find((i) => i.foodName === 'White rice')!.quantity).toBe(175);
  });

  it('keeps water entries when a day is regenerated', async () => {
    const prisma = testPrisma();
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    await prisma.waterEntry.create({
      data: {
        userId: fixture.userId,
        dailyPlanId: id,
        date: new Date(Date.UTC(2026, 8, 14)),
        amountMl: 500,
      },
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', { regenerate: true });
    expect(await prisma.waterEntry.count({ where: { dailyPlanId: id } })).toBe(1);
  });

  it('leaves an eaten meal exactly as logged when the day is rebuilt', async () => {
    const prisma = testPrisma();
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    const mealA = await prisma.dailyMeal.findFirstOrThrow({
      where: { dailyPlanId: id, name: 'Meal A' },
    });

    // Eaten, with a swap and an adjusted amount: exactly the state a rebuild
    // used to throw away by re-portioning from the plan.
    await prisma.dailyMealItem.updateMany({
      where: { dailyMealId: mealA.id, foodName: 'White rice' },
      data: { quantity: 300, isQuantityOverridden: true },
    });
    await prisma.dailyMeal.update({
      where: { id: mealA.id },
      data: { status: 'COMPLETED', completedAt: new Date(), actualTime: '12:42' },
    });
    await prisma.mealCompletion.create({
      data: { dailyMealId: mealA.id, action: 'COMPLETED' },
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', { regenerate: true });

    const after = await prisma.dailyMeal.findFirstOrThrow({
      where: { dailyPlanId: id, name: 'Meal A' },
      include: { items: true, completions: true },
    });

    // Same row, same plate, same audit trail.
    expect(after.id).toBe(mealA.id);
    expect(after.status).toBe('COMPLETED');
    expect(after.actualTime).toBe('12:42');
    expect(after.items.find((i) => i.foodName === 'White rice')!.quantity).toBe(300);
    expect(after.items.find((i) => i.foodName === 'White rice')!.isQuantityOverridden).toBe(true);
    expect(after.completions).toHaveLength(1);
  });

  it('re-portions the meals still to come', async () => {
    const prisma = testPrisma();
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    await prisma.dailyMeal.updateMany({
      where: { dailyPlanId: id, name: 'Meal A' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', {
      dayTypeId: fixture.restId,
      regenerate: true,
    });

    const meals = await prisma.dailyMeal.findMany({
      where: { dailyPlanId: id },
      include: { items: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Meal A was eaten on training portions and keeps them; Meal B was not, so
    // it takes the rest-day amount.
    expect(meals[0]!.items.find((i) => i.foodName === 'White rice')!.quantity).toBe(225);
    expect(meals[1]!.items.find((i) => i.foodName === 'Bagels')!.quantity).toBe(1);
  });

  it('keeps a logged meal the new day type no longer includes', async () => {
    const prisma = testPrisma();
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    const mealB = await prisma.dailyMeal.findFirstOrThrow({
      where: { dailyPlanId: id, name: 'Meal B' },
    });
    await prisma.dailyMeal.update({
      where: { id: mealB.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await prisma.mealCompletion.create({
      data: { dailyMealId: mealB.id, action: 'COMPLETED' },
    });

    // Drop Meal B from rest days entirely, then switch the day to rest.
    await prisma.mealDayTypeSetting.updateMany({
      where: { mealId: fixture.mealIds.mealB!, dayTypeId: fixture.restId },
      data: { included: false },
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', {
      dayTypeId: fixture.restId,
      regenerate: true,
    });

    // It is no longer in the plan for this day type, but it was eaten, so it
    // stays on the record rather than vanishing.
    const survivor = await prisma.dailyMeal.findUnique({
      where: { id: mealB.id },
      include: { completions: true },
    });
    expect(survivor).not.toBeNull();
    expect(survivor!.status).toBe('COMPLETED');
    expect(survivor!.completions).toHaveLength(1);
  });

  it('drops a pending meal the new day type no longer includes', async () => {
    const prisma = testPrisma();
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    await prisma.mealDayTypeSetting.updateMany({
      where: { mealId: fixture.mealIds.mealB!, dayTypeId: fixture.restId },
      data: { included: false },
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', {
      dayTypeId: fixture.restId,
      regenerate: true,
    });

    // Nothing was ever recorded against it, so it is just a plan artefact.
    const meals = await prisma.dailyMeal.findMany({ where: { dailyPlanId: id } });
    expect(meals.map((m) => m.name)).toEqual(['Meal A']);
  });

  it('keeps a pending meal that was completed and then undone', async () => {
    const prisma = testPrisma();
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    const mealB = await prisma.dailyMeal.findFirstOrThrow({
      where: { dailyPlanId: id, name: 'Meal B' },
    });
    await prisma.mealCompletion.createMany({
      data: [
        { dailyMealId: mealB.id, action: 'COMPLETED' },
        { dailyMealId: mealB.id, action: 'UNDONE' },
      ],
    });

    await prisma.mealDayTypeSetting.updateMany({
      where: { mealId: fixture.mealIds.mealB!, dayTypeId: fixture.restId },
      data: { included: false },
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', {
      dayTypeId: fixture.restId,
      regenerate: true,
    });

    // Pending, but something happened to it: the log says so and must survive.
    const survivor = await prisma.dailyMeal.findUnique({ where: { id: mealB.id } });
    expect(survivor).not.toBeNull();
    expect(await prisma.mealCompletion.count({ where: { dailyMealId: mealB.id } })).toBe(2);
  });

  it('snapshots macros so later nutrition edits do not move past totals', async () => {
    const prisma = testPrisma();
    const id = await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    const before = await prisma.dailyMealItem.findFirstOrThrow({
      where: { foodName: 'White rice', dailyMeal: { dailyPlanId: id } },
    });
    // 225 g at 130 kcal/100 g.
    expect(before.calories).toBe(292.5);

    await prisma.food.update({
      where: { id: fixture.foods.rice! },
      data: { calories: 999 },
    });

    const after = await prisma.dailyMealItem.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.calories).toBe(292.5);
  });
});
