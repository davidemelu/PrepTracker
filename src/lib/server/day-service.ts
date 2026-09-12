import 'server-only';

import type { Prisma, PrismaClient } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import { fromDbDate, isoWeekday, startOfWeek, toDbDate, type DayKey } from '@/lib/domain/dates';
import {
  materialiseDay,
  materialiseSupplements,
  SUPPLEMENT_TIMING_LABELS,
  type MaterialiseFood,
  type MaterialiseMeal,
  type SupplementLike,
  type SupplementTimingKey,
} from '@/lib/domain/materialise';
import type { FoodCategoryKey, IngredientStateKey } from '@/lib/domain/grocery';
import { generateMealTimes } from '@/lib/domain/schedule';
import { effectivePreWorkoutMinutes, type WorkoutFocusLike } from '@/lib/domain/workout';

/**
 * Turning the plan into a stored day.
 *
 * The one place in the codebase that writes `daily_*` rows. Everything it
 * writes is a snapshot; once a day exists it is never silently regenerated,
 * because doing so would rewrite history.
 */

export interface OptionPreferenceMap {
  [optionGroupId: string]: string;
}

/**
 * Resolve which food each option group means for a given week.
 * Week preference wins, then the group default, then the first member.
 */
export async function resolveOptionPreferences(
  userId: string,
  weekStart: DayKey,
): Promise<OptionPreferenceMap> {
  const [groups, weekPrefs] = await Promise.all([
    prisma.foodOptionGroup.findMany({
      where: { userId },
      include: { members: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    }),
    prisma.planWeekPreference.findMany({ where: { userId, weekStart: toDbDate(weekStart) } }),
  ]);

  const map: OptionPreferenceMap = {};
  for (const group of groups) {
    const fallback = group.preferredFoodId ?? group.members[0]?.foodId;
    if (fallback) map[group.id] = fallback;
  }
  for (const pref of weekPrefs) {
    map[pref.optionGroupId] = pref.foodId;
  }
  return map;
}

/** The active plan with everything needed to materialise a day. */
async function loadActivePlan(userId: string) {
  return prisma.mealPlan.findFirst({
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
  });
}

type ActivePlan = NonNullable<Awaited<ReturnType<typeof loadActivePlan>>>;

function toMaterialiseMeals(plan: ActivePlan): MaterialiseMeal[] {
  return plan.meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    sortOrder: meal.sortOrder,
    defaultTime: meal.defaultTime,
    windowMinutes: meal.windowMinutes,
    isPreWorkout: meal.isPreWorkout,
    isPostWorkout: meal.isPostWorkout,
    includedDayTypeIds: meal.dayTypeSettings.filter((s) => s.included).map((s) => s.dayTypeId),
    timeOverrides: Object.fromEntries(
      meal.dayTypeSettings.map((s) => [s.dayTypeId, s.timeOverride ?? null]),
    ),
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
}

async function loadFoodMap(userId: string): Promise<Record<string, MaterialiseFood>> {
  const foods = await prisma.food.findMany({ where: { userId } });
  return Object.fromEntries(
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
        nutrition: {
          basisQty: food.nutritionBasisQty,
          basisUnit: food.nutritionBasisUnit,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          fibre: food.fibre,
          sodium: food.sodium,
        },
      } satisfies MaterialiseFood,
    ]),
  );
}

async function loadSupplements(userId: string): Promise<SupplementLike[]> {
  const supplements = await prisma.supplement.findMany({
    where: { userId, active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      schedules: { orderBy: { sortOrder: 'asc' }, include: { meal: { select: { name: true } } } },
    },
  });

  return supplements.map((s) => ({
    id: s.id,
    name: s.name,
    dosageAmount: s.dosageAmount,
    dosageUnit: s.dosageUnit,
    countPerDose: s.countPerDose,
    form: s.form,
    active: s.active,
    sortOrder: s.sortOrder,
    schedules: s.schedules.map((schedule) => ({
      id: schedule.id,
      timing: schedule.timing as SupplementTimingKey,
      applicability: schedule.applicability,
      mealId: schedule.mealId,
      mealName: schedule.meal?.name ?? null,
      timeOfDay: schedule.timeOfDay,
      sortOrder: schedule.sortOrder,
    })),
  }));
}

/**
 * The meal times for one day, derived from the timing rules.
 *
 * Computed per day rather than copied from each meal's stored default, because
 * the answer depends on the day: a rest day has no workout to eat around, and a
 * session that includes legs wants a longer gap before the pre-workout meal
 * than a pressing session does.
 */
