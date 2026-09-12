import 'server-only';

import { prisma } from '@/lib/db';

/** Read models for the plan editor. */

export async function getActivePlan(userId: string) {
  return prisma.mealPlan.findFirst({
    where: { userId, isActive: true, archivedAt: null },
    include: {
      meals: {
        orderBy: { sortOrder: 'asc' },
        include: {
          dayTypeSettings: true,
          ingredients: {
            orderBy: { sortOrder: 'asc' },
            include: {
              quantities: true,
              food: { select: { id: true, name: true, defaultUnit: true, category: true } },
              optionGroup: {
                select: {
                  id: true,
                  name: true,
                  preferredFoodId: true,
                  members: {
                    orderBy: { sortOrder: 'asc' },
                    include: { food: { select: { id: true, name: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

export type ActivePlan = NonNullable<Awaited<ReturnType<typeof getActivePlan>>>;
export type PlanMealRow = ActivePlan['meals'][number];

export async function getAllPlans(userId: string) {
  return prisma.mealPlan.findMany({
    where: { userId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    include: { _count: { select: { meals: true } } },
  });
}

export async function getMealForEdit(userId: string, mealId: string) {
  return prisma.meal.findFirst({
    where: { id: mealId, mealPlan: { userId } },
    include: {
      mealPlan: { select: { id: true, name: true } },
      dayTypeSettings: true,
      ingredients: {
        orderBy: { sortOrder: 'asc' },
        include: {
          quantities: true,
          food: { select: { id: true, name: true, defaultUnit: true } },
          optionGroup: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function getFoods(userId: string) {
  return prisma.food.findMany({ where: { userId }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
}

export async function getFoodPickerOptions(userId: string) {
  return prisma.food.findMany({
    where: { userId, active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, defaultUnit: true, category: true },
  });
}

export async function getOptionGroups(userId: string) {
  return prisma.foodOptionGroup.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    include: {
      members: { orderBy: { sortOrder: 'asc' }, include: { food: { select: { id: true, name: true } } } },
      _count: { select: { mealIngredients: true } },
    },
  });
}

export async function getSupplements(userId: string) {
  return prisma.supplement.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    include: { schedules: { include: { meal: { select: { id: true, name: true } } } } },
  });
}

export async function getWeeklySchedule(userId: string) {
  const [dayTypes, days] = await Promise.all([
    prisma.dayType.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } }),
    prisma.scheduleDay.findMany({ where: { userId }, orderBy: { dayOfWeek: 'asc' } }),
  ]);
  return { dayTypes, days };
}

export async function getSettings(userId: string) {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  if (!settings) throw new Error('Settings row is missing for this user.');
  return settings;
}
