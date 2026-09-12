import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, resetDatabase, testPrisma, type Fixture } from './helpers';

/**
 * Backup and restore. The promise this makes is strong — "your data is
 * portable" — so it is worth proving that a round trip reproduces everything,
 * including the journal rows that history depends on.
 */

let fixture: Fixture;
let backup: typeof import('@/lib/backup/core');

beforeAll(async () => {
  backup = await import('@/lib/backup/core');
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
});

/** Adds a logged day, a grocery week and a measured yield to back up. */
async function addHistory() {
  const prisma = testPrisma();

  const plan = await prisma.dailyPlan.create({
    data: {
      userId: fixture.userId,
      date: new Date(Date.UTC(2026, 8, 14)),
      dayTypeId: fixture.trainingId,
      dayTypeName: 'Training',
      dayTypeIsTraining: true,
      mealPlanId: fixture.mealPlanId,
      mealPlanName: 'Test plan',
      waterTargetMl: 4000,
      notes: 'Felt strong.',
      meals: {
        create: {
          sourceMealId: fixture.mealIds.mealA,
          name: 'Meal A',
          sortOrder: 0,
          scheduledTime: '13:00',
          status: 'COMPLETED',
          completedAt: new Date(Date.UTC(2026, 8, 14, 12, 5)),
          items: {
            create: [
              {
                foodId: fixture.foods.rice,
                foodName: 'White rice',
                quantity: 225,
                unit: 'g',
                state: 'COOKED',
                calories: 292.5,
              },
              {
                foodId: fixture.foods.chicken,
                foodName: 'Chicken breast',
                quantity: 175,
                unit: 'g',
                state: 'COOKED',
                calories: 288.75,
              },
            ],
          },
        },
      },
      checkIn: { create: { ratingEnergy: 4, ratingHunger: 2, notes: 'Good day.' } },
    },
  });

  await prisma.waterEntry.create({
    data: {
      userId: fixture.userId,
      dailyPlanId: plan.id,
      date: new Date(Date.UTC(2026, 8, 14)),
      amountMl: 500,
      source: 'QUICK_ADD',
    },
  });

  await prisma.cookingYield.create({
    data: {
      userId: fixture.userId,
      foodId: fixture.foods.chicken,
      foodName: 'Chicken breast',
      yieldPct: 71.5,
      source: 'MEASURED',
      rawWeightG: 2000,
      cookedWeightG: 1430,
    },
  });

  await prisma.workoutFocus.create({
    data: {
      userId: fixture.userId,
      name: 'Chest',
      category: 'MUSCLE_GROUP',
      dailyFocuses: { create: { dailyPlanId: plan.id, name: 'Chest', sortOrder: 0 } },
    },
  });
  await prisma.dailyPlan.update({
    where: { id: plan.id },
    data: { workoutName: 'Push 1' },
  });

  await prisma.groceryWeek.create({
    data: {
      userId: fixture.userId,
      name: 'Week of 2026-09-14',
      startDate: new Date(Date.UTC(2026, 8, 14)),
      endDate: new Date(Date.UTC(2026, 8, 20)),
      items: {
        create: {
          name: 'Chicken breast',
          category: 'PROTEIN',
          requiredQty: 2450,
          requiredUnit: 'g',
          shoppingQty: 3266.67,
          shoppingUnit: 'g',
          purchased: true,
        },
      },
    },
  });

  return plan.id;
}

describe('exportBackup', () => {
  it('includes every table', async () => {
    await addHistory();
    const file = await backup.exportBackupWith(testPrisma(), fixture.userId);

    expect(file.application).toBe('preptracker');
    expect(file.version).toBe(backup.BACKUP_VERSION);

    for (const table of backup.BACKUP_TABLES) {
      expect(file.data[table]).toBeDefined();
    }

    expect(file.data.user).toHaveLength(1);
    expect(file.data.food!.length).toBeGreaterThan(0);
    expect(file.data.dailyMeal).toHaveLength(1);
    expect(file.data.dailyMealItem).toHaveLength(2);
    expect(file.data.waterEntry).toHaveLength(1);
    expect(file.data.cookingYield).toHaveLength(1);
    expect(file.data.dailyCheckIn).toHaveLength(1);

    // Workout tracking must be in the backup too, or a restore would silently
    // drop what you trained.
    expect(file.data.workoutFocus).toHaveLength(1);
    expect(file.data.dailyWorkoutFocus).toHaveLength(1);
  });

  it("does not leak another user’s data", async () => {
    const prisma = testPrisma();
    const other = await prisma.user.create({
      data: { username: 'someone-else', passwordHash: 'x' },
    });
    await prisma.food.create({
      data: { userId: other.id, name: 'Not mine', defaultUnit: 'g' },
    });

    const file = await backup.exportBackupWith(prisma, fixture.userId);
    expect((file.data.food as Array<{ name: string }>).some((f) => f.name === 'Not mine')).toBe(false);
  });
});

