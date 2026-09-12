'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/auth/guards';
import { checkbox, cuid, nonEmptyName, numberish, optionalText, timeString } from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

/** Timing preferences, storage defaults, day types and the weekly schedule. */

function revalidateSettings() {
  revalidatePath('/more/settings');
  revalidatePath('/plan/timing');
  revalidatePath('/plan/schedule');
  revalidatePath('/today');
}

const minutes = (max: number, label: string) =>
  numberish
    .refine((v) => Number.isInteger(v), `${label} must be a whole number of minutes.`)
    .refine((v) => v >= 0, `${label} cannot be negative.`)
    .refine((v) => v <= max, `${label} must be ${max} minutes or less.`);

const timingSchema = z.object({
  autoScheduleMeals: checkbox.optional(),
  firstMealTime: timeString,
  mealIntervalMinutes: minutes(720, 'The shortest meal gap'),
  mealIntervalMaxMinutes: minutes(720, 'The longest meal gap'),
  mealDurationMinutes: minutes(240, 'Time per meal'),
  workoutTime: timeString,
  workoutDurationMinutes: minutes(480, 'Workout length'),
  lastMealEarliest: timeString,
  lastMealLatest: timeString,
  bedtime: timeString,
  preWorkoutMinutes: minutes(480, 'Pre-workout timing'),
  postWorkoutMinutes: minutes(480, 'Post-workout timing'),
});

export async function updateTimingSettings(input: unknown): Promise<ActionResult<undefined>> {
  return runAction(timingSchema, input, async (values) => {
    const userId = await requireUserId();

    if (values.mealIntervalMinutes < 30) {
      return fail('A meal interval below 30 minutes would stack your meals on top of each other.', {
        fieldErrors: { mealIntervalMinutes: ['Use at least 30 minutes.'] },
      });
    }

    if (values.mealIntervalMaxMinutes < values.mealIntervalMinutes) {
      return fail('The longest meal gap cannot be shorter than the shortest one.', {
        fieldErrors: { mealIntervalMaxMinutes: ['Set this to at least the shortest gap.'] },
      });
    }

    // `autoScheduleMeals` is undefined when the caller did not send the toggle
    // at all, and Prisma leaves undefined fields alone. An explicit `false`
    // still turns the cascade off.
    await prisma.settings.update({ where: { userId }, data: values });

    revalidateSettings();
    return ok(
      undefined,
      'Meal timing updated. Days already generated keep their times until you rebuild them.',
    );
  });
}

const storageSchema = z.object({
  fridgeDays: numberish
    .refine((v) => Number.isInteger(v) && v >= 0, 'Enter a whole number of days.')
    .refine((v) => v <= 14, 'Keeping cooked food refrigerated beyond 14 days is not supported.'),
  freezerThawLeadDays: numberish
    .refine((v) => Number.isInteger(v) && v >= 0, 'Enter a whole number of days.')
    .refine((v) => v <= 7, 'A thaw lead time above 7 days is not supported.'),
  defaultPortionG: numberish.refine((v) => v > 0, 'Portion size must be greater than 0 g.'),
  defaultPlanDays: numberish
    .refine((v) => Number.isInteger(v) && v >= 1, 'Plan at least one day.')
    .refine((v) => v <= 60, 'Planning more than 60 days at a time is not supported.'),
});

export async function updateStorageSettings(input: unknown): Promise<ActionResult<undefined>> {
  return runAction(storageSchema, input, async (values) => {
    const userId = await requireUserId();
    await prisma.settings.update({ where: { userId }, data: values });
    revalidatePath('/more/settings');
    revalidatePath('/prep');
    return ok(undefined, 'Storage settings updated.');
  });
}

const quickAddSchema = z.object({
  quickAddAMl: numberish.refine((v) => Number.isInteger(v) && v > 0 && v <= 5000, 'Enter 1–5000 mL.'),
  quickAddBMl: numberish.refine((v) => Number.isInteger(v) && v > 0 && v <= 5000, 'Enter 1–5000 mL.'),
});

export async function updateQuickAddAmounts(input: unknown): Promise<ActionResult<undefined>> {
  return runAction(quickAddSchema, input, async (values) => {
    const userId = await requireUserId();
    await prisma.settings.update({ where: { userId }, data: values });
    revalidateSettings();
    return ok(undefined, 'Quick-add amounts updated.');
  });
}

const miscSchema = z.object({
  seasoningNote: optionalText,
  notificationsEnabled: checkbox.optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
});

export async function updateMiscSettings(input: unknown): Promise<ActionResult<undefined>> {
  return runAction(miscSchema, input, async (values) => {
    const userId = await requireUserId();
    await prisma.settings.update({
      where: { userId },
      data: {
        seasoningNote: values.seasoningNote ?? null,
        ...(values.notificationsEnabled !== undefined
          ? { notificationsEnabled: values.notificationsEnabled }
          : {}),
        ...(values.theme ? { theme: values.theme } : {}),
      },
    });
    revalidateSettings();
    return ok(undefined, 'Settings updated.');
  });
}

