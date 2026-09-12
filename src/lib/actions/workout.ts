'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/auth/guards';
import {
  resolveFocuses,
  validateFocusSelection,
  validateWorkoutName,
  type WorkoutFocusCategoryKey,
  type WorkoutFocusLike,
} from '@/lib/domain/workout';
import { ensureDailyPlan, retimeDay } from '@/lib/server/day-service';
import {
  checkbox,
  cuid,
  dayKey,
  idSchema,
  nonEmptyName,
  numberish,
  optionalCuid,
  optionalText,
  timeString,
} from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

/**
 * Workout focus: the editable catalogue, the weekly defaults, and what was
 * actually trained on a given day.
 *
 * Day rows snapshot the focus name, so renaming or deleting a focus later never
 * rewrites what you trained in the past.
 */

const CATEGORIES = ['MUSCLE_GROUP', 'SPLIT', 'CONDITIONING', 'OTHER'] as const;

function revalidateWorkout(date?: string) {
  revalidatePath('/today');
  revalidatePath('/plan/schedule');
  revalidatePath('/plan/workouts');
  revalidatePath('/plan/week');
  revalidatePath('/more/history');
  if (date) revalidatePath(`/today/${date}`);
}

/* -------------------------------------------------------------------------- */
/* What I trained today                                                        */
/* -------------------------------------------------------------------------- */

const setDayWorkoutSchema = z.object({
  date: dayKey,
  focusIds: z.array(cuid).default([]),
  workoutName: optionalText,
});

/**
 * Record what was trained on a date.
 *
 * Replaces the day's focus list wholesale, which is what the picker submits.
 * Focus rows keep their own copy of the name for history.
 */
export async function setDayWorkout(input: unknown): Promise<ActionResult<{ focusCount: number }>> {
  return runAction(setDayWorkoutSchema, input, async (values) => {
    const userId = await requireUserId();

    const nameCheck = validateWorkoutName(values.workoutName);
    if (!nameCheck.ok) {
      return fail(nameCheck.message!, { fieldErrors: { workoutName: [nameCheck.message!] } });
    }

    const selectionCheck = validateFocusSelection(values.focusIds);
    if (!selectionCheck.ok) return fail(selectionCheck.message!);

    const dailyPlanId = await ensureDailyPlan(userId, values.date);

    const catalogue = await prisma.workoutFocus.findMany({ where: { userId } });
    const resolved = resolveFocuses(values.focusIds, catalogue as WorkoutFocusLike[]);

    if (resolved.length !== values.focusIds.length) {
      return fail('Some of those workout focuses could not be found.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.dailyWorkoutFocus.deleteMany({ where: { dailyPlanId } });

      if (resolved.length > 0) {
        await tx.dailyWorkoutFocus.createMany({
          data: resolved.map((focus, index) => ({
            dailyPlanId,
            focusId: focus.id,
            name: focus.name,
            sortOrder: index,
          })),
        });
      }

      await tx.dailyPlan.update({
        where: { id: dailyPlanId },
        data: { workoutName: values.workoutName?.trim() || null },
      });
    });

    // The pre-workout meal moves with the session: a leg day wants a longer gap
    // before training than a pressing day.
    const retimed = await retimeDay(userId, values.date);

    revalidateWorkout(values.date);
    return ok(
      { focusCount: resolved.length },
      retimed > 0 ? 'Workout saved and meal times updated.' : 'Workout saved.',
    );
  });
}

const clearSchema = z.object({ date: dayKey });

export async function clearDayWorkout(input: { date: string }): Promise<ActionResult<undefined>> {
  return runAction(clearSchema, input, async ({ date }) => {
    const userId = await requireUserId();
    const dailyPlanId = await ensureDailyPlan(userId, date);

    await prisma.$transaction([
      prisma.dailyWorkoutFocus.deleteMany({ where: { dailyPlanId } }),
      prisma.dailyPlan.update({ where: { id: dailyPlanId }, data: { workoutName: null } }),
    ]);

    await retimeDay(userId, date);

    revalidateWorkout(date);
    return ok(undefined, 'Workout cleared.');
  });
}

