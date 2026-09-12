/**
 * Turning a plan into a concrete day.
 *
 * This is the step that protects history. A DailyPlan is a *snapshot*: every
 * name, quantity, unit and macro is copied out of the plan at the moment the
 * day is generated. Editing the plan afterwards, or deleting a food entirely,
 * cannot change what a past day says you were supposed to eat.
 */

import type { FoodInfo, IngredientStateKey, PlanIngredient, PlanMeal } from './grocery';
import { macrosForQuantity, type Macros, type NutritionSource } from './nutrition';
import { resolveIngredientFood } from './grocery';

export interface MaterialiseFood extends FoodInfo {
  nutrition?: NutritionSource | null;
}

export interface MaterialiseMeal extends PlanMeal {
  sortOrder: number;
  defaultTime?: string | null;
  windowMinutes?: number | null;
  isPreWorkout: boolean;
  isPostWorkout?: boolean;
  /** Per-day-type time override, keyed by day type id. */
  timeOverrides?: Readonly<Record<string, string | null>>;
}

export interface MaterialiseInput {
  meals: readonly MaterialiseMeal[];
  dayTypeId: string;
  foods: Readonly<Record<string, MaterialiseFood>>;
  optionPreferences?: Readonly<Record<string, string>>;
  /** Generated times keyed by meal id. */
  generatedTimes?: Readonly<Record<string, string>>;
  /**
   * When true, generated times win over each meal's stored default. This is
   * what makes the day cascade from the first meal and lets a leg session move
   * the pre-workout meal. A per-day-type override still wins over both.
   */
  preferGeneratedTimes?: boolean;
  includeZeroQuantities?: boolean;
}

export interface MaterialisedItem {
  sourceIngredientId: string | null;
  foodId: string | null;
  foodName: string;
  quantity: number;
  unit: string;
  state: IngredientStateKey;
  required: boolean;
  sortOrder: number;
  optionGroupId: string | null;
  optionGroupName: string | null;
  macros: Macros;
  notes: string | null;
}

export interface MaterialisedMeal {
  sourceMealId: string;
  name: string;
  sortOrder: number;
  scheduledTime: string | null;
  windowMinutes: number | null;
  isPreWorkout: boolean;
  items: MaterialisedItem[];
}

export interface MaterialiseResult {
  meals: MaterialisedMeal[];
  warnings: string[];
}

/**
 * Build the meals for one day.
 *
 * Zero-quantity ingredients (rest-day rice, for instance) are kept out of the
 * day by default but remain in the plan, so switching the day to Training
 * brings them straight back.
 */
