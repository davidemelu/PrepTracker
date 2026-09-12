'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { UserFacingError } from '@/lib/errors';
import { requireUserId } from '@/lib/auth/guards';
import { toDbDate, todayKey } from '@/lib/domain/dates';
import { currentTimeString, formatTime12h } from '@/lib/domain/time';
import { macrosForQuantity } from '@/lib/domain/nutrition';
import { ensureDailyPlan } from '@/lib/server/day-service';
import {
  cuid,
  dayKey,
  optionalText,
  optionalTimeString,
  positiveQuantity,
  rating,
} from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

/**
 * Day-level mutations: completing meals, substituting foods, editing today's
 * quantities, notes and the check-in.
 *
 * Every one of these writes to the `daily_*` snapshot, never to the plan, so
 * "just for today" really does mean just for today.
 */

function revalidateDay(date?: string) {
  revalidatePath('/today');
  revalidatePath('/plan/week');
  if (date) revalidatePath(`/today/${date}`);
}

/** Confirms the meal belongs to the signed-in user before touching it. */
async function loadOwnedMeal(userId: string, dailyMealId: string) {
  const meal = await prisma.dailyMeal.findFirst({
    where: { id: dailyMealId, dailyPlan: { userId } },
    include: { dailyPlan: { select: { date: true } } },
  });
  if (!meal) throw new UserFacingError('That meal could not be found.');
  return meal;
}

const mealIdSchema = z.object({ dailyMealId: cuid });

export async function completeMeal(input: { dailyMealId: string }): Promise<ActionResult<undefined>> {
  return runAction(mealIdSchema, input, async ({ dailyMealId }) => {
    const userId = await requireUserId();
    const meal = await loadOwnedMeal(userId, dailyMealId);

    if (meal.status === 'COMPLETED') return ok(undefined, 'Already marked as eaten.');

    // The planned time is never touched. `actualTime` is what you can correct
    // afterwards; `completedAt` stays as the audit record of when it was logged.
    const actualTime = currentTimeString();

    await prisma.$transaction([
      prisma.dailyMeal.update({
        where: { id: dailyMealId },
        data: { status: 'COMPLETED', completedAt: new Date(), actualTime, skippedAt: null },
      }),
      prisma.mealCompletion.create({ data: { dailyMealId, action: 'COMPLETED' } }),
    ]);

    revalidateDay();
    return ok(undefined, `${meal.name} eaten at ${formatTime12h(actualTime)}.`);
  });
}

export async function undoMealCompletion(input: { dailyMealId: string }): Promise<ActionResult<undefined>> {
  return runAction(mealIdSchema, input, async ({ dailyMealId }) => {
    const userId = await requireUserId();
    const meal = await loadOwnedMeal(userId, dailyMealId);

    await prisma.$transaction([
      prisma.dailyMeal.update({
        where: { id: dailyMealId },
        data: { status: 'PENDING', completedAt: null, actualTime: null, skippedAt: null },
      }),
      prisma.mealCompletion.create({
        data: { dailyMealId, action: meal.status === 'SKIPPED' ? 'UNSKIPPED' : 'UNDONE' },
      }),
    ]);

    revalidateDay();
    return ok(undefined, `${meal.name} reset.`);
  });
}

export async function skipMeal(input: { dailyMealId: string; note?: string }): Promise<ActionResult<undefined>> {
  return runAction(mealIdSchema.extend({ note: optionalText }), input, async ({ dailyMealId, note }) => {
    const userId = await requireUserId();
    const meal = await loadOwnedMeal(userId, dailyMealId);

    await prisma.$transaction([
      prisma.dailyMeal.update({
        where: { id: dailyMealId },
        data: {
          status: 'SKIPPED',
          skippedAt: new Date(),
          completedAt: null,
          actualTime: null,
          notes: note ?? meal.notes,
        },
      }),
      prisma.mealCompletion.create({ data: { dailyMealId, action: 'SKIPPED', note: note ?? null } }),
    ]);

    revalidateDay();
    return ok(undefined, `${meal.name} skipped.`);
  });
}

const rescheduleSchema = z.object({
  dailyMealId: cuid,
  scheduledTime: optionalTimeString,
  /** Shift every later meal by the same amount. */
  shiftLater: z.boolean().optional(),
});

