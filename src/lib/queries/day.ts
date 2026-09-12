import 'server-only';

import { prisma } from '@/lib/db';
import { fromDbDate, toDbDate, type DayKey } from '@/lib/domain/dates';
import { dayAdherence, type DayAdherence } from '@/lib/domain/adherence';
import { sumMacros, type MacroTotals, type Macros } from '@/lib/domain/nutrition';
import { waterProgress, type WaterProgress } from '@/lib/domain/water';
import type { IngredientStateKey } from '@/lib/domain/grocery';
import type { SupplementTimingKey } from '@/lib/domain/materialise';
import type { DayWorkout, WorkoutFocusLike, WorkoutFocusCategoryKey } from '@/lib/domain/workout';
import { ensureDailyPlan } from '@/lib/server/day-service';

/**
 * Read model for a single day. Everything the Today screen needs in one query
 * plus the derived numbers, computed by the pure domain layer.
 */

export interface DayItemView {
  id: string;
  foodId: string | null;
  foodName: string;
  quantity: number;
  unit: string;
  state: IngredientStateKey;
  required: boolean;
  optionGroupId: string | null;
  optionGroupName: string | null;
  isSubstituted: boolean;
  isQuantityOverridden: boolean;
  macros: Macros;
  notes: string | null;
}

export interface DayMealView {
  id: string;
  sourceMealId: string | null;
  name: string;
  sortOrder: number;
  scheduledTime: string | null;
  windowMinutes: number | null;
  isPreWorkout: boolean;
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  completedAt: Date | null;
  /** When it was actually eaten, "HH:mm". Editable; planned time is not. */
  actualTime: string | null;
  notes: string | null;
  items: DayItemView[];
  macros: MacroTotals;
}

export interface DaySupplementView {
  id: string;
  supplementId: string | null;
  name: string;
  dosageAmount: number | null;
  dosageUnit: string | null;
  countPerDose: number;
  form: string;
  timing: SupplementTimingKey;
  timingLabel: string;
  timeOfDay: string | null;
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  completedAt: Date | null;
}

export interface DayView {
  id: string;
  date: DayKey;
  dayTypeId: string | null;
  dayTypeName: string;
  isTraining: boolean;
  mealPlanName: string;
  workoutTime: string | null;
  /** What was trained. Empty on a rest day, or a training day not yet filled in. */
  workout: DayWorkout;
  notes: string | null;
  meals: DayMealView[];
  supplements: DaySupplementView[];
  water: WaterProgress & { entries: Array<{ id: string; amountMl: number; createdAt: Date; note: string | null }> };
  macros: MacroTotals;
  adherence: DayAdherence;
  checkIn: {
    ratingHunger: number | null;
    ratingEnergy: number | null;
    ratingTraining: number | null;
    ratingAdherence: number | null;
    digestionNote: string | null;
    workoutNote: string | null;
    mealDifficultyNote: string | null;
    prepIssueNote: string | null;
    notes: string | null;
  } | null;
}

const dayInclude = {
  meals: {
    orderBy: { sortOrder: 'asc' },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  },
  supplements: { orderBy: { sortOrder: 'asc' } },
  waterEntries: { orderBy: { createdAt: 'asc' } },
  checkIn: true,
  workoutFocuses: { orderBy: { sortOrder: 'asc' } },
} as const;