export function computeDayTimes(input: {
  meals: readonly MaterialiseMeal[];
  dayTypeId: string;
  isTraining: boolean;
  settings: {
    firstMealTime: string;
    mealIntervalMinutes: number;
    mealIntervalMaxMinutes: number;
    mealDurationMinutes: number;
    workoutTime: string;
    workoutDurationMinutes: number;
    lastMealEarliest: string;
    lastMealLatest: string;
    bedtime: string;
    preWorkoutMinutes: number;
    postWorkoutMinutes: number;
  };
  /**
   * When this day's session is at a different time from the usual one. Gym time
   * varies, and the pre-workout meal follows whatever was actually chosen.
   */
  workoutTime?: string | null;
  /** The focuses recorded for the day, for the pre-workout adjustment. */
  focuses: readonly Pick<WorkoutFocusLike, 'preWorkoutMinutes'>[];
}): { times: Record<string, string>; warnings: string[] } {
  const applicable = input.meals.filter((meal) =>
    meal.includedDayTypeIds.includes(input.dayTypeId),
  );

  const result = generateMealTimes(
    applicable.map((meal) => ({
      id: meal.id,
      name: meal.name,
      sortOrder: meal.sortOrder,
      isPreWorkout: meal.isPreWorkout,
      isPostWorkout: meal.isPostWorkout ?? false,
      windowMinutes: meal.windowMinutes,
      // Per-day-type time overrides stay authoritative even when generating.
      manualTime: meal.timeOverrides?.[input.dayTypeId] ?? null,
    })),
    {
      ...input.settings,
      workoutTime: input.workoutTime ?? input.settings.workoutTime,
      preWorkoutMinutes: effectivePreWorkoutMinutes(
        input.settings.preWorkoutMinutes,
        input.focuses,
      ),
      hasWorkout: input.isTraining,
    },
  );

  return {
    times: Object.fromEntries(result.meals.map((meal) => [meal.mealId, meal.time])),
    warnings: result.warnings,
  };
}

/** Anything that can run a query: the client itself or a transaction handle. */
type Queryable = Pick<PrismaClient, 'scheduleDay' | 'dayType'>;
type ScheduleQueryable = Pick<PrismaClient, 'scheduleDay'>;

/**
 * The weekly default workout for a date's weekday, if one is configured.
 * Copied onto the day when it is first generated; never re-applied afterwards,
 * so editing the weekly pattern cannot rewrite a day you already trained.
 */
async function resolveScheduledWorkout(userId: string, date: DayKey, client: ScheduleQueryable = prisma) {
  const scheduled = await client.scheduleDay.findUnique({
    where: { userId_dayOfWeek: { userId, dayOfWeek: isoWeekday(date) } },
    include: { focuses: { orderBy: { sortOrder: 'asc' }, include: { focus: true } } },
  });

  if (!scheduled) return { workoutName: null, focuses: [] as Array<{ id: string; name: string }> };

  return {
    workoutName: scheduled.workoutName,
    focuses: scheduled.focuses.map((entry) => ({ id: entry.focusId, name: entry.focus.name })),
  };
}

/** The day type that a date should use, from the weekly pattern. */
async function resolveDayType(userId: string, date: DayKey, client: Queryable = prisma) {
  const weekday = isoWeekday(date);
  const scheduled = await client.scheduleDay.findUnique({
    where: { userId_dayOfWeek: { userId, dayOfWeek: weekday } },
    include: { dayType: true },
  });
  if (scheduled?.dayType) return scheduled.dayType;

  return client.dayType.findFirst({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  });
}

export interface EnsureDayOptions {
  /** Force a specific day type instead of the weekly pattern. */
  dayTypeId?: string;
  /** Rebuild the day even if it already exists. */
  regenerate?: boolean;
}

/**
 * Get a day, creating it from the active plan the first time it is opened.
 *
 * Rebuilding reconciles in place rather than deleting and re-inserting, because
 * a row that carries any record of what you did is history:
 *
 *   - a meal still pending is re-timed and re-portioned from the current plan;
 *   - a meal eaten or skipped keeps its items, times and name exactly as logged;
 *   - a meal the new day type no longer includes is removed only when it is
 *     pending and nothing was ever recorded against it — otherwise it stays, so
 *     switching to a rest day after lunch cannot erase lunch;
 *   - `meal_completions` and `supplement_completions` are never touched, which
 *     the database now enforces with `onDelete: Restrict`.
 *
 * There is deliberately no option to rewrite a logged meal. To re-portion one,
 * undo the completion first: that returns it to pending and leaves the audit
 * trail intact.
 */
