import 'server-only';

import { prisma } from '@/lib/db';
import { startOfWeek, toDbDate, type DayKey } from '@/lib/domain/dates';
import {
  generateGroceryList,
  supplementGroceryLines,
  type DayTypeCount,
  type FoodCategoryKey,
  type FoodInfo,
  type GroceryGenerationInput,
  type GroceryLine,
  type IngredientStateKey,
  type PlanMeal,
} from '@/lib/domain/grocery';
import { resolveOptionPreferences } from './day-service';

/**
 * Assembles the inputs the pure grocery generator needs from the database.
 * All arithmetic happens in `domain/grocery`; this file only fetches rows.
 */

export interface GenerateInput {
  userId: string;
  startDate: DayKey;
  daysPlanned: number;
  dayTypeCounts: Array<{ dayTypeId: string; days: number }>;
  applyInventory: boolean;
  includeSupplements: boolean;
  includeOptional: boolean;
}

export async function buildGroceryLines(input: GenerateInput): Promise<{
  lines: GroceryLine[];
  warnings: string[];
}> {
  const { userId } = input;

  const [plan, foods, dayTypes, inventory, supplements, settings] = await Promise.all([
    prisma.mealPlan.findFirst({
      where: { userId, isActive: true, archivedAt: null },
      include: {
        meals: {
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            dayTypeSettings: true,
            ingredients: {
              orderBy: { sortOrder: 'asc' },
              include: { quantities: true, optionGroup: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
    prisma.food.findMany({ where: { userId } }),
    prisma.dayType.findMany({ where: { userId } }),
    input.applyInventory
      ? prisma.inventoryItem.findMany({ where: { userId, quantity: { gt: 0 } } })
      : Promise.resolve([]),
    input.includeSupplements
      ? prisma.supplement.findMany({
          where: { userId, active: true },
          include: { schedules: true },
        })
      : Promise.resolve([]),
    prisma.settings.findUnique({ where: { userId } }),
  ]);

  if (!plan) {
    return { lines: [], warnings: ['No active meal plan, so there is nothing to shop for.'] };
  }

  const foodMap: Record<string, FoodInfo> = Object.fromEntries(
    foods.map((food) => [
      food.id,
      {
        id: food.id,
        name: food.name,
        category: food.category as FoodCategoryKey,
        defaultUnit: food.defaultUnit,
        department: food.department,
        packageSize: food.packageSize,
        packageUnit: food.packageUnit,
        cookingYieldPct: food.cookingYieldPct,
        tracksYield: food.tracksYield,
      } satisfies FoodInfo,
    ]),
  );

  const dayTypeNames = new Map(dayTypes.map((d) => [d.id, d.name]));
  const counts: DayTypeCount[] = input.dayTypeCounts
    .filter((c) => dayTypeNames.has(c.dayTypeId))
    .map((c) => ({
      dayTypeId: c.dayTypeId,
      dayTypeName: dayTypeNames.get(c.dayTypeId)!,
      days: c.days,
    }));

  const meals: PlanMeal[] = plan.meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    includedDayTypeIds: meal.dayTypeSettings.filter((s) => s.included).map((s) => s.dayTypeId),
    ingredients: meal.ingredients.map((ingredient) => ({
      id: ingredient.id,
      foodId: ingredient.foodId,
      optionGroupId: ingredient.optionGroupId,
      optionGroupName: ingredient.optionGroup?.name ?? null,
      unit: ingredient.unit,
      state: ingredient.state as IngredientStateKey,
      required: ingredient.required,
      quantityByDayType: Object.fromEntries(ingredient.quantities.map((q) => [q.dayTypeId, q.quantity])),
    })),
  }));

  const optionPreferences = await resolveOptionPreferences(
    userId,
    startOfWeek(input.startDate, settings?.weekStartsOn ?? 1),
  );

  const generationInput: GroceryGenerationInput = {
    meals,
    dayTypeCounts: counts,
    foods: foodMap,
    optionPreferences,
    includeOptional: input.includeOptional,
    inventory: inventory.map((item) => ({
      foodId: item.foodId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    })),
  };

  const result = generateGroceryList(generationInput);

  const trainingDays = counts
    .filter((c) => dayTypes.find((d) => d.id === c.dayTypeId)?.isTraining)
    .reduce((sum, c) => sum + c.days, 0);
  const restDays = counts.reduce((sum, c) => sum + c.days, 0) - trainingDays;

  const foodsByName = new Map(foods.map((f) => [f.name.toLowerCase(), f]));

  const supplementLines = supplementGroceryLines(
    supplements.flatMap((supplement) =>
      supplement.schedules.map((schedule) => ({
        supplementId: `${supplement.id}:${schedule.id}`,
        name: supplement.name,
        countPerDose: supplement.countPerDose,
        form: supplement.form,
        dosageAmount: supplement.dosageAmount,
        dosageUnit: supplement.dosageUnit,
        applicability: schedule.applicability,
        food: (() => {
          const match = foodsByName.get(supplement.name.toLowerCase());
          return match ? foodMap[match.id] : null;
        })(),
      })),
    ),
    trainingDays,
    restDays,
  );

  return {
    lines: [...result.lines, ...supplementLines],
    warnings: result.warnings,
  };
}

/** Day type counts prefilled from the weekly schedule. */
export async function suggestDayTypeCounts(
  userId: string,
  days: number,
): Promise<Array<{ dayTypeId: string; dayTypeName: string; days: number }>> {
  const [schedule, dayTypes] = await Promise.all([
    prisma.scheduleDay.findMany({ where: { userId } }),
    prisma.dayType.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const counts = new Map<string, number>();
  for (const dayType of dayTypes) counts.set(dayType.id, 0);

  // Walk `days` weekdays through the repeating pattern.
  for (let i = 0; i < days; i += 1) {
    const weekday = (i % 7) + 1;
    const entry = schedule.find((s) => s.dayOfWeek === weekday);
    const id = entry?.dayTypeId ?? dayTypes[0]?.id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return dayTypes.map((dayType) => ({
    dayTypeId: dayType.id,
    dayTypeName: dayType.name,
    days: counts.get(dayType.id) ?? 0,
  }));
}

export function toDbDateSafe(key: DayKey) {
  return toDbDate(key);
}