/**
 * Copy the weekly default onto a date — the "same as usual" shortcut when a day
 * was generated before the default was configured.
 */
export async function applyScheduledWorkout(input: {
  date: string;
}): Promise<ActionResult<{ applied: boolean }>> {
  return runAction<{ date: string }, { applied: boolean }>(clearSchema, input, async ({ date }) => {
    const userId = await requireUserId();
    const { isoWeekday } = await import('@/lib/domain/dates');

    const scheduleDay = await prisma.scheduleDay.findUnique({
      where: { userId_dayOfWeek: { userId, dayOfWeek: isoWeekday(date) } },
      include: { focuses: { orderBy: { sortOrder: 'asc' }, include: { focus: true } } },
    });

    if (!scheduleDay || (scheduleDay.focuses.length === 0 && !scheduleDay.workoutName)) {
      return ok({ applied: false }, 'No default workout is set for this weekday yet.');
    }

    const dailyPlanId = await ensureDailyPlan(userId, date);

    await prisma.$transaction(async (tx) => {
      await tx.dailyWorkoutFocus.deleteMany({ where: { dailyPlanId } });
      if (scheduleDay.focuses.length > 0) {
        await tx.dailyWorkoutFocus.createMany({
          data: scheduleDay.focuses.map((entry, index) => ({
            dailyPlanId,
            focusId: entry.focusId,
            name: entry.focus.name,
            sortOrder: index,
          })),
        });
      }
      await tx.dailyPlan.update({
        where: { id: dailyPlanId },
        data: { workoutName: scheduleDay.workoutName },
      });
    });

    await retimeDay(userId, date);

    revalidateWorkout(date);
    return ok({ applied: true }, 'Applied this weekday’s usual workout.');
  });
}

const dayWorkoutTimeSchema = z.object({
  date: dayKey,
  /** Blank puts the day back on the usual time from Settings. */
  workoutTime: z.preprocess((v) => (v === '' || v == null ? undefined : v), timeString.optional()),
});

/**
 * Set the time you are actually training on a given date.
 *
 * Gym time varies, and the pre-workout meal exists to sit a fixed distance
 * ahead of it, so changing this re-times the rest of the day. Only the one date
 * is affected; the usual time in Settings is untouched.
 */
