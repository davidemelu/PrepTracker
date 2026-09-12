'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/auth/guards';
import { addDays, startOfWeek, toDbDate, todayKey } from '@/lib/domain/dates';
import { CATEGORY_LABELS, type FoodCategoryKey } from '@/lib/domain/grocery';
import { buildGroceryLines } from '@/lib/server/grocery-service';
import {
  checkbox,
  cuid,
  dayKey,
  nonEmptyName,
  numberish,
  optionalText,
  positiveQuantity,
  unitString,
} from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FoodCategoryKey[];

function revalidateGroceries(id?: string) {
  revalidatePath('/groceries');
  if (id) {
    revalidatePath(`/groceries/${id}`);
    revalidatePath(`/groceries/${id}/shop`);
  }
  revalidatePath('/today');
}

const generateSchema = z.object({
  name: z.preprocess((v) => (v === '' || v == null ? undefined : v), nonEmptyName.optional()),
  startDate: dayKey,
  daysPlanned: numberish
    .refine((v) => Number.isInteger(v) && v >= 1, 'Plan at least one day.')
    .refine((v) => v <= 60, 'Planning more than 60 days at once is not supported.'),
  /** dayTypeId -> number of days. */
  dayTypeCounts: z.record(z.string(), numberish.refine((v) => v >= 0, 'Days cannot be negative.')),
  applyInventory: z.boolean().optional(),
  includeSupplements: z.boolean().optional(),
  includeOptional: z.boolean().optional(),
});

/**
 * Build a grocery week from the plan.
 *
 * The result is written as ordinary rows, so anything the generator got wrong
 * can be edited by hand afterwards without regenerating.
 */
export async function generateGroceryWeek(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(generateSchema, input, async (values) => {
    const userId = await requireUserId();

    const counts = Object.entries(values.dayTypeCounts).map(([dayTypeId, days]) => ({
      dayTypeId,
      days: Math.floor(days),
    }));

    const totalDays = counts.reduce((sum, c) => sum + c.days, 0);
    if (totalDays === 0) {
      return fail('Set how many days of each type you are shopping for.');
    }

    const { lines, warnings } = await buildGroceryLines({
      userId,
      startDate: values.startDate,
      daysPlanned: values.daysPlanned,
      dayTypeCounts: counts,
      applyInventory: values.applyInventory ?? true,
      includeSupplements: values.includeSupplements ?? false,
      includeOptional: values.includeOptional ?? true,
    });

    if (lines.length === 0) {
      return fail(
        warnings[0] ?? 'Nothing to buy. Check that your plan has meals for the day types you selected.',
      );
    }

    const dayTypes = await prisma.dayType.findMany({ where: { userId } });
    const trainingDays = counts
      .filter((c) => dayTypes.find((d) => d.id === c.dayTypeId)?.isTraining)
      .reduce((sum, c) => sum + c.days, 0);

    const week = await prisma.groceryWeek.create({
      data: {
        userId,
        name: values.name ?? `Week of ${values.startDate}`,
        startDate: toDbDate(values.startDate),
        endDate: toDbDate(addDays(values.startDate, Math.max(0, values.daysPlanned - 1))),
        daysPlanned: values.daysPlanned,
        trainingDays,
        restDays: totalDays - trainingDays,
        status: 'ACTIVE',
        inventoryApplied: values.applyInventory ?? true,
        notes: warnings.length > 0 ? warnings.join('\n') : null,
        items: {
          create: lines.map((line, index) => ({
            foodId: line.foodId,
            name: line.name,
            category: line.category,
            department: line.department,
            requiredQty: line.requiredQty,
            requiredUnit: line.requiredUnit,
            shoppingQty: line.shoppingQty,
            shoppingUnit: line.shoppingUnit,
            cookedQty: line.cookedQty,
            rawQty: line.rawQty,
            yieldPctUsed: line.yieldPctUsed,
            inventoryQty: line.inventoryQty,
            inventoryNote: line.inventoryNote,
            estimatedPackages: line.estimatedPackages,
            packageSize: line.packageSize,
            packageUnit: line.packageUnit,
            // Nothing left to buy once inventory covers it.
            haveAlready: line.shoppingQty <= 0,
            sortOrder: index,
          })),
        },
      },
    });

    revalidateGroceries(week.id);
    return ok({ id: week.id }, `Grocery list created with ${lines.length} items.`);
  });
}

