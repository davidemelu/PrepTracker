'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/auth/guards';
import { addDays, toDbDate, todayKey } from '@/lib/domain/dates';
import { allocatePortions } from '@/lib/domain/storage';
import {
  effectiveYield,
  measureYield,
  planPortions,
  portionsRequired,
  validateYieldPct,
} from '@/lib/domain/yield';
import { buildGroceryLines } from '@/lib/server/grocery-service';
import {
  checkbox,
  cuid,
  dayKey,
  nonEmptyName,
  numberish,
  optionalCuid,
  optionalQuantity,
  optionalText,
  positiveQuantity,
} from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

/**
 * Prep day.
 *
 * The loop this supports: work out how much to cook, weigh the raw food, cook
 * it, weigh the result, and let the measured yield improve next week's shopping
 * list automatically.
 */

function revalidatePrep(sessionId?: string) {
  revalidatePath('/prep');
  revalidatePath('/prep/yields');
  revalidatePath('/prep/storage');
  if (sessionId) revalidatePath(`/prep/${sessionId}`);
  revalidatePath('/groceries');
}

const createSchema = z.object({
  name: z.preprocess((v) => (v === '' || v == null ? undefined : v), nonEmptyName.optional()),
  date: dayKey,
  dayTypeCounts: z.record(z.string(), numberish.refine((v) => v >= 0, 'Days cannot be negative.')),
  groceryWeekId: optionalCuid,
});

/**
 * Create a prep session, pre-filled with how much of each food to cook.
 *
 * Reuses the grocery generator so the amounts on prep day can never disagree
 * with what the shopping list said to buy.
 */
export async function createPrepSession(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(createSchema, input, async (values) => {
    const userId = await requireUserId();

    const counts = Object.entries(values.dayTypeCounts).map(([dayTypeId, days]) => ({
      dayTypeId,
      days: Math.floor(days),
    }));
    const totalDays = counts.reduce((sum, c) => sum + c.days, 0);
    if (totalDays === 0) return fail('Set how many days of food you are prepping.');

    const [settings, dayTypes] = await Promise.all([
      prisma.settings.findUnique({ where: { userId } }),
      prisma.dayType.findMany({ where: { userId } }),
    ]);

    const portionSizeG = settings?.defaultPortionG ?? 175;

    const { lines } = await buildGroceryLines({
      userId,
      startDate: values.date,
      daysPlanned: totalDays,
      dayTypeCounts: counts,
      applyInventory: false,
      includeSupplements: false,
      includeOptional: false,
    });

    // Only foods planned by cooked weight need a cooking batch.
    const cookLines = lines.filter((line) => line.cookedQty != null && line.cookedQty > 0);
    if (cookLines.length === 0) {
      return fail('Nothing in your plan is measured by cooked weight, so there is nothing to batch cook.');
    }

    const trainingDays = counts
      .filter((c) => dayTypes.find((d) => d.id === c.dayTypeId)?.isTraining)
      .reduce((sum, c) => sum + c.days, 0);

    // A grocery week supplied by the client is still an id from the client.
    if (values.groceryWeekId) {
      const week = await prisma.groceryWeek.findFirst({
        where: { id: values.groceryWeekId, userId },
        select: { id: true },
      });
      if (!week) return fail('That grocery list could not be found.');
    }

    const session = await prisma.prepSession.create({
      data: {
        userId,
        groceryWeekId: values.groceryWeekId ?? null,
        name: values.name ?? `Prep for ${totalDays} days`,
        date: toDbDate(values.date),
        daysCovered: totalDays,
        trainingDays,
        restDays: totalDays - trainingDays,
        status: 'PLANNED',
        batches: {
          create: cookLines.map((line, index) => ({
            foodId: line.foodId,
            foodName: line.name,
            targetCookedG: line.cookedQty,
            portionSizeG,
            portionsPlanned: portionsRequired(line.cookedQty!, portionSizeG),
            sortOrder: index,
          })),
        },
        tasks: {
          create: cookLines.flatMap((line, index) => {
            const portions = portionsRequired(line.cookedQty!, portionSizeG);
            return [
              {
                foodId: line.foodId,
                title: `Cook ${line.name}`,
                kind: 'COOK' as const,
                // The raw weight for this cooked amount alone. `rawQty` is the
                // shopping total and includes anything of the same food the
                // plan asks for raw, which is not going in this pan.
                targetQty: line.rawForCookedQty ?? line.cookedQty,
                unit: line.shoppingUnit,
                sortOrder: index * 2,
                notes:
                  line.rawForCookedQty != null && line.yieldPctUsed != null
                    ? `Start with about ${line.rawForCookedQty} ${line.shoppingUnit} raw at a ${line.yieldPctUsed}% yield.`
                    : null,
              },
              {
                foodId: line.foodId,
                title: `Portion ${line.name}`,
                kind: 'PORTION' as const,
                targetQty: portions,
                unit: 'serving',
                sortOrder: index * 2 + 1,
                notes: `${portions} portions of ${portionSizeG} g.`,
              },
            ];
          }),
        },
      },
    });

    revalidatePrep(session.id);
    return ok({ id: session.id }, `Prep session created with ${cookLines.length} things to cook.`);
  });
}

