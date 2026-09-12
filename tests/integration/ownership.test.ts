import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, resetDatabase, testPrisma, type Fixture } from './helpers';

/**
 * Ids that arrive from the client.
 *
 * Every action checks the record it is about to change belongs to the signed-in
 * user. These are the three that did not: two stored a reference without
 * looking at it, and one verified the parent but not the children it was given.
 *
 * The app has one account today, so none of this was reachable in practice. The
 * schema carries `userId` everywhere on the stated promise that multi-user is a
 * routing change rather than a migration, and that promise is only true if the
 * checks are already there.
 */

const session = vi.hoisted(() => ({ userId: '' }));

vi.mock('@/lib/auth/guards', () => ({
  requireUserId: async () => session.userId,
  requireUser: async () => ({ id: session.userId, username: 'tester', displayName: null, mustChangePassword: false }),
  getCurrentUser: async () => ({ id: session.userId, username: 'tester', displayName: null, mustChangePassword: false }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

let fixture: Fixture;
let intruderId: string;
let plan: typeof import('@/lib/actions/plan');
let prep: typeof import('@/lib/actions/prep');

beforeAll(async () => {
  plan = await import('@/lib/actions/plan');
  prep = await import('@/lib/actions/prep');
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
  session.userId = fixture.userId;

  const intruder = await testPrisma().user.create({
    data: { username: 'someone-else', passwordHash: 'placeholder' },
  });
  intruderId = intruder.id;
});

describe('reorderIngredients', () => {
  it('refuses an ingredient that belongs to another meal', async () => {
    const prisma = testPrisma();

    // A second plan, with its own meal and ingredient.
    const otherPlan = await prisma.mealPlan.create({
      data: { userId: intruderId, name: 'Theirs' },
    });
    const otherFood = await prisma.food.create({
      data: { userId: intruderId, name: 'Their rice', defaultUnit: 'g' },
    });
    const otherMeal = await prisma.meal.create({
      data: { mealPlanId: otherPlan.id, name: 'Their meal' },
    });
    const otherIngredient = await prisma.mealIngredient.create({
      data: { mealId: otherMeal.id, foodId: otherFood.id, unit: 'g', sortOrder: 7 },
    });

    const mine = await prisma.mealIngredient.findMany({
      where: { mealId: fixture.mealIds.mealA! },
      select: { id: true },
    });

    const result = await plan.reorderIngredients({
      mealId: fixture.mealIds.mealA!,
      ids: [...mine.map((row) => row.id), otherIngredient.id],
    });

    expect(result.ok).toBe(false);
    // Nothing moved, including the row that was the actual target.
    const after = await prisma.mealIngredient.findUniqueOrThrow({
      where: { id: otherIngredient.id },
    });
    expect(after.sortOrder).toBe(7);
  });

  it('reorders the ingredients of a meal you own', async () => {
    const prisma = testPrisma();
    const mine = await prisma.mealIngredient.findMany({
      where: { mealId: fixture.mealIds.mealA! },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });

    const reversed = [...mine].reverse().map((row) => row.id);
    const result = await plan.reorderIngredients({ mealId: fixture.mealIds.mealA!, ids: reversed });

    expect(result.ok).toBe(true);
    const after = await prisma.mealIngredient.findMany({
      where: { mealId: fixture.mealIds.mealA! },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    expect(after.map((row) => row.id)).toEqual(reversed);
  });
});

describe('createPrepSession', () => {
  it('refuses a grocery week that belongs to someone else', async () => {
    const prisma = testPrisma();
    const theirWeek = await prisma.groceryWeek.create({
      data: {
        userId: intruderId,
        name: 'Their week',
        startDate: new Date(Date.UTC(2026, 8, 14)),
        endDate: new Date(Date.UTC(2026, 8, 20)),
      },
    });

    const result = await prep.createPrepSession({
      date: '2026-09-13',
      groceryWeekId: theirWeek.id,
      dayTypeCounts: { [fixture.trainingId]: 5 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/grocery list could not be found/);
    expect(await prisma.prepSession.count()).toBe(0);
  });
});

describe('addStoragePortion', () => {
  it('refuses a food that belongs to someone else', async () => {
    const prisma = testPrisma();
    const theirFood = await prisma.food.create({
      data: { userId: intruderId, name: 'Their chicken', defaultUnit: 'g' },
    });

    const result = await prep.addStoragePortion({
      label: 'Four portions',
      foodId: theirFood.id,
      portions: 4,
      location: 'FRIDGE',
      prepDate: '2026-09-13',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/food could not be found/);
    expect(await prisma.storagePortion.count()).toBe(0);
  });

  it('accepts a food you own', async () => {
    const result = await prep.addStoragePortion({
      label: 'Four portions',
      foodId: fixture.foods.chicken,
      portions: 4,
      location: 'FRIDGE',
      prepDate: '2026-09-13',
    });

    expect(result.ok).toBe(true);
    expect(await testPrisma().storagePortion.count()).toBe(1);
  });
});