const itemToggleSchema = z.object({ id: cuid, value: z.boolean().optional() });

export async function togglePurchased(input: { id: string; value?: boolean }): Promise<ActionResult<undefined>> {
  return runAction(itemToggleSchema, input, async ({ id, value }) => {
    const userId = await requireUserId();
    const item = await prisma.groceryItem.findFirst({
      where: { id, groceryWeek: { userId } },
      select: { id: true, purchased: true, groceryWeekId: true },
    });
    if (!item) return fail('That item could not be found.');

    await prisma.groceryItem.update({
      where: { id },
      data: { purchased: value ?? !item.purchased },
    });

    revalidateGroceries(item.groceryWeekId);
    return ok(undefined);
  });
}

export async function toggleHaveAlready(input: { id: string; value?: boolean }): Promise<ActionResult<undefined>> {
  return runAction(itemToggleSchema, input, async ({ id, value }) => {
    const userId = await requireUserId();
    const item = await prisma.groceryItem.findFirst({
      where: { id, groceryWeek: { userId } },
      select: { id: true, haveAlready: true, groceryWeekId: true },
    });
    if (!item) return fail('That item could not be found.');

    await prisma.groceryItem.update({
      where: { id },
      data: { haveAlready: value ?? !item.haveAlready },
    });

    revalidateGroceries(item.groceryWeekId);
    return ok(undefined);
  });
}

const itemSchema = z.object({
  id: z.preprocess((v) => (v === '' || v == null ? undefined : v), cuid.optional()),
  groceryWeekId: cuid,
  name: nonEmptyName,
  category: z.enum(CATEGORIES as [FoodCategoryKey, ...FoodCategoryKey[]]),
  department: optionalText,
  shoppingQty: positiveQuantity,
  shoppingUnit: unitString,
  notes: optionalText,
});

/** Add or edit an item by hand, including ad hoc items not in the plan. */
export async function saveGroceryItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(itemSchema, input, async (values) => {
    const userId = await requireUserId();

    const week = await prisma.groceryWeek.findFirst({ where: { id: values.groceryWeekId, userId } });
    if (!week) return fail('That grocery list could not be found.');

    if (values.id) {
      const existing = await prisma.groceryItem.findFirst({
        where: { id: values.id, groceryWeekId: values.groceryWeekId },
      });
      if (!existing) return fail('That item could not be found.');

      await prisma.groceryItem.update({
        where: { id: values.id },
        data: {
          name: values.name,
          category: values.category,
          department: values.department ?? null,
          shoppingQty: values.shoppingQty,
          shoppingUnit: values.shoppingUnit,
          notes: values.notes ?? null,
          // Editing an item by hand makes the plan-derived amount stale.
          requiredQty: existing.isAdHoc ? values.shoppingQty : existing.requiredQty,
        },
      });

      revalidateGroceries(values.groceryWeekId);
      return ok({ id: values.id }, 'Item updated.');
    }

    const count = await prisma.groceryItem.count({ where: { groceryWeekId: values.groceryWeekId } });
    const created = await prisma.groceryItem.create({
      data: {
        groceryWeekId: values.groceryWeekId,
        name: values.name,
        category: values.category,
        department: values.department ?? null,
        requiredQty: values.shoppingQty,
        requiredUnit: values.shoppingUnit,
        shoppingQty: values.shoppingQty,
        shoppingUnit: values.shoppingUnit,
        notes: values.notes ?? null,
        isAdHoc: true,
        sortOrder: count,
      },
    });

    revalidateGroceries(values.groceryWeekId);
    return ok({ id: created.id }, `${values.name} added.`);
  });
}

const idSchema = z.object({ id: cuid });

export async function deleteGroceryItem(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const item = await prisma.groceryItem.findFirst({
      where: { id, groceryWeek: { userId } },
      select: { id: true, name: true, groceryWeekId: true },
    });
    if (!item) return fail('That item could not be found.');

    await prisma.groceryItem.delete({ where: { id } });
    revalidateGroceries(item.groceryWeekId);
    return ok(undefined, `${item.name} removed.`);
  });
}

const statusSchema = z.object({
  id: cuid,
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']),
});