const batchSchema = z.object({
  id: cuid,
  rawWeightG: optionalQuantity,
  cookedWeightG: optionalQuantity,
  portionSizeG: optionalQuantity,
  portionsMade: optionalQuantity,
  containersPrepared: optionalQuantity,
  notes: optionalText,
  /** Confirms a yield above 100%, which is right for rice but not for meat. */
  confirmYield: z.boolean().optional(),
});

/**
 * Record what actually happened to a batch.
 *
 * When both weights are present the measured yield is stored and the food's
 * effective yield is rolled forward, so the numbers get better every week.
 */
export async function updatePrepBatch(input: unknown): Promise<ActionResult<{
  measuredYieldPct: number | null;
  portions: number | null;
  leftoverG: number | null;
}>> {
  return runAction(batchSchema, input, async (values) => {
    const userId = await requireUserId();

    const batch = await prisma.prepBatch.findFirst({
      where: { id: values.id, prepSession: { userId } },
      include: { prepSession: { select: { id: true } } },
    });
    if (!batch) return fail('That batch could not be found.');

    const rawWeightG = values.rawWeightG ?? batch.rawWeightG;
    const cookedWeightG = values.cookedWeightG ?? batch.cookedWeightG;
    const portionSizeG = values.portionSizeG ?? batch.portionSizeG;

    if (portionSizeG <= 0) {
      return fail('Portion size must be greater than 0 g.', {
        fieldErrors: { portionSizeG: ['Enter a portion size.'] },
      });
    }

    let measuredYieldPct: number | null = batch.measuredYieldPct;

    if (rawWeightG != null && rawWeightG > 0 && cookedWeightG != null) {
      measuredYieldPct = measureYield(rawWeightG, cookedWeightG);

      const validation = validateYieldPct(measuredYieldPct);
      if (!validation.ok) return fail(validation.message ?? 'That yield is not valid.');
      if (validation.needsConfirmation && !values.confirmYield) {
        return {
          ok: false,
          error: `${rawWeightG} g raw to ${cookedWeightG} g cooked is a ${measuredYieldPct}% yield, meaning the food gained weight. Correct for rice and oats — confirm to save it.`,
          needsConfirmation: true,
        };
      }
    }

    const portions =
      cookedWeightG != null ? planPortions(cookedWeightG, portionSizeG, batch.portionsPlanned ?? undefined) : null;

    await prisma.$transaction(async (tx) => {
      await tx.prepBatch.update({
        where: { id: values.id },
        data: {
          rawWeightG: rawWeightG ?? null,
          cookedWeightG: cookedWeightG ?? null,
          measuredYieldPct,
          portionSizeG,
          portionsMade: values.portionsMade ?? portions?.portions ?? batch.portionsMade,
          containersPrepared: values.containersPrepared ?? batch.containersPrepared,
          notes: values.notes ?? batch.notes,
          completedAt: cookedWeightG != null ? new Date() : batch.completedAt,
        },
      });

      // Only log a new measurement when it actually changed.
      if (measuredYieldPct != null && measuredYieldPct !== batch.measuredYieldPct) {
        await tx.cookingYield.create({
          data: {
            userId,
            foodId: batch.foodId,
            foodName: batch.foodName,
            yieldPct: measuredYieldPct,
            source: 'MEASURED',
            rawWeightG,
            cookedWeightG,
            prepBatchId: batch.id,
          },
        });

        if (batch.foodId) {
          const history = await tx.cookingYield.findMany({
            where: { userId, foodId: batch.foodId },
            orderBy: { recordedAt: 'desc' },
            take: 10,
          });
          const food = await tx.food.findUnique({ where: { id: batch.foodId } });
          const next = effectiveYield(
            history.map((h) => ({ yieldPct: h.yieldPct, recordedAt: h.recordedAt, source: h.source })),
            food?.cookingYieldPct ?? null,
          );
          if (next != null) {
            await tx.food.update({ where: { id: batch.foodId }, data: { cookingYieldPct: next } });
          }
        }
      }
    });

    revalidatePrep(batch.prepSessionId);
    return ok({
      measuredYieldPct,
      portions: portions?.portions ?? null,
      leftoverG: portions?.leftoverG ?? null,
    });
  });
}