export async function ensureDailyPlan(userId: string, date: DayKey, options: EnsureDayOptions = {}) {
  // Fast path, no lock: by far the most common case is a day that already
  // exists and needs nothing done to it.
  const quick = await prisma.dailyPlan.findUnique({
    where: { userId_date: { userId, date: toDbDate(date) } },
    select: { id: true, dayTypeId: true },
  });
  if (
    quick &&
    !options.regenerate &&
    (!options.dayTypeId || quick.dayTypeId === options.dayTypeId)
  ) {
    return quick.id;
  }

  // Load everything that does not depend on the current state of the day, so
  // the lock below is held for as short a time as possible.
  const [plan, settings, foods, supplements] = await Promise.all([
    loadActivePlan(userId),
    prisma.settings.findUnique({ where: { userId } }),
    loadFoodMap(userId),
    loadSupplements(userId),
  ]);

  const optionPreferences = await resolveOptionPreferences(userId, startOfWeek(date, settings?.weekStartsOn ?? 1));

  return prisma.$transaction(
    async (tx) => {
      /*
       * Serialise materialisation per (user, date).
       *
       * Without this, two requests for the same day that has not been generated
       * yet both see "no plan" and both insert, and the loser hits the
       * daily_plans_userId_date_key unique index. That is not hypothetical: the
       * Today screen links to the previous and next day, Next prefetches those
       * links, and a navigation racing its own prefetch is enough to trigger it.
       *
       * The lock is held until the transaction ends, so the second request waits
       * and then takes the "already exists" path below.
       */
      // $executeRaw, not $queryRaw: the function returns void, which has no
      // Prisma type to deserialize into.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`daily-plan:${userId}:${date}`}, 0))`;

      // Re-read inside the lock: another request may have created the day while
      // we were waiting for it.
      // The completion counts decide whether a row that has fallen out of the
      // plan may be removed: anything with a recorded action is kept.
      const existing = await tx.dailyPlan.findUnique({
        where: { userId_date: { userId, date: toDbDate(date) } },
        include: {
          meals: {
            include: { items: true, _count: { select: { completions: true } } },
          },
          supplements: { include: { _count: { select: { completions: true } } } },
        },
      });

      const sameDayType = !options.dayTypeId || existing?.dayTypeId === options.dayTypeId;
      if (existing && !options.regenerate && sameDayType) return existing.id;

      const dayType = options.dayTypeId
        ? await tx.dayType.findFirst({ where: { id: options.dayTypeId, userId } })
        : ((existing?.dayTypeId
            ? await tx.dayType.findFirst({ where: { id: existing.dayTypeId, userId } })
            : null) ?? (await resolveDayType(userId, date, tx)));

      if (!dayType) {
        throw new Error('No day types are set up yet. Add one under Plan → Day types.');
      }

      const planMeals = plan ? toMaterialiseMeals(plan) : [];

      // A brand new training day starts from this weekday's usual workout. An
      // existing day keeps whatever it already recorded, even across a rebuild.
      // Resolved before the times below, because the focuses decide how long
      // before training the pre-workout meal sits.
      const scheduledWorkout =
        !existing && dayType.isTraining
          ? await resolveScheduledWorkout(userId, date, tx)
          : { workoutName: null, focuses: [] as Array<{ id: string; name: string }> };

      // Times are computed for this specific day so they cascade from the first
      // meal and respond to what is being trained. The focuses are whatever the
      // day already has, or the weekly default for a day being created now.
      const focusIdsForTiming = existing
        ? (
            await tx.dailyWorkoutFocus.findMany({
              where: { dailyPlanId: existing.id },
              select: { focusId: true },
            })
          )
            .map((f) => f.focusId)
            .filter((id): id is string => id !== null)
        : scheduledWorkout.focuses.map((f) => f.id);

      const timingFocuses =
        focusIdsForTiming.length > 0
          ? await tx.workoutFocus.findMany({
              where: { id: { in: focusIdsForTiming } },
              select: { preWorkoutMinutes: true },
            })
          : [];

      // A day that already exists keeps the session time it was given, because
      // "I'm training at 17:00 today" must survive a rebuild. A new day starts
      // from the usual time.
      const dayWorkoutTime = dayType.isTraining
        ? (existing?.workoutTime ?? settings?.workoutTime ?? null)
        : null;

      const generated =
        settings && settings.autoScheduleMeals && planMeals.length > 0
          ? computeDayTimes({
              meals: planMeals,
              dayTypeId: dayType.id,
              isTraining: dayType.isTraining,
              settings,
              workoutTime: dayWorkoutTime,
              focuses: timingFocuses,
            })
          : { times: {}, warnings: [] };

      const materialised = plan
        ? materialiseDay({
            meals: planMeals,
            dayTypeId: dayType.id,
            foods,
            optionPreferences,
            generatedTimes: generated.times,
            preferGeneratedTimes: Boolean(settings?.autoScheduleMeals),
          })
        : { meals: [], warnings: [] };

      const doses = materialiseSupplements(supplements, dayType.isTraining);

      const dailyPlan = existing
        ? await tx.dailyPlan.update({
            where: { id: existing.id },
            data: {
              dayTypeId: dayType.id,
              dayTypeName: dayType.name,
              dayTypeIsTraining: dayType.isTraining,
              mealPlanId: plan?.id ?? null,
              mealPlanName: plan?.name ?? 'No plan',
              workoutTime: dayWorkoutTime,
            },
          })
        : await tx.dailyPlan.create({
            data: {
              userId,
              date: toDbDate(date),
              dayTypeId: dayType.id,
              dayTypeName: dayType.name,
              dayTypeIsTraining: dayType.isTraining,
              mealPlanId: plan?.id ?? null,
              mealPlanName: plan?.name ?? 'No plan',
              waterTargetMl: settings?.waterTargetMl ?? 4000,
              workoutTime: dayWorkoutTime,
              workoutName: scheduledWorkout.workoutName,
              workoutFocuses: {
                create: scheduledWorkout.focuses.map((focus, index) => ({
                  focusId: focus.id,
                  name: focus.name,
                  sortOrder: index,
                })),
              },
            },
          });

      /*
       * Reconcile meals in place.
       *
       * Rows are claimed by source meal id, falling back to name for meals
       * whose definition has since been deleted. A claimed row is only ever
       * re-portioned while it is still pending; once something has been
       * recorded against it, the row is the record and is left alone.
       */
      const unclaimedMeals = [...(existing?.meals ?? [])];

      const claimMeal = (sourceMealId: string | null, name: string) => {
        const index = unclaimedMeals.findIndex((m) =>
          sourceMealId && m.sourceMealId ? m.sourceMealId === sourceMealId : m.name === name,
        );
        return index === -1 ? null : unclaimedMeals.splice(index, 1)[0]!;
      };

      const itemRowsFor = (meal: (typeof materialised.meals)[number]) =>
        meal.items.map((item) => ({
          sourceIngredientId: item.sourceIngredientId,
          foodId: item.foodId,
          foodName: item.foodName,
          quantity: item.quantity,
          unit: item.unit,
          state: item.state,
          required: item.required,
          sortOrder: item.sortOrder,
          optionGroupId: item.optionGroupId,
          optionGroupName: item.optionGroupName,
          calories: item.macros.calories,
          protein: item.macros.protein,
          carbs: item.macros.carbs,
          fat: item.macros.fat,
          fibre: item.macros.fibre,
          sodium: item.macros.sodium,
        }));

      for (const meal of materialised.meals) {
        const carried = claimMeal(meal.sourceMealId, meal.name);

        if (!carried) {
          await tx.dailyMeal.create({
            data: {
              dailyPlanId: dailyPlan.id,
              sourceMealId: meal.sourceMealId,
              name: meal.name,
              sortOrder: meal.sortOrder,
              scheduledTime: meal.scheduledTime,
              windowMinutes: meal.windowMinutes,
              isPreWorkout: meal.isPreWorkout,
              items: { create: itemRowsFor(meal) },
            },
          });
          continue;
        }

        if (carried.status !== 'PENDING') {
          // Eaten or skipped: the plate, the times and the name stay as logged.
          // Only the display order follows the plan, which changes nothing about
          // what the record says.
          if (carried.sortOrder !== meal.sortOrder) {
            await tx.dailyMeal.update({
              where: { id: carried.id },
              data: { sortOrder: meal.sortOrder },
            });
          }
          continue;
        }

        await tx.dailyMealItem.deleteMany({ where: { dailyMealId: carried.id } });
        await tx.dailyMeal.update({
          where: { id: carried.id },
          data: {
            sourceMealId: meal.sourceMealId,
            name: meal.name,
            sortOrder: meal.sortOrder,
            scheduledTime: meal.scheduledTime,
            windowMinutes: meal.windowMinutes,
            isPreWorkout: meal.isPreWorkout,
            items: { create: itemRowsFor(meal) },
          },
        });
      }

      // Anything the plan no longer includes. A pending row with nothing
      // recorded against it is simply a plan artefact and goes; everything else
      // stays, because a rest day that follows a training lunch still has to
      // show that lunch.
      for (const orphan of unclaimedMeals) {
        if (orphan.status === 'PENDING' && orphan._count.completions === 0) {
          await tx.dailyMealItem.deleteMany({ where: { dailyMealId: orphan.id } });
          await tx.dailyMeal.delete({ where: { id: orphan.id } });
        }
      }

      // Supplements follow the same rule, keyed by supplement and timing.
      const unclaimedDoses = [...(existing?.supplements ?? [])];

      const claimDose = (supplementId: string | null, name: string, timing: string) => {
        const index = unclaimedDoses.findIndex(
          (d) =>
            d.timing === timing &&
            (supplementId && d.supplementId ? d.supplementId === supplementId : d.name === name),
        );
        return index === -1 ? null : unclaimedDoses.splice(index, 1)[0]!;
      };

      for (const [index, dose] of doses.entries()) {
        const carried = claimDose(dose.supplementId, dose.name, dose.timing);
        const data = {
          supplementId: dose.supplementId,
          name: dose.name,
          dosageAmount: dose.dosageAmount,
          dosageUnit: dose.dosageUnit,
          countPerDose: dose.countPerDose,
          form: dose.form as Prisma.DailySupplementCreateInput['form'],
          timing: dose.timing,
          timingLabel: dose.timingLabel,
          timeOfDay: dose.timeOfDay,
          sortOrder: index,
        };

        if (!carried) {
          await tx.dailySupplement.create({ data: { dailyPlanId: dailyPlan.id, ...data } });
          continue;
        }

        // A dose already taken keeps the amount it was taken at; only its place
        // in the list follows the current plan.
        await tx.dailySupplement.update({
          where: { id: carried.id },
          data: carried.status === 'PENDING' ? data : { sortOrder: index },
        });
      }

      for (const orphan of unclaimedDoses) {
        if (orphan.status === 'PENDING' && orphan._count.completions === 0) {
          await tx.dailySupplement.delete({ where: { id: orphan.id } });
        }
      }

      return dailyPlan.id;
    },
    // Generating a day writes a meal per row plus its items; the lock can also
    // make a second request wait for the first to finish.
    { timeout: 30_000 },
  );
}