export async function setDayWorkoutTime(
  input: unknown,
): Promise<ActionResult<{ retimed: number }>> {
  return runAction(dayWorkoutTimeSchema, input, async (values) => {
    const userId = await requireUserId();

    const settings = await prisma.settings.findUnique({
      where: { userId },
      select: { workoutTime: true },
    });

    const dailyPlanId = await ensureDailyPlan(userId, values.date);
    const day = await prisma.dailyPlan.findUnique({
      where: { id: dailyPlanId },
      select: { dayTypeIsTraining: true },
    });

    if (!day?.dayTypeIsTraining) {
      return fail('This is a rest day, so there is no session to time meals around.');
    }

    // Clearing the override falls back to the usual time rather than to null,
    // so the day always has a session to anchor the pre-workout meal to.
    const workoutTime = values.workoutTime ?? settings?.workoutTime ?? null;

    await prisma.dailyPlan.update({ where: { id: dailyPlanId }, data: { workoutTime } });

    const retimed = await retimeDay(userId, values.date);

    revalidateWorkout(values.date);
    return ok(
      { retimed },
      retimed > 0
        ? `Training at ${workoutTime}. Meal times updated to match.`
        : `Training at ${workoutTime}.`,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* The catalogue                                                               */
/* -------------------------------------------------------------------------- */

const focusSchema = z.object({
  id: optionalCuid,
  name: nonEmptyName,
  category: z.enum(CATEGORIES),
  active: checkbox.optional(),
  /** Blank means "use the default pre-workout gap". */
  preWorkoutMinutes: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    numberish
      .refine((v) => Number.isInteger(v), 'Enter a whole number of minutes.')
      .refine((v) => v >= 0 && v <= 480, 'Use a gap between 0 and 480 minutes.')
      .optional(),
  ),
});

export async function saveWorkoutFocus(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(focusSchema, input, async (values) => {
    const userId = await requireUserId();

    const duplicate = await prisma.workoutFocus.findFirst({
      where: { userId, name: values.name, ...(values.id ? { NOT: { id: values.id } } : {}) },
    });
    if (duplicate) {
      return fail(`You already have a workout focus called "${values.name}".`, {
        fieldErrors: { name: ['That name is already used.'] },
      });
    }

    if (values.id) {
      const existing = await prisma.workoutFocus.findFirst({ where: { id: values.id, userId } });
      if (!existing) return fail('That workout focus could not be found.');

      await prisma.workoutFocus.update({
        where: { id: values.id },
        data: {
          name: values.name,
          category: values.category as WorkoutFocusCategoryKey,
          active: values.active ?? existing.active,
          preWorkoutMinutes: values.preWorkoutMinutes ?? null,
        },
      });

      revalidateWorkout();
      return ok({ id: values.id }, 'Workout focus updated. Past days keep the name they recorded.');
    }

    const count = await prisma.workoutFocus.count({ where: { userId } });
    const created = await prisma.workoutFocus.create({
      data: {
        userId,
        name: values.name,
        category: values.category as WorkoutFocusCategoryKey,
        sortOrder: count,
        active: values.active ?? true,
        preWorkoutMinutes: values.preWorkoutMinutes ?? null,
      },
    });

    revalidateWorkout();
    return ok({ id: created.id }, 'Workout focus added.');
  });
}


export async function deleteWorkoutFocus(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const focus = await prisma.workoutFocus.findFirst({ where: { id, userId } });
    if (!focus) return fail('That workout focus could not be found.');

    const logged = await prisma.dailyWorkoutFocus.count({ where: { focusId: id } });

    await prisma.workoutFocus.delete({ where: { id } });

    revalidateWorkout();
    return ok(
      undefined,
      logged > 0
        ? `${focus.name} deleted. The ${logged} day${logged === 1 ? '' : 's'} you trained it are unchanged.`
        : `${focus.name} deleted.`,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Weekly defaults                                                             */
/* -------------------------------------------------------------------------- */

const scheduleFocusSchema = z.object({
  dayOfWeek: z
    .number()
    .int()
    .min(1, 'Weekdays run from 1 (Monday) to 7 (Sunday).')
    .max(7, 'Weekdays run from 1 (Monday) to 7 (Sunday).'),
  focusIds: z.array(cuid).default([]),
  workoutName: optionalText,
});

/**
 * Set the usual workout for a weekday. Applies to days generated from now on;
 * days already logged keep what they recorded.
 */
export async function setScheduledWorkout(input: unknown): Promise<ActionResult<undefined>> {
  return runAction(scheduleFocusSchema, input, async (values) => {
    const userId = await requireUserId();

    const nameCheck = validateWorkoutName(values.workoutName);
    if (!nameCheck.ok) return fail(nameCheck.message!);

    const selectionCheck = validateFocusSelection(values.focusIds);
    if (!selectionCheck.ok) return fail(selectionCheck.message!);

    const scheduleDay = await prisma.scheduleDay.findUnique({
      where: { userId_dayOfWeek: { userId, dayOfWeek: values.dayOfWeek } },
    });
    if (!scheduleDay) return fail('Set the day type for this weekday first.');

    const catalogue = await prisma.workoutFocus.findMany({ where: { userId } });
    const resolved = resolveFocuses(values.focusIds, catalogue as WorkoutFocusLike[]);
    if (resolved.length !== values.focusIds.length) {
      return fail('Some of those workout focuses could not be found.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleDayFocus.deleteMany({ where: { scheduleDayId: scheduleDay.id } });
      if (resolved.length > 0) {
        await tx.scheduleDayFocus.createMany({
          data: resolved.map((focus, index) => ({
            scheduleDayId: scheduleDay.id,
            focusId: focus.id,
            sortOrder: index,
          })),
        });
      }
      await tx.scheduleDay.update({
        where: { id: scheduleDay.id },
        data: { workoutName: values.workoutName?.trim() || null },
      });
    });

    revalidateWorkout();
    return ok(undefined, 'Weekly workout updated. Days already logged are unchanged.');
  });
}