const taskSchema = z.object({ id: cuid, done: checkbox.optional() });

export async function togglePrepTask(input: { id: string; done?: boolean }): Promise<ActionResult<undefined>> {
  return runAction(taskSchema, input, async ({ id, done }) => {
    const userId = await requireUserId();
    const task = await prisma.prepTask.findFirst({
      where: { id, prepSession: { userId } },
      select: { id: true, done: true, prepSessionId: true },
    });
    if (!task) return fail('That task could not be found.');

    const next = done ?? !task.done;
    await prisma.prepTask.update({
      where: { id },
      data: { done: next, doneAt: next ? new Date() : null },
    });

    revalidatePrep(task.prepSessionId);
    return ok(undefined);
  });
}

const addTaskSchema = z.object({
  prepSessionId: cuid,
  title: nonEmptyName,
  kind: z.enum(['COOK', 'PORTION', 'SHOP', 'CLEAN', 'OTHER']).optional(),
  notes: optionalText,
});

export async function addPrepTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(addTaskSchema, input, async (values) => {
    const userId = await requireUserId();
    const session = await prisma.prepSession.findFirst({ where: { id: values.prepSessionId, userId } });
    if (!session) return fail('That prep session could not be found.');

    const count = await prisma.prepTask.count({ where: { prepSessionId: values.prepSessionId } });
    const created = await prisma.prepTask.create({
      data: {
        prepSessionId: values.prepSessionId,
        title: values.title,
        kind: values.kind ?? 'OTHER',
        notes: values.notes ?? null,
        sortOrder: count,
      },
    });

    revalidatePrep(values.prepSessionId);
    return ok({ id: created.id }, 'Task added.');
  });
}

const sessionStatusSchema = z.object({
  id: cuid,
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED']),
});

export async function setPrepSessionStatus(input: {
  id: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
}): Promise<ActionResult<undefined>> {
  return runAction(sessionStatusSchema, input, async ({ id, status }) => {
    const userId = await requireUserId();
    const session = await prisma.prepSession.findFirst({ where: { id, userId } });
    if (!session) return fail('That prep session could not be found.');

    await prisma.prepSession.update({
      where: { id },
      data: { status, completedAt: status === 'COMPLETED' ? new Date() : null },
    });

    revalidatePrep(id);
    return ok(undefined, status === 'COMPLETED' ? 'Prep session finished.' : 'Prep session updated.');
  });
}

const idSchema = z.object({ id: cuid });

