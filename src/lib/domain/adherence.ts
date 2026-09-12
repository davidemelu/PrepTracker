/**
 * Adherence scoring for a day, a week, and the analytics pages.
 *
 * Rules chosen deliberately:
 *  - A *skipped* meal counts against you. Skipping is an honest record of not
 *    eating it, not an excuse to remove it from the denominator.
 *  - A day with nothing planned scores 100%, not 0%, so a rest day with no
 *    supplements does not drag the week down.
 *  - Water is capped per day at 100%.
 */

import { round } from './units';
import { waterAdherence, type DailyWaterSummary } from './water';

export type CompletableStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED';

export interface CompletableLike {
  status: CompletableStatus;
}

export interface CompletionRatio {
  completed: number;
  total: number;
  percent: number;
}

export function completionRatio(items: readonly CompletableLike[]): CompletionRatio {
  const total = items.length;
  const completed = items.filter((i) => i.status === 'COMPLETED').length;
  return {
    completed,
    total,
    percent: total === 0 ? 100 : round((completed / total) * 100, 1),
  };
}

export interface DayAdherenceInput {
  meals: readonly CompletableLike[];
  supplements: readonly CompletableLike[];
  waterMl: number;
  waterTargetMl: number;
}

export interface DayAdherence {
  meals: CompletionRatio;
  supplements: CompletionRatio;
  water: { totalMl: number; targetMl: number; percent: number };
  /** Equal weighting across the three tracked areas that exist for the day. */
  overallPercent: number;
  isPerfectDay: boolean;
}

export function dayAdherence(input: DayAdherenceInput): DayAdherence {
  const meals = completionRatio(input.meals);
  const supplements = completionRatio(input.supplements);
  const waterPercent =
    input.waterTargetMl > 0
      ? round(Math.min(100, (input.waterMl / input.waterTargetMl) * 100), 1)
      : 100;

  // Only count areas that actually exist for this day.
  const parts: number[] = [];
  if (input.meals.length > 0) parts.push(meals.percent);
  if (input.supplements.length > 0) parts.push(supplements.percent);
  if (input.waterTargetMl > 0) parts.push(waterPercent);

  const overallPercent =
    parts.length === 0 ? 100 : round(parts.reduce((a, b) => a + b, 0) / parts.length, 1);

  return {
    meals,
    supplements,
    water: { totalMl: input.waterMl, targetMl: input.waterTargetMl, percent: waterPercent },
    overallPercent,
    isPerfectDay:
      meals.percent === 100 &&
      supplements.percent === 100 &&
      waterPercent >= 100 &&
      (input.meals.length > 0 || input.supplements.length > 0),
  };
}

export interface DaySummary {
  date: string;
  dayTypeName: string;
  isTraining: boolean;
  meals: readonly (CompletableLike & { name: string; sortOrder: number })[];
  supplements: readonly CompletableLike[];
  waterMl: number;
  waterTargetMl: number;
}

export interface WeekStats {
  days: Array<DaySummary & { adherence: DayAdherence }>;
  mealPercent: number;
  supplementPercent: number;
  waterPercent: number;
  overallPercent: number;
  perfectDays: number;
  missedMeals: number;
  skippedMeals: number;
  plannedMeals: number;
  completedMeals: number;
  /** Meal name missed most often across the period, null when nothing is missed. */
  mostMissedMeal: { name: string; misses: number } | null;
  averageWaterMl: number;
  trainingDayPercent: number | null;
  restDayPercent: number | null;
}

export function weekStats(days: readonly DaySummary[]): WeekStats {
  const withAdherence = days.map((day) => ({
    ...day,
    adherence: dayAdherence({
      meals: day.meals,
      supplements: day.supplements,
      waterMl: day.waterMl,
      waterTargetMl: day.waterTargetMl,
    }),
  }));

  const allMeals = days.flatMap((d) => d.meals);
  const allSupplements = days.flatMap((d) => d.supplements);

  const mealRatio = completionRatio(allMeals);
  const supplementRatio = completionRatio(allSupplements);

  const waterSummaries: DailyWaterSummary[] = days.map((d) => ({
    date: d.date,
    totalMl: d.waterMl,
    targetMl: d.waterTargetMl,
    percent: d.waterTargetMl > 0 ? (d.waterMl / d.waterTargetMl) * 100 : 100,
  }));
  const waterPercent = waterAdherence(waterSummaries);

  // Misses counted per meal name so "Meal 5" can be identified as the weak spot.
  const missesByName = new Map<string, number>();
  for (const day of days) {
    for (const meal of day.meals) {
      if (meal.status !== 'COMPLETED') {
        missesByName.set(meal.name, (missesByName.get(meal.name) ?? 0) + 1);
      }
    }
  }
  let mostMissedMeal: { name: string; misses: number } | null = null;
  for (const [name, misses] of missesByName) {
    if (!mostMissedMeal || misses > mostMissedMeal.misses) mostMissedMeal = { name, misses };
  }

  const averageOf = (subset: typeof withAdherence) =>
    subset.length === 0
      ? null
      : round(subset.reduce((sum, d) => sum + d.adherence.overallPercent, 0) / subset.length, 1);

  const presentParts = [
    allMeals.length > 0 ? mealRatio.percent : null,
    allSupplements.length > 0 ? supplementRatio.percent : null,
    waterSummaries.some((w) => w.targetMl > 0) ? waterPercent : null,
  ].filter((p): p is number => p !== null);

  return {
    days: withAdherence,
    mealPercent: mealRatio.percent,
    supplementPercent: supplementRatio.percent,
    waterPercent,
    overallPercent:
      presentParts.length === 0
        ? 100
        : round(presentParts.reduce((a, b) => a + b, 0) / presentParts.length, 1),
    perfectDays: withAdherence.filter((d) => d.adherence.isPerfectDay).length,
    missedMeals: allMeals.filter((m) => m.status !== 'COMPLETED').length,
    skippedMeals: allMeals.filter((m) => m.status === 'SKIPPED').length,
    plannedMeals: allMeals.length,
    completedMeals: mealRatio.completed,
    mostMissedMeal,
    averageWaterMl:
      days.length === 0 ? 0 : Math.round(days.reduce((s, d) => s + d.waterMl, 0) / days.length),
    trainingDayPercent: averageOf(withAdherence.filter((d) => d.isTraining)),
    restDayPercent: averageOf(withAdherence.filter((d) => !d.isTraining)),
  };
}

/** Completion rate per meal position, for the "which meal do I miss" chart. */
export function completionByMeal(
  days: readonly DaySummary[],
): Array<{ name: string; sortOrder: number; completed: number; planned: number; percent: number }> {
  const byName = new Map<string, { name: string; sortOrder: number; completed: number; planned: number }>();
  for (const day of days) {
    for (const meal of day.meals) {
      const entry = byName.get(meal.name) ?? {
        name: meal.name,
        sortOrder: meal.sortOrder,
        completed: 0,
        planned: 0,
      };
      entry.planned += 1;
      if (meal.status === 'COMPLETED') entry.completed += 1;
      entry.sortOrder = Math.min(entry.sortOrder, meal.sortOrder);
      byName.set(meal.name, entry);
    }
  }
  return [...byName.values()]
    .map((e) => ({ ...e, percent: e.planned === 0 ? 0 : round((e.completed / e.planned) * 100, 1) }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Colour band for an adherence number. Used by badges and rings. */
export function adherenceBand(percent: number): 'great' | 'good' | 'ok' | 'poor' {
  if (percent >= 95) return 'great';
  if (percent >= 80) return 'good';
  if (percent >= 60) return 'ok';
  return 'poor';
}