export function materialiseDay(input: MaterialiseInput): MaterialiseResult {
  const warnings: string[] = [];
  const optionPreferences = input.optionPreferences ?? {};
  const includeZero = input.includeZeroQuantities ?? false;

  const meals = [...input.meals]
    .filter((meal) => meal.includedDayTypeIds.includes(input.dayTypeId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map<MaterialisedMeal>((meal) => {
      const items: MaterialisedItem[] = [];

      meal.ingredients.forEach((ingredient, index) => {
        const quantity = ingredient.quantityByDayType[input.dayTypeId] ?? 0;
        if (!includeZero && (!Number.isFinite(quantity) || quantity <= 0)) return;

        const foodId = resolveIngredientFood(ingredient, optionPreferences);
        const food = foodId ? input.foods[foodId] : undefined;

        if (!food) {
          warnings.push(
            `${meal.name}: "${ingredient.optionGroupName ?? 'an ingredient'}" has no food selected and was left out of the day.`,
          );
          return;
        }

        items.push({
          sourceIngredientId: ingredient.id,
          foodId: food.id,
          foodName: food.name,
          quantity,
          unit: ingredient.unit,
          state: ingredient.state,
          required: ingredient.required,
          sortOrder: index,
          optionGroupId: ingredient.optionGroupId,
          optionGroupName: ingredient.optionGroupName ?? null,
          macros: macrosForQuantity(food.nutrition ?? null, quantity, ingredient.unit),
          notes: null,
        });
      });

      const override = meal.timeOverrides?.[input.dayTypeId] ?? null;
      const generated = input.generatedTimes?.[meal.id] ?? null;
      const scheduledTime = input.preferGeneratedTimes
        ? (override ?? generated ?? meal.defaultTime ?? null)
        : (override ?? meal.defaultTime ?? generated ?? null);

      return {
        sourceMealId: meal.id,
        name: meal.name,
        sortOrder: meal.sortOrder,
        scheduledTime,
        windowMinutes: meal.windowMinutes ?? null,
        isPreWorkout: meal.isPreWorkout,
        items,
      };
    })
    // A meal whose ingredients are all zero for this day type is not eaten.
    .filter((meal) => meal.items.length > 0);

  return { meals, warnings: [...new Set(warnings)] };
}

export type SupplementTimingKey =
  | 'AM'
  | 'WITH_BREAKFAST'
  | 'AFTER_BREAKFAST'
  | 'PRE_WORKOUT'
  | 'POST_WORKOUT'
  | 'WITH_MEAL'
  | 'EVENING'
  | 'BEFORE_BED'
  | 'ANYTIME';

export const SUPPLEMENT_TIMING_LABELS: Record<SupplementTimingKey, string> = {
  AM: 'Morning',
  WITH_BREAKFAST: 'With breakfast',
  AFTER_BREAKFAST: 'After breakfast',
  PRE_WORKOUT: 'Pre-workout',
  POST_WORKOUT: 'Post-workout',
  WITH_MEAL: 'With a meal',
  EVENING: 'Evening',
  BEFORE_BED: 'Before bed',
  ANYTIME: 'Any time',
};

/** Display order down the Today screen. */
export const SUPPLEMENT_TIMING_ORDER: SupplementTimingKey[] = [
  'AM',
  'WITH_BREAKFAST',
  'AFTER_BREAKFAST',
  'WITH_MEAL',
  'PRE_WORKOUT',
  'POST_WORKOUT',
  'EVENING',
  'BEFORE_BED',
  'ANYTIME',
];

export interface SupplementScheduleLike {
  id: string;
  timing: SupplementTimingKey;
  applicability: 'EVERY_DAY' | 'TRAINING_ONLY' | 'REST_ONLY';
  mealId?: string | null;
  mealName?: string | null;
  timeOfDay?: string | null;
  sortOrder: number;
}

export interface SupplementLike {
  id: string;
  name: string;
  dosageAmount?: number | null;
  dosageUnit?: string | null;
  countPerDose: number;
  form: string;
  active: boolean;
  sortOrder: number;
  schedules: readonly SupplementScheduleLike[];
}

export interface MaterialisedSupplement {
  supplementId: string;
  name: string;
  dosageAmount: number | null;
  dosageUnit: string | null;
  countPerDose: number;
  form: string;
  timing: SupplementTimingKey;
  timingLabel: string;
  timeOfDay: string | null;
  sortOrder: number;
}

/**
 * Expand supplements into today's doses, honouring training/rest applicability.
 * One supplement with two schedules produces two doses.
 */
export function materialiseSupplements(
  supplements: readonly SupplementLike[],
  isTrainingDay: boolean,
): MaterialisedSupplement[] {
  const out: MaterialisedSupplement[] = [];

  for (const supplement of supplements) {
    if (!supplement.active) continue;

    for (const schedule of supplement.schedules) {
      if (schedule.applicability === 'TRAINING_ONLY' && !isTrainingDay) continue;
      if (schedule.applicability === 'REST_ONLY' && isTrainingDay) continue;

      const label = schedule.mealName
        ? `${SUPPLEMENT_TIMING_LABELS[schedule.timing]} · ${schedule.mealName}`
        : SUPPLEMENT_TIMING_LABELS[schedule.timing];

      out.push({
        supplementId: supplement.id,
        name: supplement.name,
        dosageAmount: supplement.dosageAmount ?? null,
        dosageUnit: supplement.dosageUnit ?? null,
        countPerDose: supplement.countPerDose,
        form: supplement.form,
        timing: schedule.timing,
        timingLabel: label,
        timeOfDay: schedule.timeOfDay ?? null,
        sortOrder: schedule.sortOrder,
      });
    }
  }

  return out.sort((a, b) => {
    const ta = SUPPLEMENT_TIMING_ORDER.indexOf(a.timing);
    const tb = SUPPLEMENT_TIMING_ORDER.indexOf(b.timing);
    if (ta !== tb) return ta - tb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

/** "Multivitamin · 1 tablet" / "Vitamin D · 3000 IU" */
export function formatDose(supplement: {
  dosageAmount?: number | null;
  dosageUnit?: string | null;
  countPerDose: number;
  form: string;
}): string {
  const parts: string[] = [];
  if (supplement.dosageAmount != null && supplement.dosageUnit) {
    parts.push(`${supplement.dosageAmount} ${supplement.dosageUnit}`);
  }
  const count = supplement.countPerDose;
  if (count && (count !== 1 || parts.length === 0)) {
    const form = supplement.form.toLowerCase();
    const noun = count === 1 ? form : `${form}s`;
    parts.push(`${count} ${noun}`);
  }
  return parts.join(' · ') || '1 dose';
}

/**
 * A plan ingredient in a form the option-group UI can render: the chosen food
 * plus the alternatives that could replace it today.
 */
export function substitutionChoices(
  ingredient: PlanIngredient,
  groupMembers: readonly string[],
  foods: Readonly<Record<string, FoodInfo>>,
  optionPreferences: Readonly<Record<string, string>> = {},
): { selectedFoodId: string | null; options: FoodInfo[] } {
  const selectedFoodId = resolveIngredientFood(ingredient, optionPreferences);
  const options = groupMembers
    .map((id) => foods[id])
    .filter((f): f is FoodInfo => Boolean(f));
  return { selectedFoodId, options };
}