export async function deletePrepSession(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const session = await prisma.prepSession.findFirst({ where: { id, userId } });
    if (!session) return fail('That prep session could not be found.');

    await prisma.prepSession.delete({ where: { id } });
    revalidatePrep();
    return ok(undefined, 'Prep session deleted. Measured yields are kept.');
  });
}

const storeSchema = z.object({
  batchId: cuid,
  portionsPerDay: numberish.refine((v) => v > 0, 'At least one portion per day.').optional(),
  prepDate: dayKey,
});

/**
 * Turn a finished batch into storage portions, split between fridge and freezer
 * according to your storage settings, with thaw dates already worked out.
 */
export async function storeBatchPortions(input: unknown): Promise<ActionResult<{ created: number }>> {
  return runAction(storeSchema, input, async (values) => {
    const userId = await requireUserId();

    const batch = await prisma.prepBatch.findFirst({
      where: { id: values.batchId, prepSession: { userId } },
    });
    if (!batch) return fail('That batch could not be found.');

    const portions = batch.portionsMade ?? batch.portionsPlanned;
    if (!portions || portions <= 0) {
      return fail('Record how many portions this batch made before storing it.');
    }

    const settings = await prisma.settings.findUnique({ where: { userId } });
    const allocations = allocatePortions(values.prepDate, portions, values.portionsPerDay ?? 1, {
      fridgeDays: settings?.fridgeDays ?? 3,
      freezerThawLeadDays: settings?.freezerThawLeadDays ?? 1,
    });

    await prisma.$transaction(
      allocations.map((allocation, index) =>
        prisma.storagePortion.create({
          data: {
            userId,
            prepBatchId: batch.id,
            foodId: batch.foodId,
            label: `${batch.foodName} × ${allocation.portions}`,
            portions: allocation.portions,
            portionSizeG: batch.portionSizeG,
            location: allocation.location,
            status: allocation.status,
            prepDate: toDbDate(values.prepDate),
            refrigerateOn: allocation.refrigerateOn ? toDbDate(allocation.refrigerateOn) : null,
            freezeOn: allocation.freezeOn ? toDbDate(allocation.freezeOn) : null,
            thawOn: allocation.thawOn ? toDbDate(allocation.thawOn) : null,
            useByDate: toDbDate(allocation.useByDate),
            notes: `Day ${index + 1} of this batch.`,
          },
        }),
      ),
    );

    revalidatePrep(batch.prepSessionId);
    return ok(
      { created: allocations.length },
      `${allocations.length} storage entries created: fridge first, the rest frozen with thaw dates.`,
    );
  });
}

const yieldSchema = z.object({
  foodId: cuid,
  yieldPct: positiveQuantity,
  confirmYield: z.boolean().optional(),
  note: optionalText,
});