/** Loads a day, materialising it from the plan the first time it is opened. */
export async function getDayView(userId: string, date: DayKey): Promise<DayView> {
  await ensureDailyPlan(userId, date);

  const plan = await prisma.dailyPlan.findUnique({
    where: { userId_date: { userId, date: toDbDate(date) } },
    include: dayInclude,
  });

  if (!plan) throw new Error(`Could not load the plan for ${date}.`);

  const meals: DayMealView[] = plan.meals.map((meal) => {
    const items: DayItemView[] = meal.items.map((item) => ({
      id: item.id,
      foodId: item.foodId,
      foodName: item.foodName,
      quantity: item.quantity,
      unit: item.unit,
      state: item.state as IngredientStateKey,
      required: item.required,
      optionGroupId: item.optionGroupId,
      optionGroupName: item.optionGroupName,
      isSubstituted: item.isSubstituted,
      isQuantityOverridden: item.isQuantityOverridden,
      macros: {
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fibre: item.fibre,
        sodium: item.sodium,
      },
      notes: item.notes,
    }));

    return {
      id: meal.id,
      sourceMealId: meal.sourceMealId,
      name: meal.name,
      sortOrder: meal.sortOrder,
      scheduledTime: meal.scheduledTime,
      windowMinutes: meal.windowMinutes,
      isPreWorkout: meal.isPreWorkout,
      status: meal.status,
      completedAt: meal.completedAt,
      actualTime: meal.actualTime,
      notes: meal.notes,
      items,
      macros: sumMacros(items.map((i) => ({ name: i.foodName, macros: i.macros }))),
    };
  });

  const water = waterProgress(plan.waterEntries, plan.waterTargetMl);

  return {
    id: plan.id,
    date: fromDbDate(plan.date),
    dayTypeId: plan.dayTypeId,
    dayTypeName: plan.dayTypeName,
    isTraining: plan.dayTypeIsTraining,
    mealPlanName: plan.mealPlanName,
    workoutTime: plan.workoutTime,
    workout: {
      workoutName: plan.workoutName,
      focusNames: plan.workoutFocuses.map((f) => f.name),
    },
    notes: plan.notes,
    meals,
    supplements: plan.supplements.map((s) => ({
      id: s.id,
      supplementId: s.supplementId,
      name: s.name,
      dosageAmount: s.dosageAmount,
      dosageUnit: s.dosageUnit,
      countPerDose: s.countPerDose,
      form: s.form,
      timing: s.timing as SupplementTimingKey,
      timingLabel: s.timingLabel,
      timeOfDay: s.timeOfDay,
      status: s.status,
      completedAt: s.completedAt,
    })),
    water: {
      ...water,
      entries: plan.waterEntries.map((e) => ({
        id: e.id,
        amountMl: e.amountMl,
        createdAt: e.createdAt,
        note: e.note,
      })),
    },
    macros: sumMacros(
      meals.flatMap((meal) => meal.items.map((i) => ({ name: i.foodName, macros: i.macros }))),
    ),
    adherence: dayAdherence({
      meals: plan.meals,
      supplements: plan.supplements,
      waterMl: water.totalMl,
      waterTargetMl: plan.waterTargetMl,
    }),
    checkIn: plan.checkIn
      ? {
          ratingHunger: plan.checkIn.ratingHunger,
          ratingEnergy: plan.checkIn.ratingEnergy,
          ratingTraining: plan.checkIn.ratingTraining,
          ratingAdherence: plan.checkIn.ratingAdherence,
          digestionNote: plan.checkIn.digestionNote,
          workoutNote: plan.checkIn.workoutNote,
          mealDifficultyNote: plan.checkIn.mealDifficultyNote,
          prepIssueNote: plan.checkIn.prepIssueNote,
          notes: plan.checkIn.notes,
        }
      : null,
  };
}

/** Day types available for the day-type switcher. */
export async function getDayTypes(userId: string) {
  return prisma.dayType.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } });
}

/** Option group members, so a meal card can offer today's alternatives. */
export async function getSubstitutionOptions(userId: string) {
  const groups = await prisma.foodOptionGroup.findMany({
    where: { userId },
    include: {
      members: {
        orderBy: { sortOrder: 'asc' },
        include: { food: { select: { id: true, name: true, active: true } } },
      },
    },
  });

  return Object.fromEntries(
    groups.map((group) => [
      group.id,
      {
        id: group.id,
        name: group.name,
        options: group.members
          .filter((m) => m.food.active)
          .map((m) => ({ id: m.food.id, name: m.food.name })),
      },
    ]),
  );
}

export type SubstitutionOptionMap = Awaited<ReturnType<typeof getSubstitutionOptions>>;

/** The editable workout catalogue, for the picker on Today. */
export async function getWorkoutFocuses(userId: string): Promise<WorkoutFocusLike[]> {
  const focuses = await prisma.workoutFocus.findMany({
    where: { userId },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  });

  return focuses.map((focus) => ({
    id: focus.id,
    name: focus.name,
    category: focus.category as WorkoutFocusCategoryKey,
    sortOrder: focus.sortOrder,
    active: focus.active,
    preWorkoutMinutes: focus.preWorkoutMinutes,
  }));
}

/** The focus ids currently selected on a date, for pre-filling the picker. */
export async function getDayFocusIds(userId: string, date: string): Promise<string[]> {
  const { toDbDate } = await import('@/lib/domain/dates');
  const plan = await prisma.dailyPlan.findUnique({
    where: { userId_date: { userId, date: toDbDate(date) } },
    select: { workoutFocuses: { orderBy: { sortOrder: 'asc' }, select: { focusId: true } } },
  });

  return (plan?.workoutFocuses ?? [])
    .map((f) => f.focusId)
    .filter((id): id is string => id !== null);
}
