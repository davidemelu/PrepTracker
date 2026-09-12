'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/auth/guards';
import {
  checkbox,
  cuid,
  dosageUnitString,
  nonEmptyName,
  numberish,
  optionalCuid,
  optionalText,
  optionalTimeString,
} from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

/**
 * Supplement definitions and today's doses.
 *
 * The app records what you decided to take. It contains no dosage guidance,
 * interaction checking or recommendation of any kind.
 */

const FORMS = ['TABLET', 'CAPSULE', 'SOFTGEL', 'SCOOP', 'GUMMY', 'LIQUID', 'POWDER', 'OTHER'] as const;
const TIMINGS = [
  'AM',
  'WITH_BREAKFAST',
  'AFTER_BREAKFAST',
  'PRE_WORKOUT',
  'POST_WORKOUT',
  'WITH_MEAL',
  'EVENING',
  'BEFORE_BED',
  'ANYTIME',
] as const;
const APPLICABILITY = ['EVERY_DAY', 'TRAINING_ONLY', 'REST_ONLY'] as const;

function revalidateSupplements() {
  revalidatePath('/today');
  revalidatePath('/plan/supplements');
  revalidatePath('/more/history');
}

/* -------------------------------------------------------------------------- */
/* Daily completion                                                            */
/* -------------------------------------------------------------------------- */

const doseSchema = z.object({ dailySupplementId: cuid });