export async function rescheduleMeal(input: {
  dailyMealId: string;
  scheduledTime?: string;
  shiftLater?: boolean;
}): Promise<ActionResult<undefined>> {
  return runAction(rescheduleSchema, input, async ({ dailyMealId, scheduledTime, shiftLater }) => {
    const userId = await requireUserId();
    const meal = await loadOwnedMeal(userId, dailyMealId);

    if (!scheduledTime) {
      await prisma.dailyMeal.update({ where: { id: dailyMealId }, data: { scheduledTime: null } });
      revalidateDay();
      return ok(undefined, 'Time cleared.');
    }

    const { timeToMinutes, addMinutes } = await import('@/lib/domain/time');
    const delta = meal.scheduledTime ? timeToMinutes(scheduledTime) - timeToMinutes(meal.scheduledTime) : 0;

    await prisma.$transaction(async (tx) => {
      await tx.dailyMeal.update({ where: { id: dailyMealId }, data: { scheduledTime } });

      if (shiftLater && delta !== 0) {
        const later = await tx.dailyMeal.findMany({
          where: { dailyPlanId: meal.dailyPlanId, sortOrder: { gt: meal.sortOrder } },
        });
        for (const other of later) {
          if (!other.scheduledTime) continue;
          await tx.dailyMeal.update({
            where: { id: other.id },
            data: { scheduledTime: addMinutes(other.scheduledTime, delta) },
          });
        }
      }
    });

    revalidateDay();
    return ok(undefined, shiftLater ? 'Meal and later meals moved.' : 'Meal time updated.');
  });
}

const actualTimeSchema = z.object({
  dailyMealId: cuid,
  /** Empty clears it. */
  actualTime: optionalTimeString,
  /** Mark it eaten at the same time, for logging a meal you forgot. */
  markCompleted: z.boolean().optional(),
});

/**
 * Correct when a meal was actually eaten.
 *
 * For the common case of remembering at 9pm that you ate at 15:47. The planned
 * time is deliberately left alone: the plan said 15:30 and that stays true.
 */
export async function setMealActualTime(input: {
  dailyMealId: string;
  actualTime?: string;
  markCompleted?: boolean;
}): Promise<ActionResult<undefined>> {
  return runAction(actualTimeSchema, input, async ({ dailyMealId, actualTime, markCompleted }) => {
    const userId = await requireUserId();
    const meal = await loadOwnedMeal(userId, dailyMealId);

    if (!actualTime && !markCompleted) {
      await prisma.dailyMeal.update({ where: { id: dailyMealId }, data: { actualTime: null } });
      revalidateDay();
      return ok(undefined, 'Time cleared.');
    }

    const shouldComplete = markCompleted && meal.status !== 'COMPLETED';

    await prisma.$transaction(async (tx) => {
      await tx.dailyMeal.update({
        where: { id: dailyMealId },
        data: {
          actualTime: actualTime ?? null,
          ...(shouldComplete
            ? { status: 'COMPLETED' as const, completedAt: new Date(), skippedAt: null }
            : {}),
        },
      });

      if (shouldComplete) {
        await tx.mealCompletion.create({
          data: { dailyMealId, action: 'COMPLETED', note: 'Logged after the fact.' },
        });
      }
    });

    revalidateDay();
    return ok(
      undefined,
      actualTime ? `${meal.name} recorded as eaten at ${formatTime12h(actualTime)}.` : 'Time cleared.',
    );
  });
}

const substituteSchema = z.object({ dailyMealItemId: cuid, foodId: cuid });