export async function setGroceryWeekStatus(input: {
  id: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
}): Promise<ActionResult<undefined>> {
  return runAction(statusSchema, input, async ({ id, status }) => {
    const userId = await requireUserId();
    const week = await prisma.groceryWeek.findFirst({ where: { id, userId } });
    if (!week) return fail('That grocery list could not be found.');

    await prisma.groceryWeek.update({ where: { id }, data: { status } });
    revalidateGroceries(id);
    return ok(undefined, status === 'COMPLETED' ? 'Shopping marked as done.' : 'List updated.');
  });
}

export async function deleteGroceryWeek(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const week = await prisma.groceryWeek.findFirst({ where: { id, userId } });
    if (!week) return fail('That grocery list could not be found.');

    await prisma.groceryWeek.delete({ where: { id } });
    revalidateGroceries();
    return ok(undefined, 'Grocery list deleted.');
  });
}

const stockSchema = z.object({ id: cuid });

/**
 * Push everything you bought into the pantry, so the next list can subtract it.
 * Only items marked purchased are added, and only where a food is linked.
 */
export async function addPurchasesToInventory(input: { id: string }): Promise<ActionResult<{ added: number }>> {
  return runAction(stockSchema, input, async ({ id }) => {
    const userId = await requireUserId();

    const week = await prisma.groceryWeek.findFirst({
      where: { id, userId },
      include: { items: { where: { purchased: true, foodId: { not: null } } } },
    });
    if (!week) return fail('That grocery list could not be found.');
    if (week.items.length === 0) return fail('No purchased items are linked to a food yet.');

    const { convert } = await import('@/lib/domain/units');
    let added = 0;

    for (const item of week.items) {
      const existing = await prisma.inventoryItem.findFirst({
        where: { userId, foodId: item.foodId! },
      });

      if (existing) {
        const converted = convert(item.shoppingQty, item.shoppingUnit, existing.unit);
        if (converted === null) continue;
        await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + converted },
        });
      } else {
        const food = await prisma.food.findFirst({ where: { id: item.foodId!, userId } });
        await prisma.inventoryItem.create({
          data: {
            userId,
            foodId: item.foodId,
            name: item.name,
            quantity: item.shoppingQty,
            unit: item.shoppingUnit,
            location: food?.storageDefault ?? 'PANTRY',
          },
        });
      }
      added += 1;
    }

    revalidatePath('/more/inventory');
    revalidateGroceries(id);
    return ok({ added }, `${added} item${added === 1 ? '' : 's'} added to your inventory.`);
  });
}

/** Prefill for the "new grocery week" sheet. */
export async function suggestGroceryWeekDefaults(): Promise<
  ActionResult<{
    startDate: string;
    daysPlanned: number;
    dayTypes: Array<{ dayTypeId: string; dayTypeName: string; days: number }>;
  }>
> {
  return runAction(z.object({}), {}, async () => {
    const userId = await requireUserId();
    const settings = await prisma.settings.findUnique({ where: { userId } });
    const days = settings?.defaultPlanDays ?? 7;
    const start = startOfWeek(todayKey(), settings?.weekStartsOn ?? 1);

    const { suggestDayTypeCounts } = await import('@/lib/server/grocery-service');
    const dayTypes = await suggestDayTypeCounts(userId, days);

    return ok({ startDate: start, daysPlanned: days, dayTypes });
  });
}

// NOTE: a 'use server' file may only export async functions. Shared constants
// such as the category options live in src/lib/domain/grocery.ts.

const noteSchema = z.object({ id: cuid, notes: optionalText, haveAlready: checkbox.optional() });

export async function updateGroceryItemNotes(input: {
  id: string;
  notes?: string;
}): Promise<ActionResult<undefined>> {
  return runAction(noteSchema, input, async ({ id, notes }) => {
    const userId = await requireUserId();
    const item = await prisma.groceryItem.findFirst({
      where: { id, groceryWeek: { userId } },
      select: { groceryWeekId: true },
    });
    if (!item) return fail('That item could not be found.');

    await prisma.groceryItem.update({ where: { id }, data: { notes: notes ?? null } });
    revalidateGroceries(item.groceryWeekId);
    return ok(undefined, 'Note saved.');
  });
}
