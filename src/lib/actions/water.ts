'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/auth/guards';
import { toDbDate, todayKey } from '@/lib/domain/dates';
import { isProbableDuplicate, lastEntry, validateWaterAmount } from '@/lib/domain/water';
import { ensureDailyPlan } from '@/lib/server/day-service';
import { cuid, dayKey, numberish, optionalText } from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

const addSchema = z.object({
  date: dayKey,
  amountMl: numberish,
  note: optionalText,
  /** Set after the user confirms an apparent double tap. */
  confirmDuplicate: z.boolean().optional(),
});

export async function addWater(input: {
  date: string;
  amountMl: number;
  note?: string;
  confirmDuplicate?: boolean;
}): Promise<ActionResult<{ totalMl: number }>> {
  return runAction(addSchema, input, async ({ date, amountMl, note, confirmDuplicate }) => {
    const userId = await requireUserId();

    const validation = validateWaterAmount(amountMl);
    if (!validation.ok) return fail(validation.message ?? 'Enter a valid amount.');

    const dailyPlanId = await ensureDailyPlan(userId, date);

    const existing = await prisma.waterEntry.findMany({
      where: { userId, date: toDbDate(date) },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (!confirmDuplicate && isProbableDuplicate(existing, amountMl)) {
      return {
        ok: false,
        error: `You just logged ${amountMl} mL a moment ago. Add it again?`,
        needsConfirmation: true,
      };
    }

    await prisma.waterEntry.create({
      data: {
        userId,
        dailyPlanId,
        date: toDbDate(date),
        amountMl,
        source: note ? 'CUSTOM' : 'QUICK_ADD',
        note: note ?? null,
      },
    });

    const total = await prisma.waterEntry.aggregate({
      where: { userId, date: toDbDate(date) },
      _sum: { amountMl: true },
    });

    revalidatePath('/today');
    revalidatePath('/more/history');
    return ok({ totalMl: total._sum.amountMl ?? 0 });
  });
}

const undoSchema = z.object({ date: dayKey });

export async function undoLastWater(input: { date: string }): Promise<ActionResult<undefined>> {
  return runAction(undoSchema, input, async ({ date }) => {
    const userId = await requireUserId();

    const entries = await prisma.waterEntry.findMany({
      where: { userId, date: toDbDate(date) },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const last = lastEntry(entries);
    if (!last) return fail('There is nothing to undo today.');

    await prisma.waterEntry.delete({ where: { id: last.id } });
    revalidatePath('/today');
    return ok(undefined, `Removed ${last.amountMl} mL.`);
  });
}

const deleteSchema = z.object({ entryId: cuid });

export async function deleteWaterEntry(input: { entryId: string }): Promise<ActionResult<undefined>> {
  return runAction(deleteSchema, input, async ({ entryId }) => {
    const userId = await requireUserId();
    const entry = await prisma.waterEntry.findFirst({ where: { id: entryId, userId } });
    if (!entry) return fail('That entry could not be found.');

    await prisma.waterEntry.delete({ where: { id: entryId } });
    revalidatePath('/today');
    return ok(undefined, 'Entry removed.');
  });
}

const targetSchema = z.object({
  targetMl: numberish
    .refine((v) => Number.isInteger(v), 'Enter a whole number of millilitres.')
    .refine((v) => v > 0, 'The water target must be greater than 0 mL.')
    .refine((v) => v <= 20000, 'A target above 20 L is almost certainly a typo.'),
  /** Also apply the new target to today's stored plan. */
  applyToToday: z.boolean().optional(),
});

/**
 * Change the daily target. Past days keep the target they were generated with,
 * so historical adherence never moves.
 */
export async function updateWaterTarget(input: {
  targetMl: number;
  applyToToday?: boolean;
}): Promise<ActionResult<undefined>> {
  return runAction(targetSchema, input, async ({ targetMl, applyToToday }) => {
    const userId = await requireUserId();

    await prisma.settings.update({ where: { userId }, data: { waterTargetMl: targetMl } });

    if (applyToToday) {
      // Today is resolved on the server. It used to come from the client, which
      // meant any date could be passed and a past day's target rewritten —
      // moving the adherence already recorded against it.
      await prisma.dailyPlan.updateMany({
        where: { userId, date: toDbDate(todayKey()) },
        data: { waterTargetMl: targetMl },
      });
    }

    revalidatePath('/today');
    revalidatePath('/more/settings');
    return ok(undefined, 'Water target updated.');
  });
}