/** Set a food's yield by hand, recording it in the yield history. */
export async function setCookingYield(input: unknown): Promise<ActionResult<undefined>> {
  return runAction(yieldSchema, input, async (values) => {
    const userId = await requireUserId();

    const food = await prisma.food.findFirst({ where: { id: values.foodId, userId } });
    if (!food) return fail('That food could not be found.');

    const validation = validateYieldPct(values.yieldPct);
    if (!validation.ok) return fail(validation.message ?? 'That yield is not valid.');
    if (validation.needsConfirmation && !values.confirmYield) {
      return { ok: false, error: validation.message!, needsConfirmation: true };
    }

    await prisma.$transaction([
      prisma.food.update({
        where: { id: values.foodId },
        data: { cookingYieldPct: values.yieldPct, tracksYield: true },
      }),
      prisma.cookingYield.create({
        data: {
          userId,
          foodId: values.foodId,
          foodName: food.name,
          yieldPct: values.yieldPct,
          source: 'MANUAL',
          note: values.note ?? 'Set by hand.',
        },
      }),
    ]);

    revalidatePrep();
    revalidatePath('/plan/foods');
    return ok(undefined, `${food.name} yield set to ${values.yieldPct}%.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

const portionSchema = z.object({
  id: cuid,
  status: z.enum(['READY', 'FROZEN', 'THAWING', 'CONSUMED', 'DISCARDED']).optional(),
  location: z.enum(['PANTRY', 'FRIDGE', 'FREEZER']).optional(),
  portions: optionalQuantity,
  useByDate: z.preprocess((v) => (v === '' || v == null ? undefined : v), dayKey.optional()),
  thawOn: z.preprocess((v) => (v === '' || v == null ? undefined : v), dayKey.optional()),
  notes: optionalText,
});

export async function updateStoragePortion(input: unknown): Promise<ActionResult<undefined>> {
  return runAction(portionSchema, input, async (values) => {
    const userId = await requireUserId();

    const portion = await prisma.storagePortion.findFirst({ where: { id: values.id, userId } });
    if (!portion) return fail('That storage entry could not be found.');

    await prisma.storagePortion.update({
      where: { id: values.id },
      data: {
        ...(values.status ? { status: values.status } : {}),
        ...(values.location ? { location: values.location } : {}),
        ...(values.portions != null ? { portions: Math.round(values.portions) } : {}),
        ...(values.useByDate ? { useByDate: toDbDate(values.useByDate) } : {}),
        ...(values.thawOn ? { thawOn: toDbDate(values.thawOn) } : {}),
        ...(values.notes !== undefined ? { notes: values.notes ?? null } : {}),
      },
    });

    revalidatePrep();
    revalidatePath('/today');
    return ok(undefined);
  });
}

/** One-tap "I moved it to the fridge": location, status and thaw date together. */
export async function moveToFridge(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const portion = await prisma.storagePortion.findFirst({ where: { id, userId } });
    if (!portion) return fail('That storage entry could not be found.');

    await prisma.storagePortion.update({
      where: { id },
      data: { location: 'FRIDGE', status: 'THAWING', refrigerateOn: toDbDate(todayKey()) },
    });

    revalidatePrep();
    revalidatePath('/today');
    return ok(undefined, `${portion.label} moved to the fridge.`);
  });
}

export async function deleteStoragePortion(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const portion = await prisma.storagePortion.findFirst({ where: { id, userId } });
    if (!portion) return fail('That storage entry could not be found.');

    await prisma.storagePortion.delete({ where: { id } });
    revalidatePrep();
    return ok(undefined, 'Storage entry removed.');
  });
}

const manualPortionSchema = z.object({
  foodId: optionalCuid,
  label: nonEmptyName,
  portions: positiveQuantity,
  portionSizeG: optionalQuantity,
  location: z.enum(['PANTRY', 'FRIDGE', 'FREEZER']),
  prepDate: dayKey,
  useByDate: z.preprocess((v) => (v === '' || v == null ? undefined : v), dayKey.optional()),
});

export async function addStoragePortion(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(manualPortionSchema, input, async (values) => {
    const userId = await requireUserId();
    const settings = await prisma.settings.findUnique({ where: { userId } });

    if (values.foodId) {
      const food = await prisma.food.findFirst({
        where: { id: values.foodId, userId },
        select: { id: true },
      });
      if (!food) return fail('That food could not be found.');
    }

    const useBy =
      values.useByDate ??
      addDays(values.prepDate, values.location === 'FREEZER' ? 90 : (settings?.fridgeDays ?? 3));

    const created = await prisma.storagePortion.create({
      data: {
        userId,
        foodId: values.foodId ?? null,
        label: values.label,
        portions: Math.round(values.portions),
        portionSizeG: values.portionSizeG ?? null,
        location: values.location,
        status: values.location === 'FREEZER' ? 'FROZEN' : 'READY',
        prepDate: toDbDate(values.prepDate),
        useByDate: toDbDate(useBy),
        thawOn:
          values.location === 'FREEZER'
            ? toDbDate(addDays(useBy, -(settings?.freezerThawLeadDays ?? 1)))
            : null,
      },
    });

    revalidatePrep();
    return ok({ id: created.id }, 'Added to storage.');
  });
}
