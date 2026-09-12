import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, resetDatabase, testPrisma, type Fixture } from './helpers';

/**
 * Grocery generation against a real database: the plan rows go in, the
 * aggregated and yield-converted shopping list comes out.
 */

let fixture: Fixture;

// `buildGroceryLines` imports the app's Prisma singleton, which reads
// DATABASE_URL at import time, so it must be imported after the setup file ran.
let buildGroceryLines: typeof import('@/lib/server/grocery-service').buildGroceryLines;
let suggestDayTypeCounts: typeof import('@/lib/server/grocery-service').suggestDayTypeCounts;

beforeAll(async () => {
  ({ buildGroceryLines, suggestDayTypeCounts } = await import('@/lib/server/grocery-service'));
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
});

const generate = (overrides: Partial<Parameters<typeof buildGroceryLines>[0]> = {}) =>
  buildGroceryLines({
    userId: fixture.userId,
    startDate: '2026-09-14',
    daysPlanned: 7,
    dayTypeCounts: [
      { dayTypeId: fixture.trainingId, days: 5 },
      { dayTypeId: fixture.restId, days: 2 },
    ],
    applyInventory: false,
    includeSupplements: false,
    includeOptional: true,
    ...overrides,
  });

describe('buildGroceryLines', () => {
  it('aggregates a food across meals and day types', async () => {
    const { lines } = await generate();
    const rice = lines.find((l) => l.name === 'White rice')!;

    // Meal A: 225x5 + 175x2 = 1475. Meal B: 150x5 + 0x2 = 750.
    expect(rice.cookedQty).toBe(2225);
  });

  it('converts cooked weights to raw purchase amounts', async () => {
    const { lines } = await generate();

    const chicken = lines.find((l) => l.name === 'Chicken breast')!;
    expect(chicken.cookedQty).toBe(175 * 7);
    expect(chicken.shoppingQty).toBe(1633.33);
    expect(chicken.yieldPctUsed).toBe(75);

    // Rice gains weight when cooked, so the dry amount is smaller.
    const rice = lines.find((l) => l.name === 'White rice')!;
    expect(rice.shoppingQty).toBe(741.67);
  });

  it('estimates whole packages', async () => {
    const { lines } = await generate();
    expect(lines.find((l) => l.name === 'Chicken breast')!.estimatedPackages).toBe(2);
    expect(lines.find((l) => l.name === 'Bagels')!.estimatedPackages).toBe(2);
  });

  it('respects zero quantities on a day type', async () => {
    const { lines } = await generate({
      dayTypeCounts: [
        { dayTypeId: fixture.trainingId, days: 0 },
        { dayTypeId: fixture.restId, days: 7 },
      ],
    });
    // Only Meal A contributes rice on rest days: 175 x 7.
    expect(lines.find((l) => l.name === 'White rice')!.cookedQty).toBe(1225);
    expect(lines.find((l) => l.name === 'Bagels')!.requiredQty).toBe(7);
  });

  it('follows the option group default', async () => {
    const { lines } = await generate();
    expect(lines.some((l) => l.name === 'Chicken breast')).toBe(true);
    expect(lines.some((l) => l.name === 'Ground turkey')).toBe(false);
  });

  it('follows a week preference over the group default', async () => {
    const prisma = testPrisma();
    await prisma.planWeekPreference.create({
      data: {
        userId: fixture.userId,
        // 2026-09-14 is a Monday, so it is its own week start.
        weekStart: new Date(Date.UTC(2026, 8, 14)),
        optionGroupId: fixture.groupId,
        foodId: fixture.foods.turkey!,
      },
    });

    const { lines } = await generate();
    const turkey = lines.find((l) => l.name === 'Ground turkey')!;
    expect(turkey.cookedQty).toBe(1225);
    expect(turkey.yieldPctUsed).toBe(78);
    expect(lines.some((l) => l.name === 'Chicken breast')).toBe(false);
  });

  it('subtracts inventory when the units convert', async () => {
    const prisma = testPrisma();
    await prisma.inventoryItem.create({
      data: {
        userId: fixture.userId,
        foodId: fixture.foods.rice!,
        name: 'White rice',
        quantity: 0.5,
        unit: 'kg',
        location: 'PANTRY',
      },
    });

    const { lines } = await generate({ applyInventory: true });
    const rice = lines.find((l) => l.name === 'White rice')!;
    expect(rice.inventoryQty).toBe(500);
    expect(rice.shoppingQty).toBe(241.67);
  });

  it('notes rather than subtracts when units cannot convert', async () => {
    const prisma = testPrisma();
    await prisma.inventoryItem.create({
      data: {
        userId: fixture.userId,
        foodId: fixture.foods.rice!,
        name: 'White rice',
        quantity: 2,
        unit: 'pack',
        location: 'PANTRY',
      },
    });

    const { lines } = await generate({ applyInventory: true });
    const rice = lines.find((l) => l.name === 'White rice')!;
    expect(rice.inventoryQty).toBeNull();
    expect(rice.shoppingQty).toBe(741.67);
    expect(rice.inventoryNote).toMatch(/could not be converted/);
  });

  it('adds supplements when asked, honouring training-only schedules', async () => {
    const { lines } = await generate({ includeSupplements: true });

    // Creatine: 5 g every day for 7 days.
    const creatine = lines.find((l) => l.name === 'Creatine')!;
    expect(creatine.shoppingQty).toBe(35);
    expect(creatine.shoppingUnit).toBe('g');

    // Intra-workout: one scoop on the 5 training days only.
    const intra = lines.find((l) => l.name === 'Intra-workout')!;
    expect(intra.shoppingQty).toBe(5);
    expect(intra.shoppingUnit).toBe('scoop');
  });

  it('subtracts a supplement you already have from the supplement line', async () => {
    const prisma = testPrisma();

    // A supplement is matched to a food by name, which is how packages are
    // estimated for it; the inventory row hangs off that same food.
    const food = await prisma.food.create({
      data: {
        userId: fixture.userId,
        name: 'Creatine',
        category: 'SUPPLEMENT',
        defaultUnit: 'g',
        packageSize: 300,
        packageUnit: 'g',
      },
    });
    await prisma.inventoryItem.create({
      data: { userId: fixture.userId, foodId: food.id, name: 'Creatine', quantity: 20, unit: 'g' },
    });

    const { lines } = await generate({ includeSupplements: true, applyInventory: true });
    const creatine = lines.find((l) => l.name === 'Creatine')!;

    // 5 g a day for seven days is 35 g, less the 20 g already in the cupboard.
    // The supplement lines used to be appended after the inventory pass, so
    // this subtraction never happened.
    expect(creatine.inventoryQty).toBe(20);
    expect(creatine.shoppingQty).toBe(15);
  });

  it('leaves supplements out by default', async () => {
    const { lines } = await generate();
    expect(lines.some((l) => l.name === 'Creatine')).toBe(false);
  });

  it('returns a warning and no lines when there is no active plan', async () => {
    const prisma = testPrisma();
    await prisma.mealPlan.updateMany({ where: { userId: fixture.userId }, data: { isActive: false } });

    const { lines, warnings } = await generate();
    expect(lines).toHaveLength(0);
    expect(warnings[0]).toMatch(/No active meal plan/);
  });
});

describe('suggestDayTypeCounts', () => {
  it('reads the 5 training / 2 rest pattern off the weekly schedule', async () => {
    const counts = await suggestDayTypeCounts(fixture.userId, 7);
    expect(counts.find((c) => c.dayTypeName === 'Training')!.days).toBe(5);
    expect(counts.find((c) => c.dayTypeName === 'Rest')!.days).toBe(2);
  });

  it('scales to a longer horizon', async () => {
    const counts = await suggestDayTypeCounts(fixture.userId, 14);
    expect(counts.find((c) => c.dayTypeName === 'Training')!.days).toBe(10);
    expect(counts.find((c) => c.dayTypeName === 'Rest')!.days).toBe(4);
  });
});
