import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, resetDatabase, testPrisma, type Fixture } from './helpers';

/**
 * Food editing, with a focus on the validation rules that are easy to get
 * subtly wrong: yields above 100%, duplicate names, and deletions that must
 * leave logged history intact.
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
let foods: typeof import('@/lib/actions/foods');

beforeAll(async () => {
  foods = await import('@/lib/actions/foods');
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
  session.userId = fixture.userId;
});

/** The shape the food form submits. */
function foodPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test food',
    category: 'OTHER',
    defaultUnit: 'g',
    bulkClass: 'NOT_CLASSIFIED',
    storageDefault: 'PANTRY',
    nutritionBasisQty: 100,
    nutritionBasisUnit: 'g',
    active: true,
    ...overrides,
  };
}

describe('saveFood cooking yield rules', () => {
  it('accepts a normal meat yield without confirmation', async () => {
    const result = await foods.saveFood(
      foodPayload({ name: 'Lamb', tracksYield: true, cookingYieldPct: 72 }),
    );
    expect(result.ok).toBe(true);
  });

  it('asks for confirmation the first time a yield above 100% is set', async () => {
    const result = await foods.saveFood(
      foodPayload({ name: 'Pasta', tracksYield: true, cookingYieldPct: 240 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.needsConfirmation).toBe(true);
  });

  it('saves an above-100% yield once confirmed', async () => {
    const result = await foods.saveFood(
      foodPayload({ name: 'Pasta', tracksYield: true, cookingYieldPct: 240, confirmYield: true }),
    );
    expect(result.ok).toBe(true);

    const saved = await testPrisma().food.findFirstOrThrow({ where: { name: 'Pasta' } });
    expect(saved.cookingYieldPct).toBe(240);
  });

  it('does not re-ask when an unchanged above-100% yield is resubmitted', async () => {
    // Renaming rice should not demand a fresh confirmation of its 300% yield;
    // being trained to click through a warning is how real mistakes get made.
    const result = await foods.saveFood(
      foodPayload({
        id: fixture.foods.rice,
        name: 'Basmati rice',
        category: 'CARBOHYDRATE',
        tracksYield: true,
        cookingYieldPct: 300,
      }),
    );

    expect(result.ok).toBe(true);
    const saved = await testPrisma().food.findFirstOrThrow({ where: { id: fixture.foods.rice! } });
    expect(saved.name).toBe('Basmati rice');
    expect(saved.cookingYieldPct).toBe(300);
  });

  it('does ask again when an existing yield is changed to above 100%', async () => {
    const result = await foods.saveFood(
      foodPayload({
        id: fixture.foods.chicken,
        name: 'Chicken breast',
        category: 'PROTEIN',
        tracksYield: true,
        cookingYieldPct: 150,
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.needsConfirmation).toBe(true);
  });

  it('rejects a zero or negative yield outright', async () => {
    for (const value of [0, -5]) {
      const result = await foods.saveFood(
        foodPayload({ name: `Bad ${value}`, tracksYield: true, cookingYieldPct: value }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.needsConfirmation).toBeUndefined();
    }
  });

  it('logs a manual yield change in the yield history', async () => {
    await foods.saveFood(
      foodPayload({
        id: fixture.foods.chicken,
        name: 'Chicken breast',
        category: 'PROTEIN',
        tracksYield: true,
        cookingYieldPct: 72,
      }),
    );

    const logged = await testPrisma().cookingYield.findFirst({
      where: { foodId: fixture.foods.chicken!, source: 'MANUAL' },
    });
    expect(logged?.yieldPct).toBe(72);
  });
});

describe('saveFood validation', () => {
  it('rejects a duplicate name', async () => {
    const result = await foods.saveFood(foodPayload({ name: 'White rice' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already have a food/);
  });

  it('rejects an empty name', async () => {
    const result = await foods.saveFood(foodPayload({ name: '   ' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown unit so quantities can always be added up', async () => {
    const result = await foods.saveFood(foodPayload({ name: 'Mystery', defaultUnit: 'handfuls' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not recognised/);
  });

  it('requires a unit when a package size is given', async () => {
    const result = await foods.saveFood(
      foodPayload({ name: 'Boxed thing', packageSize: 500, packageUnit: '' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.packageUnit).toBeDefined();
  });

  it('rejects negative nutrition values', async () => {
    const result = await foods.saveFood(foodPayload({ name: 'Negative', calories: -10 }));
    expect(result.ok).toBe(false);
  });
});

describe('deleteFood', () => {
  it('leaves logged history intact when a food is deleted', async () => {
    const prisma = testPrisma();

    // Log a day that used the rice.
    const dailyPlan = await prisma.dailyPlan.create({
      data: {
        userId: fixture.userId,
        date: new Date(Date.UTC(2026, 8, 14)),
        dayTypeName: 'Training',
        dayTypeIsTraining: true,
        mealPlanName: 'Test plan',
        waterTargetMl: 4000,
        meals: {
          create: {
            name: 'Meal A',
            sortOrder: 0,
            status: 'COMPLETED',
            items: {
              create: {
                foodId: fixture.foods.rice,
                foodName: 'White rice',
                quantity: 225,
                unit: 'g',
                state: 'COOKED',
              },
            },
          },
        },
      },
    });

    const result = await foods.deleteFood({ id: fixture.foods.rice! });
    expect(result.ok).toBe(true);

    const items = await prisma.dailyMealItem.findMany({
      where: { dailyMeal: { dailyPlanId: dailyPlan.id } },
    });

    // The snapshot survives; only the link is dropped.
    expect(items).toHaveLength(1);
    expect(items[0]!.foodName).toBe('White rice');
    expect(items[0]!.quantity).toBe(225);
    expect(items[0]!.foodId).toBeNull();
  });

  it('removes the food from the plan and says so', async () => {
    const result = await foods.deleteFood({ id: fixture.foods.rice! });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toMatch(/plan ingredient/);

    const remaining = await testPrisma().mealIngredient.findMany({
      where: { foodId: fixture.foods.rice! },
    });
    expect(remaining).toHaveLength(0);
  });
});
