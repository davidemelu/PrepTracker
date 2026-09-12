import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, resetDatabase, testPrisma, type Fixture } from './helpers';

/**
 * The prep loop: plan how much to cook, weigh raw and cooked, and confirm the
 * measured yield feeds back into the food so next week's shopping list improves.
 *
 * Server actions are called directly. Two things only exist inside a real
 * request and are stubbed: the session guard and Next's cache revalidation.
 */

const session = vi.hoisted(() => ({ userId: '' }));

vi.mock('@/lib/auth/guards', () => ({
  requireUserId: async () => session.userId,
  requireUser: async () => ({
    id: session.userId,
    username: 'tester',
    displayName: null,
    mustChangePassword: false,
  }),
  getCurrentUser: async () => ({
    id: session.userId,
    username: 'tester',
    displayName: null,
    mustChangePassword: false,
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

let fixture: Fixture;
let prep: typeof import('@/lib/actions/prep');
let groceryService: typeof import('@/lib/server/grocery-service');

beforeAll(async () => {
  prep = await import('@/lib/actions/prep');
  groceryService = await import('@/lib/server/grocery-service');
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
  session.userId = fixture.userId;
});

async function createSession() {
  const result = await prep.createPrepSession({
    name: 'Sunday prep',
    date: '2026-09-13',
    dayTypeCounts: { [fixture.trainingId]: 5, [fixture.restId]: 2 },
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

describe('createPrepSession', () => {
  it('creates a batch per food measured by cooked weight', async () => {
    const id = await createSession();
    const session = await testPrisma().prepSession.findUniqueOrThrow({
      where: { id },
      include: { batches: true, tasks: true },
    });

    expect(session.batches.map((b) => b.foodName).sort()).toEqual(['Chicken breast', 'White rice']);
    // Bagels are not cooked, so they never become a batch.
    expect(session.batches.some((b) => b.foodName === 'Bagels')).toBe(false);
  });

  it('sets the cooked target and portion count from the plan', async () => {
    const id = await createSession();
    const batch = await testPrisma().prepBatch.findFirstOrThrow({
      where: { prepSessionId: id, foodName: 'Chicken breast' },
    });

    // 175 g x 7 days = 1225 g cooked, which is 7 portions of 175 g.
    expect(batch.targetCookedG).toBe(1225);
    expect(batch.portionSizeG).toBe(175);
    expect(batch.portionsPlanned).toBe(7);
  });

  it('creates a cook and a portion task per batch', async () => {
    const id = await createSession();
    const tasks = await testPrisma().prepTask.findMany({ where: { prepSessionId: id } });

    expect(tasks.filter((t) => t.kind === 'COOK')).toHaveLength(2);
    expect(tasks.filter((t) => t.kind === 'PORTION')).toHaveLength(2);

    const cookChicken = tasks.find((t) => t.title === 'Cook Chicken breast')!;
    // 1225 cooked at 75% yield is 1633.33 g raw.
    expect(cookChicken.targetQty).toBe(1633.33);
    expect(cookChicken.notes).toMatch(/75% yield/);
  });

  it('records the training and rest day split', async () => {
    const id = await createSession();
    const session = await testPrisma().prepSession.findUniqueOrThrow({ where: { id } });
    expect(session.trainingDays).toBe(5);
    expect(session.restDays).toBe(2);
    expect(session.daysCovered).toBe(7);
  });
});

describe('updatePrepBatch', () => {
  it('computes the measured yield and portions', async () => {
    const id = await createSession();
    const batch = await testPrisma().prepBatch.findFirstOrThrow({
      where: { prepSessionId: id, foodName: 'Chicken breast' },
    });

    const result = await prep.updatePrepBatch({
      id: batch.id,
      rawWeightG: 2000,
      cookedWeightG: 1480,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.measuredYieldPct).toBe(74);
    expect(result.data.portions).toBe(8);
    expect(result.data.leftoverG).toBe(80);
  });

  it('rolls the measurement into the food for future shopping lists', async () => {
    const id = await createSession();
    const batch = await testPrisma().prepBatch.findFirstOrThrow({
      where: { prepSessionId: id, foodName: 'Chicken breast' },
    });

    await prep.updatePrepBatch({ id: batch.id, rawWeightG: 2000, cookedWeightG: 1400 });

    const food = await testPrisma().food.findUniqueOrThrow({ where: { id: fixture.foods.chicken! } });
    // One measurement of 70% replaces the 75% starting estimate.
    expect(food.cookingYieldPct).toBe(70);

    const logged = await testPrisma().cookingYield.findMany({
      where: { foodId: fixture.foods.chicken!, source: 'MEASURED' },
    });
    expect(logged).toHaveLength(1);
    expect(logged[0]!.rawWeightG).toBe(2000);
  });

  it('averages repeated measurements rather than letting one odd batch swing it', async () => {
    const id = await createSession();
    const batch = await testPrisma().prepBatch.findFirstOrThrow({
      where: { prepSessionId: id, foodName: 'Chicken breast' },
    });

    await prep.updatePrepBatch({ id: batch.id, rawWeightG: 1000, cookedWeightG: 700 });
    await prep.updatePrepBatch({ id: batch.id, rawWeightG: 1000, cookedWeightG: 800 });

    const food = await testPrisma().food.findUniqueOrThrow({ where: { id: fixture.foods.chicken! } });
    expect(food.cookingYieldPct).toBe(75);
  });

  it('changes the next grocery list once a yield is measured', async () => {
    const id = await createSession();
    const batch = await testPrisma().prepBatch.findFirstOrThrow({
      where: { prepSessionId: id, foodName: 'Chicken breast' },
    });

    await prep.updatePrepBatch({ id: batch.id, rawWeightG: 2000, cookedWeightG: 1200 });

    const { lines } = await groceryService.buildGroceryLines({
      userId: fixture.userId,
      startDate: '2026-09-21',
      daysPlanned: 7,
      dayTypeCounts: [
        { dayTypeId: fixture.trainingId, days: 5 },
        { dayTypeId: fixture.restId, days: 2 },
      ],
      applyInventory: false,
      includeSupplements: false,
      includeOptional: true,
    });

    const chicken = lines.find((l) => l.name === 'Chicken breast')!;
    // A 60% yield means buying noticeably more than the 75% estimate did.
    expect(chicken.yieldPctUsed).toBe(60);
    expect(chicken.shoppingQty).toBe(2041.67);
  });

  it('asks for confirmation when a yield exceeds 100%', async () => {
    const id = await createSession();
    const batch = await testPrisma().prepBatch.findFirstOrThrow({
      where: { prepSessionId: id, foodName: 'White rice' },
    });

    const first = await prep.updatePrepBatch({ id: batch.id, rawWeightG: 400, cookedWeightG: 1200 });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.needsConfirmation).toBe(true);

    const confirmed = await prep.updatePrepBatch({
      id: batch.id,
      rawWeightG: 400,
      cookedWeightG: 1200,
      confirmYield: true,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.data.measuredYieldPct).toBe(300);
  });

  it('rejects a zero portion size rather than dividing by zero', async () => {
    const id = await createSession();
    const batch = await testPrisma().prepBatch.findFirstOrThrow({
      where: { prepSessionId: id, foodName: 'Chicken breast' },
    });

    const result = await prep.updatePrepBatch({ id: batch.id, cookedWeightG: 1000, portionSizeG: 0 });
    expect(result.ok).toBe(false);
  });
});

describe('storeBatchPortions', () => {
  it('splits portions between fridge and freezer with thaw dates', async () => {
    const id = await createSession();
    const batch = await testPrisma().prepBatch.findFirstOrThrow({
      where: { prepSessionId: id, foodName: 'Chicken breast' },
    });

    await prep.updatePrepBatch({ id: batch.id, rawWeightG: 1700, cookedWeightG: 1225 });
    const result = await prep.storeBatchPortions({ batchId: batch.id, prepDate: '2026-09-13' });

    expect(result.ok).toBe(true);

    const portions = await testPrisma().storagePortion.findMany({
      where: { prepBatchId: batch.id },
      orderBy: { useByDate: 'asc' },
    });

    expect(portions).toHaveLength(7);
    expect(portions.filter((p) => p.location === 'FRIDGE')).toHaveLength(3);
    expect(portions.filter((p) => p.location === 'FREEZER')).toHaveLength(4);

    const firstFrozen = portions.find((p) => p.location === 'FREEZER')!;
    expect(firstFrozen.status).toBe('FROZEN');
    // Thaw one day before it is needed.
    expect(firstFrozen.thawOn?.toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(firstFrozen.useByDate?.toISOString().slice(0, 10)).toBe('2026-09-16');
  });

  it('refuses to store a batch with no portions recorded', async () => {
    const id = await createSession();
    const batch = await testPrisma().prepBatch.create({
      data: { prepSessionId: id, foodName: 'Mystery', portionSizeG: 175 },
    });

    const result = await prep.storeBatchPortions({ batchId: batch.id, prepDate: '2026-09-13' });
    expect(result.ok).toBe(false);
  });
});

describe('setCookingYield', () => {
  it('sets a yield by hand and logs it', async () => {
    const result = await prep.setCookingYield({ foodId: fixture.foods.chicken!, yieldPct: 82 });
    expect(result.ok).toBe(true);

    const food = await testPrisma().food.findUniqueOrThrow({ where: { id: fixture.foods.chicken! } });
    expect(food.cookingYieldPct).toBe(82);

    const logged = await testPrisma().cookingYield.findFirst({
      where: { foodId: fixture.foods.chicken!, source: 'MANUAL' },
    });
    expect(logged?.yieldPct).toBe(82);
  });

  it('rejects a zero yield', async () => {
    const result = await prep.setCookingYield({ foodId: fixture.foods.chicken!, yieldPct: 0 });
    expect(result.ok).toBe(false);
  });
});