/** Swap an option-group choice for today only. The plan is untouched. */
export async function substituteMealItem(input: {
  dailyMealItemId: string;
  foodId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(substituteSchema, input, async ({ dailyMealItemId, foodId }) => {
    const userId = await requireUserId();

    const item = await prisma.dailyMealItem.findFirst({
      where: { id: dailyMealItemId, dailyMeal: { dailyPlan: { userId } } },
    });
    if (!item) return fail('That meal item could not be found.');

    const food = await prisma.food.findFirst({ where: { id: foodId, userId } });
    if (!food) return fail('That food could not be found.');

    // Macros are re-snapshotted for the new food so the day's totals stay right.
    const macros = macrosForQuantity(
      {
        basisQty: food.nutritionBasisQty,
        basisUnit: food.nutritionBasisUnit,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fibre: food.fibre,
        sodium: food.sodium,
      },
      item.quantity,
      item.unit,
    );

    await prisma.dailyMealItem.update({
      where: { id: dailyMealItemId },
      data: {
        foodId: food.id,
        foodName: food.name,
        isSubstituted: true,
        calories: macros.calories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        fibre: macros.fibre,
        sodium: macros.sodium,
      },
    });

    revalidateDay();
    return ok(undefined, `Swapped to ${food.name} for today.`);
  });
}

const quantitySchema = z.object({ dailyMealItemId: cuid, quantity: positiveQuantity });

/** Change today's amount without editing the permanent plan. */
export async function updateItemQuantity(input: {
  dailyMealItemId: string;
  quantity: number;
}): Promise<ActionResult<undefined>> {
  return runAction(quantitySchema, input, async ({ dailyMealItemId, quantity }) => {
    const userId = await requireUserId();

    const item = await prisma.dailyMealItem.findFirst({
      where: { id: dailyMealItemId, dailyMeal: { dailyPlan: { userId } } },
      include: { food: true },
    });
    if (!item) return fail('That meal item could not be found.');

    const macros = item.food
      ? macrosForQuantity(
          {
            basisQty: item.food.nutritionBasisQty,
            basisUnit: item.food.nutritionBasisUnit,
            calories: item.food.calories,
            protein: item.food.protein,
            carbs: item.food.carbs,
            fat: item.food.fat,
            fibre: item.food.fibre,
            sodium: item.food.sodium,
          },
          quantity,
          item.unit,
        )
      : null;

    await prisma.dailyMealItem.update({
      where: { id: dailyMealItemId },
      data: {
        quantity,
        isQuantityOverridden: true,
        ...(macros
          ? {
              calories: macros.calories,
              protein: macros.protein,
              carbs: macros.carbs,
              fat: macros.fat,
              fibre: macros.fibre,
              sodium: macros.sodium,
            }
          : {}),
      },
    });

    revalidateDay();
    return ok(undefined, 'Amount updated for today only.');
  });
}

const mealNotesSchema = z.object({ dailyMealId: cuid, notes: optionalText });

export async function updateMealNotes(input: {
  dailyMealId: string;
  notes?: string;
}): Promise<ActionResult<undefined>> {
  return runAction(mealNotesSchema, input, async ({ dailyMealId, notes }) => {
    const userId = await requireUserId();
    await loadOwnedMeal(userId, dailyMealId);
    await prisma.dailyMeal.update({ where: { id: dailyMealId }, data: { notes: notes ?? null } });
    revalidateDay();
    return ok(undefined, 'Note saved.');
  });
}

const dayNotesSchema = z.object({ date: dayKey, notes: optionalText });

export async function updateDayNotes(input: { date: string; notes?: string }): Promise<ActionResult<undefined>> {
  return runAction(dayNotesSchema, input, async ({ date, notes }) => {
    const userId = await requireUserId();
    await ensureDailyPlan(userId, date);
    await prisma.dailyPlan.update({
      where: { userId_date: { userId, date: toDbDate(date) } },
      data: { notes: notes ?? null },
    });
    revalidateDay(date);
    return ok(undefined, 'Note saved.');
  });
}

const dayTypeSchema = z.object({
  date: dayKey,
  dayTypeId: cuid,
});

/**
 * Override the day type for one date, re-portioning the meals still to come.
 *
 * Meals already eaten or skipped are never rewritten, so a switch at 4 pm
 * cannot change what breakfast was.
 */
export async function setDayType(input: {
  date: string;
  dayTypeId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(dayTypeSchema, input, async ({ date, dayTypeId }) => {
    const userId = await requireUserId();

    const dayType = await prisma.dayType.findFirst({ where: { id: dayTypeId, userId } });
    if (!dayType) return fail('That day type could not be found.');

    await ensureDailyPlan(userId, date, { dayTypeId, regenerate: true });
    revalidateDay(date);
    return ok(undefined);
  });
}

const regenerateSchema = z.object({ date: dayKey });

/**
 * Rebuild a day from the current plan. Explicit and opt-in: a plan edit never
 * rewrites a day on its own.
 *
 * Only today and future days can be rebuilt. A past day is a record of what
 * happened, and re-timing the meals you did not get to would quietly rewrite
 * it; there is no reason to want that which undoing the meal does not serve
 * better.
 */
export async function regenerateDay(input: { date: string }): Promise<ActionResult<undefined>> {
  return runAction(regenerateSchema, input, async ({ date }) => {
    const userId = await requireUserId();

    if (date < todayKey()) {
      return fail(
        'Past days cannot be rebuilt — they record what actually happened. To change one, edit the meal itself.',
      );
    }

    await ensureDailyPlan(userId, date, { regenerate: true });
    revalidateDay(date);
    return ok(
      undefined,
      'Meals still to come were rebuilt from the current plan. Anything already eaten or skipped was left as it was.',
    );
  });
}

const checkInSchema = z.object({
  date: dayKey,
  ratingHunger: rating,
  ratingEnergy: rating,
  ratingTraining: rating,
  ratingAdherence: rating,
  digestionNote: optionalText,
  workoutNote: optionalText,
  mealDifficultyNote: optionalText,
  prepIssueNote: optionalText,
  notes: optionalText,
});

export async function saveCheckIn(input: unknown): Promise<ActionResult<undefined>> {
  return runAction(checkInSchema, input, async (values) => {
    const userId = await requireUserId();
    const dailyPlanId = await ensureDailyPlan(userId, values.date);

    const data = {
      ratingHunger: values.ratingHunger ?? null,
      ratingEnergy: values.ratingEnergy ?? null,
      ratingTraining: values.ratingTraining ?? null,
      ratingAdherence: values.ratingAdherence ?? null,
      digestionNote: values.digestionNote ?? null,
      workoutNote: values.workoutNote ?? null,
      mealDifficultyNote: values.mealDifficultyNote ?? null,
      prepIssueNote: values.prepIssueNote ?? null,
      notes: values.notes ?? null,
    };

    await prisma.dailyCheckIn.upsert({
      where: { dailyPlanId },
      update: data,
      create: { dailyPlanId, ...data },
    });

    revalidateDay(values.date);
    revalidatePath('/more/history');
    return ok(undefined, 'Check-in saved.');
  });
}