describe('restoreBackup', () => {
  it('round-trips through JSON and reproduces the data exactly', async () => {
    const prisma = testPrisma();
    await addHistory();

    const file = await backup.exportBackupWith(prisma, fixture.userId);
    // Through a string, exactly as the file would travel.
    const serialised = JSON.parse(JSON.stringify(file));

    // Wreck the current state. Meal ingredients go first: a food the plan still
    // uses cannot be deleted, which is the point of the Restrict constraint.
    await prisma.mealCompletion.deleteMany({});
    await prisma.dailyPlan.deleteMany({ where: { userId: fixture.userId } });
    await prisma.mealIngredient.deleteMany({});
    await prisma.food.deleteMany({ where: { userId: fixture.userId } });
    expect(await prisma.food.count({ where: { userId: fixture.userId } })).toBe(0);

    const result = await backup.restoreBackupWith(prisma, fixture.userId, serialised);
    expect(result.total).toBeGreaterThan(0);

    const meals = await prisma.dailyMeal.findMany({
      where: { dailyPlan: { userId: fixture.userId } },
      include: { items: { orderBy: { foodName: 'asc' } } },
    });

    expect(meals).toHaveLength(1);
    expect(meals[0]!.status).toBe('COMPLETED');
    expect(meals[0]!.items.map((i) => [i.foodName, i.quantity])).toEqual([
      ['Chicken breast', 175],
      ['White rice', 225],
    ]);

    // Dates survive the JSON round trip as dates, not strings.
    expect(meals[0]!.completedAt).toBeInstanceOf(Date);
    expect(meals[0]!.completedAt?.toISOString()).toBe('2026-09-14T12:05:00.000Z');

    const yields = await prisma.cookingYield.findMany({ where: { userId: fixture.userId } });
    expect(yields.find((y) => y.source === 'MEASURED')?.yieldPct).toBe(71.5);

    const checkIn = await prisma.dailyCheckIn.findFirst();
    expect(checkIn?.ratingEnergy).toBe(4);

    // Workout history comes back with it.
    const focuses = await prisma.dailyWorkoutFocus.findMany();
    expect(focuses.map((f) => f.name)).toEqual(['Chest']);
    const restoredPlan = await prisma.dailyPlan.findFirstOrThrow();
    expect(restoredPlan.workoutName).toBe('Push 1');
  });

  it('restores into a fresh install, re-owning the data to the account doing it', async () => {
    const prisma = testPrisma();
    await addHistory();
    const file = JSON.parse(
      JSON.stringify(await backup.exportBackupWith(prisma, fixture.userId)),
    );

    // Simulate a rebuilt install: wipe everything and seed a different account.
    await resetDatabase();
    const fresh = await prisma.user.create({
      data: { username: 'admin', passwordHash: 'placeholder' },
    });
    expect(fresh.id).not.toBe(fixture.userId);

    const result = await backup.restoreBackupWith(prisma, fresh.id, file);
    expect(result.total).toBeGreaterThan(0);
    expect(result.username).toBe('tester');
    // The file carried a different password hash, so the session cannot stand.
    expect(result.credentialsChanged).toBe(true);

    // One account, and it is the one that ran the restore: the ids in the file
    // are remapped rather than trusted, so a backup can never plant rows owned
    // by somebody else.
    const restored = await prisma.user.findMany();
    expect(restored).toHaveLength(1);
    expect(restored[0]!.id).toBe(fresh.id);
    expect(restored[0]!.username).toBe('tester');

    // Everything hangs off the new id.
    expect(await prisma.dailyPlan.count({ where: { userId: fresh.id } })).toBe(1);
    expect(await prisma.food.count({ where: { userId: fresh.id } })).toBeGreaterThan(0);
    expect(await prisma.dailyMealItem.count()).toBe(2);
    expect(await prisma.groceryItem.count()).toBe(1);
  });

  it('refuses a row belonging to another account instead of writing it', async () => {
    const prisma = testPrisma();
    const file = JSON.parse(
      JSON.stringify(await backup.exportBackupWith(prisma, fixture.userId)),
    );

    const intruder = await prisma.user.create({
      data: { username: 'intruder', passwordHash: 'placeholder' },
    });
    const before = await prisma.food.count({ where: { userId: intruder.id } });

    // A hand-edited file claiming the other account's id.
    for (const food of file.data.food as Array<{ userId: string }>) {
      food.userId = intruder.id;
    }

    await backup.restoreBackupWith(prisma, fixture.userId, file);

    // The claim is ignored: the rows belong to whoever ran the restore.
    expect(await prisma.food.count({ where: { userId: intruder.id } })).toBe(before);
    expect(await prisma.food.count({ where: { userId: fixture.userId } })).toBeGreaterThan(0);
  });

  it('rejects an unknown column before deleting anything', async () => {
    const prisma = testPrisma();
    await addHistory();
    const file = JSON.parse(
      JSON.stringify(await backup.exportBackupWith(prisma, fixture.userId)),
    );
    (file.data.food as Array<Record<string, unknown>>)[0]!.favouriteColour = 'blue';

    await expect(backup.restoreBackupWith(prisma, fixture.userId, file)).rejects.toThrow(
      /"food" rows in this backup have a "favouriteColour" field/,
    );

    // Nothing was touched.
    expect(await prisma.dailyMeal.count()).toBe(1);
    expect(await prisma.food.count({ where: { userId: fixture.userId } })).toBeGreaterThan(0);
  });

  it('rejects a foreign key that points outside the backup', async () => {
    const prisma = testPrisma();
    await addHistory();
    const file = JSON.parse(
      JSON.stringify(await backup.exportBackupWith(prisma, fixture.userId)),
    );
    (file.data.dailyMeal as Array<{ dailyPlanId: string }>)[0]!.dailyPlanId = 'somewhere-else';

    await expect(backup.restoreBackupWith(prisma, fixture.userId, file)).rejects.toThrow(
      /"dailyMeal" row points at a "dailyPlan" that is not in this backup/,
    );
    expect(await prisma.dailyMeal.count()).toBe(1);
  });

  it('rejects a value of the wrong type without naming it', async () => {
    const prisma = testPrisma();
    const file = JSON.parse(
      JSON.stringify(await backup.exportBackupWith(prisma, fixture.userId)),
    );
    (file.data.food as Array<Record<string, unknown>>)[0]!.name = 42;

    await expect(backup.restoreBackupWith(prisma, fixture.userId, file)).rejects.toThrow(
      /"food.name" should be text/,
    );
  });

  it('rejects a file that is not a PrepTracker backup', async () => {
    await expect(
      backup.restoreBackupWith(testPrisma(), fixture.userId, {
        version: 1,
        exportedAt: new Date().toISOString(),
        application: 'something-else' as 'preptracker',
        data: {},
      }),
    ).rejects.toThrow(/not a PrepTracker backup/);
  });

  it('refuses a backup from a newer version of the app', async () => {
    await expect(
      backup.restoreBackupWith(testPrisma(), fixture.userId, {
        version: backup.BACKUP_VERSION + 1,
        exportedAt: new Date().toISOString(),
        application: 'preptracker',
        data: {},
      }),
    ).rejects.toThrow(/newer version/);
  });

  it('leaves the existing data alone when the restore fails', async () => {
    const prisma = testPrisma();
    await addHistory();

    const file = JSON.parse(
      JSON.stringify(await backup.exportBackupWith(prisma, fixture.userId)),
    );
    // A row that violates a foreign key aborts the transaction.
    (file.data.dailyMeal as Array<{ dailyPlanId: string }>)[0]!.dailyPlanId = 'does-not-exist';

    await expect(backup.restoreBackupWith(prisma, fixture.userId, file)).rejects.toThrow();

    // The transaction rolled back, so the original data is still there.
    expect(await prisma.dailyMealItem.count()).toBe(2);
    expect(await prisma.food.count({ where: { userId: fixture.userId } })).toBeGreaterThan(0);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    const csv = backup.toCsv([
      { name: 'Chicken, breast', note: 'He said "fine"', extra: 'line\nbreak' },
    ]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('name,note,extra');
    expect(row).toBe('"Chicken, breast","He said ""fine""","line\nbreak"');
  });

  it('unions columns across rows and leaves gaps empty', () => {
    const csv = backup.toCsv([{ a: 1 }, { b: 2 }]);
    expect(csv).toBe('a,b\r\n1,\r\n,2');
  });

  it('returns an empty string for no rows', () => {
    expect(backup.toCsv([])).toBe('');
  });
});