/**
 * Re-time a day's meals after its workout changes.
 *
 * Adding legs to a session lengthens the pre-workout gap, so the pre-workout
 * meal has to move. Only meals still pending are touched: a meal you have
 * already eaten or skipped keeps the time it was planned for at the time, which
 * is what the record should say.
 */
export async function retimeDay(userId: string, date: DayKey): Promise<number> {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  if (!settings?.autoScheduleMeals) return 0;

  const [plan, dailyPlan] = await Promise.all([
    loadActivePlan(userId),
    prisma.dailyPlan.findUnique({
      where: { userId_date: { userId, date: toDbDate(date) } },
      include: {
        meals: true,
        workoutFocuses: { select: { focusId: true } },
      },
    }),
  ]);

  if (!plan || !dailyPlan || !dailyPlan.dayTypeId) return 0;

  const focusIds = dailyPlan.workoutFocuses
    .map((f) => f.focusId)
    .filter((id): id is string => id !== null);

  const focuses =
    focusIds.length > 0
      ? await prisma.workoutFocus.findMany({
          where: { id: { in: focusIds } },
          select: { preWorkoutMinutes: true },
        })
      : [];

  const { times } = computeDayTimes({
    meals: toMaterialiseMeals(plan),
    dayTypeId: dailyPlan.dayTypeId,
    isTraining: dailyPlan.dayTypeIsTraining,
    settings,
    workoutTime: dailyPlan.workoutTime,
    focuses,
  });

  const updates = dailyPlan.meals
    .filter((meal) => meal.status === 'PENDING' && meal.sourceMealId)
    .map((meal) => ({ meal, time: times[meal.sourceMealId!] }))
    .filter((entry) => entry.time && entry.time !== entry.meal.scheduledTime);

  if (updates.length === 0) return 0;

  await prisma.$transaction(
    updates.map((entry) =>
      prisma.dailyMeal.update({
        where: { id: entry.meal.id },
        data: { scheduledTime: entry.time },
      }),
    ),
  );

  return updates.length;
}

/** Day keys that already have a stored plan, for the weekly tracker. */
export async function existingDayKeys(userId: string, from: DayKey, to: DayKey): Promise<Set<DayKey>> {
  const rows = await prisma.dailyPlan.findMany({
    where: { userId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    select: { date: true },
  });
  return new Set(rows.map((r) => fromDbDate(r.date)));
}

export const SUPPLEMENT_TIMING_LABEL_MAP = SUPPLEMENT_TIMING_LABELS;
