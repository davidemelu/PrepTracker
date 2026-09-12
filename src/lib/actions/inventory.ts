'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/auth/guards';
import { toDbDate } from '@/lib/domain/dates';
import {
  cuid,
  dayKey,
  idSchema,
  nonEmptyName,
  numberish,
  optionalCuid,
  optionalQuantity,
  optionalText,
  quantity,
  unitString,
} from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

/** Pantry, fridge and freezer stock levels. */

const LOCATIONS = ['PANTRY', 'FRIDGE', 'FREEZER'] as const;

function revalidateInventory() {
  revalidatePath('/more/inventory');
  revalidatePath('/groceries');
  revalidatePath('/today');
}

const itemSchema = z.object({
  id: optionalCuid,
  foodId: optionalCuid,
  name: nonEmptyName,
  quantity,
  unit: unitString,
  location: z.enum(LOCATIONS),
  lowStockThreshold: optionalQuantity,
  expiresOn: z.preprocess((v) => (v === '' || v == null ? undefined : v), dayKey.optional()),
  notes: optionalText,
});

export async function saveInventoryItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(itemSchema, input, async (values) => {
    const userId = await requireUserId();

    if (values.foodId) {
      const food = await prisma.food.findFirst({ where: { id: values.foodId, userId } });
      if (!food) return fail('That food could not be found.');
    }

    const data = {
      foodId: values.foodId ?? null,
      name: values.name,
      quantity: values.quantity,
      unit: values.unit,
      location: values.location,
      lowStockThreshold: values.lowStockThreshold ?? null,
      expiresOn: values.expiresOn ? toDbDate(values.expiresOn) : null,
      notes: values.notes ?? null,
    };

    if (values.id) {
      const existing = await prisma.inventoryItem.findFirst({ where: { id: values.id, userId } });
      if (!existing) return fail('That inventory item could not be found.');

      await prisma.inventoryItem.update({ where: { id: values.id }, data });
      revalidateInventory();
      return ok({ id: values.id }, 'Inventory updated.');
    }

    const created = await prisma.inventoryItem.create({ data: { userId, ...data } });
    revalidateInventory();
    return ok({ id: created.id }, `${values.name} added.`);
  });
}

const adjustSchema = z.object({
  id: cuid,
  delta: numberish.refine((v) => Number.isFinite(v), 'Enter a number.'),
});

/** Quick +/- from the list, clamped so stock can never go negative. */
export async function adjustInventoryQuantity(input: {
  id: string;
  delta: number;
}): Promise<ActionResult<{ quantity: number }>> {
  return runAction(adjustSchema, input, async ({ id, delta }) => {
    const userId = await requireUserId();
    const item = await prisma.inventoryItem.findFirst({ where: { id, userId } });
    if (!item) return fail('That inventory item could not be found.');

    const next = Math.max(0, item.quantity + delta);
    await prisma.inventoryItem.update({ where: { id }, data: { quantity: next } });

    revalidateInventory();
    return ok({ quantity: next });
  });
}


export async function deleteInventoryItem(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const item = await prisma.inventoryItem.findFirst({ where: { id, userId } });
    if (!item) return fail('That inventory item could not be found.');

    await prisma.inventoryItem.delete({ where: { id } });
    revalidateInventory();
    return ok(undefined, `${item.name} removed.`);
  });
}
