import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma';
import { hashPassword } from '@/lib/auth/password';

/**
 * A Prisma client bound to the test database, plus a fixture that builds the
 * same shape of data the seed produces: two day types, a handful of foods, an
 * option group and a plan.
 */

let client: PrismaClient | null = null;

export function testPrisma(): PrismaClient {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set for tests.');
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return client;
}

/** Wipes every table. Ordered by the schema's own dependency graph via CASCADE. */
export async function resetDatabase(): Promise<void> {
  const prisma = testPrisma();
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export interface Fixture {
  userId: string;
  trainingId: string;
  restId: string;
  mealPlanId: string;
  foods: Record<string, string>;
  groupId: string;
  mealIds: Record<string, string>;
}

/**
 * Builds a compact version of the default plan:
 *   Meal A: rice (225/175 cooked) + protein group (175/175 cooked)
 *   Meal B: rice (150/0 cooked) + 2/1 bagels
 */
export async function createFixture(): Promise<Fixture> {
  const prisma = testPrisma();

  const user = await prisma.user.create({
    data: {
      username: 'tester',
      passwordHash: await hashPassword('test-password'),
      settings: {
        create: {
          firstMealTime: '13:00',
          mealIntervalMinutes: 150,
          workoutTime: '19:30',
          bedtime: '01:00',
          preWorkoutMinutes: 120,
          postWorkoutMinutes: 30,
          waterTargetMl: 4000,
          fridgeDays: 3,
          defaultPortionG: 175,
        },
      },
    },
  });

  const training = await prisma.dayType.create({
    data: { userId: user.id, key: 'training', name: 'Training', isTraining: true, isDefault: true },
  });
  const rest = await prisma.dayType.create({
    data: { userId: user.id, key: 'rest', name: 'Rest', sortOrder: 1 },
  });

  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
    await prisma.scheduleDay.create({
      data: { userId: user.id, dayOfWeek, dayTypeId: dayOfWeek <= 5 ? training.id : rest.id },
    });
  }

  const rice = await prisma.food.create({
    data: {
      userId: user.id,
      name: 'White rice',
      category: 'CARBOHYDRATE',
      defaultUnit: 'g',
      department: 'Dry Goods',
      tracksYield: true,
      cookingYieldPct: 300,
      packageSize: 5000,
      packageUnit: 'g',
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
    },
  });

  const chicken = await prisma.food.create({
    data: {
      userId: user.id,
      name: 'Chicken breast',
      category: 'PROTEIN',
      defaultUnit: 'g',
      department: 'Meat & Seafood',
      tracksYield: true,
      cookingYieldPct: 75,
      packageSize: 1000,
      packageUnit: 'g',
      calories: 165,
      protein: 31,
    },
  });

  const turkey = await prisma.food.create({
    data: {
      userId: user.id,
      name: 'Ground turkey',
      category: 'PROTEIN',
      defaultUnit: 'g',
      department: 'Meat & Seafood',
      tracksYield: true,
      cookingYieldPct: 78,
      packageSize: 500,
      packageUnit: 'g',
    },
  });

  const bagels = await prisma.food.create({
    data: {
      userId: user.id,
      name: 'Bagels',
      category: 'CARBOHYDRATE',
      defaultUnit: 'each',
      department: 'Bakery',
      packageSize: 6,
      packageUnit: 'each',
    },
  });

  const group = await prisma.foodOptionGroup.create({
    data: {
      userId: user.id,
      name: 'Meal protein',
      preferredFoodId: chicken.id,
      members: {
        create: [
          { foodId: chicken.id, sortOrder: 0 },
          { foodId: turkey.id, sortOrder: 1 },
        ],
      },
    },
  });

  const plan = await prisma.mealPlan.create({
    data: { userId: user.id, name: 'Test plan', isActive: true },
  });

  const mealA = await prisma.meal.create({
    data: {
      mealPlanId: plan.id,
      name: 'Meal A',
      sortOrder: 0,
      defaultTime: '13:00',
      dayTypeSettings: {
        create: [
          { dayTypeId: training.id, included: true },
          { dayTypeId: rest.id, included: true },
        ],
      },
      ingredients: {
        create: [
          {
            foodId: rice.id,
            unit: 'g',
            state: 'COOKED',
            sortOrder: 0,
            quantities: {
              create: [
                { dayTypeId: training.id, quantity: 225 },
                { dayTypeId: rest.id, quantity: 175 },
              ],
            },
          },
          {
            optionGroupId: group.id,
            unit: 'g',
            state: 'COOKED',
            sortOrder: 1,
            quantities: {
              create: [
                { dayTypeId: training.id, quantity: 175 },
                { dayTypeId: rest.id, quantity: 175 },
              ],
            },
          },
        ],
      },
    },
  });

  const mealB = await prisma.meal.create({
    data: {
      mealPlanId: plan.id,
      name: 'Meal B',
      sortOrder: 1,
      defaultTime: '19:00',
      dayTypeSettings: {
        create: [
          { dayTypeId: training.id, included: true },
          { dayTypeId: rest.id, included: true },
        ],
      },
      ingredients: {
        create: [
          {
            foodId: rice.id,
            unit: 'g',
            state: 'COOKED',
            sortOrder: 0,
            quantities: {
              create: [
                { dayTypeId: training.id, quantity: 150 },
                // No rice on rest days.
                { dayTypeId: rest.id, quantity: 0 },
              ],
            },
          },
          {
            foodId: bagels.id,
            unit: 'each',
            state: 'AS_IS',
            sortOrder: 1,
            quantities: {
              create: [
                { dayTypeId: training.id, quantity: 2 },
                { dayTypeId: rest.id, quantity: 1 },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.supplement.create({
    data: {
      userId: user.id,
      name: 'Creatine',
      dosageAmount: 5,
      dosageUnit: 'g',
      countPerDose: 1,
      form: 'SCOOP',
      schedules: { create: { timing: 'PRE_WORKOUT', applicability: 'EVERY_DAY' } },
    },
  });

  await prisma.supplement.create({
    data: {
      userId: user.id,
      name: 'Intra-workout',
      countPerDose: 1,
      form: 'SCOOP',
      sortOrder: 1,
      schedules: { create: { timing: 'PRE_WORKOUT', applicability: 'TRAINING_ONLY' } },
    },
  });

  return {
    userId: user.id,
    trainingId: training.id,
    restId: rest.id,
    mealPlanId: plan.id,
    groupId: group.id,
    foods: {
      rice: rice.id,
      chicken: chicken.id,
      turkey: turkey.id,
      bagels: bagels.id,
    },
    mealIds: { mealA: mealA.id, mealB: mealB.id },
  };
}