export async function completeSupplement(input: {
  dailySupplementId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(doseSchema, input, async ({ dailySupplementId }) => {
    const userId = await requireUserId();
    const dose = await prisma.dailySupplement.findFirst({
      where: { id: dailySupplementId, dailyPlan: { userId } },
    });
    if (!dose) return fail('That supplement could not be found.');

    await prisma.$transaction([
      prisma.dailySupplement.update({
        where: { id: dailySupplementId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
      prisma.supplementCompletion.create({ data: { dailySupplementId, action: 'COMPLETED' } }),
    ]);

    revalidateSupplements();
    return ok(undefined, `${dose.name} taken.`);
  });
}

export async function undoSupplement(input: {
  dailySupplementId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(doseSchema, input, async ({ dailySupplementId }) => {
    const userId = await requireUserId();
    const dose = await prisma.dailySupplement.findFirst({
      where: { id: dailySupplementId, dailyPlan: { userId } },
    });
    if (!dose) return fail('That supplement could not be found.');

    await prisma.$transaction([
      prisma.dailySupplement.update({
        where: { id: dailySupplementId },
        data: { status: 'PENDING', completedAt: null },
      }),
      prisma.supplementCompletion.create({ data: { dailySupplementId, action: 'UNDONE' } }),
    ]);

    revalidateSupplements();
    return ok(undefined, `${dose.name} reset.`);
  });
}

/** Marks every pending dose for the day as taken. */
const allDosesSchema = z.object({ dailyPlanId: cuid });

export async function completeAllSupplements(input: {
  dailyPlanId: string;
}): Promise<ActionResult<{ count: number }>> {
  return runAction(allDosesSchema, input, async ({ dailyPlanId }) => {
    const userId = await requireUserId();
    const plan = await prisma.dailyPlan.findFirst({ where: { id: dailyPlanId, userId } });
    if (!plan) return fail('That day could not be found.');

    const pending = await prisma.dailySupplement.findMany({
      where: { dailyPlanId, status: 'PENDING' },
      select: { id: true },
    });
    if (pending.length === 0) return ok({ count: 0 }, 'All supplements were already taken.');

    await prisma.$transaction([
      prisma.dailySupplement.updateMany({
        where: { dailyPlanId, status: 'PENDING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
      prisma.supplementCompletion.createMany({
        data: pending.map((p) => ({ dailySupplementId: p.id, action: 'COMPLETED' as const })),
      }),
    ]);

    revalidateSupplements();
    return ok({ count: pending.length }, `${pending.length} supplements marked as taken.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Definitions                                                                 */
/* -------------------------------------------------------------------------- */

const supplementSchema = z.object({
  id: optionalCuid,
  name: nonEmptyName,
  dosageAmount: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    numberish.refine((v) => v > 0, 'Dosage must be greater than 0.').optional(),
  ),
  dosageUnit: z.preprocess((v) => (v === '' || v === null ? undefined : v), dosageUnitString.optional()),
  countPerDose: numberish
    .refine((v) => v > 0, 'Enter how many you take per dose.')
    .refine((v) => v <= 100, 'That count looks like a typo.'),
  form: z.enum(FORMS),
  timing: z.enum(TIMINGS),
  applicability: z.enum(APPLICABILITY),
  mealId: optionalCuid,
  timeOfDay: optionalTimeString,
  notes: optionalText,
  active: checkbox.optional(),
});

export async function saveSupplement(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(supplementSchema, input, async (values) => {
    const userId = await requireUserId();

    if (values.dosageAmount != null && !values.dosageUnit) {
      return fail('Choose a unit for the dosage, for example mg or IU.', {
        fieldErrors: { dosageUnit: ['Choose a unit.'] },
      });
    }

    if (values.mealId) {
      const meal = await prisma.meal.findFirst({
        where: { id: values.mealId, mealPlan: { userId } },
        select: { id: true },
      });
      if (!meal) return fail('That meal could not be found.');
    }

    const base = {
      name: values.name,
      dosageAmount: values.dosageAmount ?? null,
      dosageUnit: values.dosageUnit ?? null,
      countPerDose: values.countPerDose,
      form: values.form,
      notes: values.notes ?? null,
      active: values.active ?? true,
    };

    if (values.id) {
      const existing = await prisma.supplement.findFirst({ where: { id: values.id, userId } });
      if (!existing) return fail('That supplement could not be found.');

      await prisma.$transaction(async (tx) => {
        await tx.supplement.update({ where: { id: values.id! }, data: base });
        // One schedule per supplement in the UI; replace it wholesale.
        await tx.supplementSchedule.deleteMany({ where: { supplementId: values.id! } });
        await tx.supplementSchedule.create({
          data: {
            supplementId: values.id!,
            timing: values.timing,
            applicability: values.applicability,
            mealId: values.mealId ?? null,
            timeOfDay: values.timeOfDay ?? null,
          },
        });
      });

      revalidateSupplements();
      return ok({ id: values.id }, 'Supplement updated.');
    }

    const count = await prisma.supplement.count({ where: { userId } });
    const created = await prisma.supplement.create({
      data: {
        userId,
        ...base,
        sortOrder: count,
        schedules: {
          create: {
            timing: values.timing,
            applicability: values.applicability,
            mealId: values.mealId ?? null,
            timeOfDay: values.timeOfDay ?? null,
          },
        },
      },
    });

    revalidateSupplements();
    return ok({ id: created.id }, 'Supplement added.');
  });
}

const idSchema = z.object({ id: cuid });

/**
 * Deleting a supplement leaves every past day's record intact: the journal rows
 * keep the name and dose and simply lose their link.
 */
export async function deleteSupplement(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const supplement = await prisma.supplement.findFirst({ where: { id, userId } });
    if (!supplement) return fail('That supplement could not be found.');

    await prisma.supplement.delete({ where: { id } });
    revalidateSupplements();
    return ok(undefined, `${supplement.name} deleted. Past records are unchanged.`);
  });
}

export async function toggleSupplementActive(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const supplement = await prisma.supplement.findFirst({ where: { id, userId } });
    if (!supplement) return fail('That supplement could not be found.');

    await prisma.supplement.update({ where: { id }, data: { active: !supplement.active } });
    revalidateSupplements();
    return ok(undefined, supplement.active ? `${supplement.name} paused.` : `${supplement.name} resumed.`);
  });
}

const reorderSchema = z.object({ ids: z.array(cuid).min(1) });

export async function reorderSupplements(input: { ids: string[] }): Promise<ActionResult<undefined>> {
  return runAction(reorderSchema, input, async ({ ids }) => {
    const userId = await requireUserId();
    const owned = await prisma.supplement.findMany({ where: { id: { in: ids }, userId }, select: { id: true } });
    if (owned.length !== ids.length) return fail('Some supplements could not be found.');

    await prisma.$transaction(
      ids.map((id, index) => prisma.supplement.update({ where: { id }, data: { sortOrder: index } })),
    );
    revalidateSupplements();
    return ok(undefined);
  });
}