/* -------------------------------------------------------------------------- */
/* Day types                                                                   */
/* -------------------------------------------------------------------------- */

const dayTypeSchema = z.object({
  id: z.preprocess((v) => (v === '' || v === null ? undefined : v), cuid.optional()),
  name: nonEmptyName,
  isTraining: checkbox.optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour.')
    .optional(),
  /** Copy quantities from this day type when creating a new one. */
  copyFromDayTypeId: z.preprocess((v) => (v === '' || v === null ? undefined : v), cuid.optional()),
});

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'day-type';
}

/**
 * Adding a custom day type copies the quantities of an existing one, so a new
 * "Light training" day starts from something sensible instead of all zeros.
 */
export async function saveDayType(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(dayTypeSchema, input, async (values) => {
    const userId = await requireUserId();

    if (values.id) {
      const existing = await prisma.dayType.findFirst({ where: { id: values.id, userId } });
      if (!existing) return fail('That day type could not be found.');

      await prisma.dayType.update({
        where: { id: values.id },
        data: {
          name: values.name,
          isTraining: values.isTraining ?? existing.isTraining,
          color: values.color ?? existing.color,
        },
      });
      revalidateSettings();
      return ok({ id: values.id }, 'Day type updated.');
    }

    const base = slugify(values.name);
    let key = base;
    let suffix = 2;
    while (await prisma.dayType.findFirst({ where: { userId, key } })) {
      key = `${base}-${suffix}`;
      suffix += 1;
    }

    const count = await prisma.dayType.count({ where: { userId } });

    const created = await prisma.$transaction(async (tx) => {
      const dayType = await tx.dayType.create({
        data: {
          userId,
          key,
          name: values.name,
          isTraining: values.isTraining ?? false,
          color: values.color ?? '#64748b',
          sortOrder: count,
        },
      });

      const ingredients = await tx.mealIngredient.findMany({
        where: { meal: { mealPlan: { userId } } },
        include: { quantities: true },
      });

      for (const ingredient of ingredients) {
        const source = values.copyFromDayTypeId
          ? ingredient.quantities.find((q) => q.dayTypeId === values.copyFromDayTypeId)
          : undefined;
        await tx.mealIngredientQuantity.create({
          data: {
            mealIngredientId: ingredient.id,
            dayTypeId: dayType.id,
            quantity: source?.quantity ?? 0,
          },
        });
      }

      const meals = await tx.meal.findMany({
        where: { mealPlan: { userId } },
        select: { id: true },
      });
      for (const meal of meals) {
        await tx.mealDayTypeSetting.create({
          data: { mealId: meal.id, dayTypeId: dayType.id, included: true },
        });
      }

      return dayType;
    });

    revalidateSettings();
    return ok(
      { id: created.id },
      values.copyFromDayTypeId
        ? `${created.name} added, copying quantities from your existing day type.`
        : `${created.name} added. Set its quantities in the meal plan.`,
    );
  });
}

const idSchema = z.object({ id: cuid });

export async function deleteDayType(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const dayType = await prisma.dayType.findFirst({ where: { id, userId } });
    if (!dayType) return fail('That day type could not be found.');

    const total = await prisma.dayType.count({ where: { userId } });
    if (total <= 1) return fail('You need at least one day type.');

    await prisma.dayType.delete({ where: { id } });
    revalidateSettings();
    return ok(undefined, `${dayType.name} deleted. Days already logged keep the name they were recorded with.`);
  });
}

const scheduleSchema = z.object({
  /** dayOfWeek (1-7) -> dayTypeId */
  assignments: z.record(z.string(), cuid),
});

export async function updateWeeklySchedule(input: unknown): Promise<ActionResult<undefined>> {
  return runAction(scheduleSchema, input, async ({ assignments }) => {
    const userId = await requireUserId();

    const dayTypes = await prisma.dayType.findMany({ where: { userId }, select: { id: true } });
    const valid = new Set(dayTypes.map((d) => d.id));

    const entries = Object.entries(assignments)
      .map(([day, dayTypeId]) => [Number(day), dayTypeId] as const)
      .filter(([day, dayTypeId]) => day >= 1 && day <= 7 && valid.has(dayTypeId));

    if (entries.length === 0) return fail('No valid days were provided.');

    await prisma.$transaction(
      entries.map(([dayOfWeek, dayTypeId]) =>
        prisma.scheduleDay.upsert({
          where: { userId_dayOfWeek: { userId, dayOfWeek } },
          update: { dayTypeId },
          create: { userId, dayOfWeek, dayTypeId },
        }),
      ),
    );

    revalidateSettings();
    return ok(undefined, 'Weekly schedule updated. Days you have already opened keep their current type.');
  });
}
