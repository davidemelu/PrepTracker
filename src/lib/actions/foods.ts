'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { UserFacingError } from '@/lib/errors';
import { requireUserId } from '@/lib/auth/guards';
import { validateYieldPct } from '@/lib/domain/yield';
import {
  checkbox,
  cuid,
  nonEmptyName,
  numberish,
  optionalCuid,
  optionalQuantity,
  optionalText,
  unitString,
} from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

/** Foods, substitution groups and bulk-buy classification. */

const CATEGORIES = [
  'PROTEIN',
  'CARBOHYDRATE',
  'FRUIT',
  'VEGETABLE',
  'FAT',
  'DAIRY',
  'SUPPLEMENT',
  'SEASONING',
  'BEVERAGE',
  'OTHER',
] as const;
const BULK_CLASSES = ['EXCELLENT', 'GOOD_IF_FROZEN', 'BUY_FRESH', 'NOT_CLASSIFIED'] as const;
const LOCATIONS = ['PANTRY', 'FRIDGE', 'FREEZER'] as const;

function revalidateFoods() {
  revalidatePath('/plan/foods');
  revalidatePath('/plan');
  revalidatePath('/groceries');
  revalidatePath('/more/bulk');
  revalidatePath('/prep/yields');
}

const optionalMacro = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  numberish.refine((v) => v >= 0, 'Nutrition values cannot be negative.').optional(),
);

const foodSchema = z.object({
  id: optionalCuid,
  name: nonEmptyName,
  category: z.enum(CATEGORIES),
  defaultUnit: unitString,
  department: optionalText,
  bulkClass: z.enum(BULK_CLASSES),
  storageDefault: z.enum(LOCATIONS),
  packageSize: optionalQuantity,
  packageUnit: z.preprocess((v) => (v === '' || v === null ? undefined : v), unitString.optional()),
  tracksYield: checkbox.optional(),
  cookingYieldPct: z.preprocess((v) => (v === '' || v === null ? undefined : v), numberish.optional()),
  confirmYield: z.boolean().optional(),
  nutritionBasisQty: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    numberish.refine((v) => v > 0, 'The nutrition basis must be greater than 0.').optional(),
  ),
  nutritionBasisUnit: z.preprocess((v) => (v === '' || v === null ? undefined : v), unitString.optional()),
  calories: optionalMacro,
  protein: optionalMacro,
  carbs: optionalMacro,
  fat: optionalMacro,
  fibre: optionalMacro,
  sodium: optionalMacro,
  notes: optionalText,
  active: checkbox.optional(),
});

export async function saveFood(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(foodSchema, input, async (values) => {
    const userId = await requireUserId();

    if (values.packageSize != null && !values.packageUnit) {
      return fail('Choose a unit for the package size.', {
        fieldErrors: { packageUnit: ['Choose a unit.'] },
      });
    }

    const existing = values.id
      ? await prisma.food.findFirst({ where: { id: values.id, userId } })
      : null;
    if (values.id && !existing) return fail('That food could not be found.');

    if (values.cookingYieldPct != null) {
      const validation = validateYieldPct(values.cookingYieldPct);
      if (!validation.ok) {
        return fail(validation.message ?? 'That cooking yield is not valid.', {
          fieldErrors: { cookingYieldPct: [validation.message ?? 'Invalid yield.'] },
        });
      }

      // Only ask about an above-100% yield when it is actually being changed.
      // Otherwise renaming rice would demand you re-confirm its 300% yield
      // every single time, which trains you to click through the warning.
      const yieldUnchanged = existing != null && existing.cookingYieldPct === values.cookingYieldPct;

      if (validation.needsConfirmation && !values.confirmYield && !yieldUnchanged) {
        return {
          ok: false,
          error: validation.message ?? 'Confirm this cooking yield.',
          needsConfirmation: true,
          fieldErrors: { cookingYieldPct: [validation.message ?? ''] },
        };
      }
    }

    const data = {
      name: values.name,
      category: values.category,
      defaultUnit: values.defaultUnit,
      department: values.department ?? null,
      bulkClass: values.bulkClass,
      storageDefault: values.storageDefault,
      packageSize: values.packageSize ?? null,
      packageUnit: values.packageUnit ?? null,
      tracksYield: values.tracksYield ?? false,
      cookingYieldPct: values.cookingYieldPct ?? null,
      nutritionBasisQty: values.nutritionBasisQty ?? 100,
      nutritionBasisUnit: values.nutritionBasisUnit ?? 'g',
      calories: values.calories ?? null,
      protein: values.protein ?? null,
      carbs: values.carbs ?? null,
      fat: values.fat ?? null,
      fibre: values.fibre ?? null,
      sodium: values.sodium ?? null,
      notes: values.notes ?? null,
      active: values.active ?? true,
    };

    const duplicate = await prisma.food.findFirst({
      where: { userId, name: values.name, ...(values.id ? { NOT: { id: values.id } } : {}) },
    });
    if (duplicate) {
      return fail(`You already have a food called "${values.name}".`, {
        fieldErrors: { name: ['That name is already used.'] },
      });
    }

    if (values.id && existing) {
      await prisma.food.update({ where: { id: values.id }, data });

      // Record a manual yield change so the yield history stays complete.
      if (values.cookingYieldPct != null && values.cookingYieldPct !== existing.cookingYieldPct) {
        await prisma.cookingYield.create({
          data: {
            userId,
            foodId: values.id,
            foodName: values.name,
            yieldPct: values.cookingYieldPct,
            source: 'MANUAL',
            note: 'Edited by hand on the food.',
          },
        });
      }

      revalidateFoods();
      return ok({ id: values.id }, 'Food updated.');
    }

    const created = await prisma.food.create({ data: { userId, ...data } });

    if (values.cookingYieldPct != null) {
      await prisma.cookingYield.create({
        data: {
          userId,
          foodId: created.id,
          foodName: created.name,
          yieldPct: values.cookingYieldPct,
          source: 'DEFAULT',
          note: 'Starting estimate.',
        },
      });
    }

    revalidateFoods();
    return ok({ id: created.id }, 'Food added.');
  });
}

const idSchema = z.object({ id: cuid });

const deleteFoodSchema = z.object({ id: cuid, confirm: z.boolean().optional() });

/**
 * Delete a food.
 *
 * The database refuses to delete a food the plan still uses (`onDelete:
 * Restrict`), so removing those lines is an explicit step here rather than a
 * cascade nobody sees. Which meals lose a line is said before anything is
 * deleted, not reported afterwards.
 *
 * Past days are untouched either way: journal rows keep their own copy of the
 * name, quantity and macros, and only the link back to the food is cleared.
 */
export async function deleteFood(input: {
  id: string;
  confirm?: boolean;
}): Promise<ActionResult<undefined>> {
  return runAction(deleteFoodSchema, input, async ({ id, confirm }) => {
    const userId = await requireUserId();
    const food = await prisma.food.findFirst({ where: { id, userId } });
    if (!food) return fail('That food could not be found.');

    const usedIn = await prisma.mealIngredient.findMany({
      where: { foodId: id, meal: { mealPlan: { userId } } },
      select: { id: true, meal: { select: { name: true } } },
    });

    if (usedIn.length > 0 && !confirm) {
      const meals = [...new Set(usedIn.map((row) => row.meal.name))];
      const named =
        meals.length === 1
          ? meals[0]
          : `${meals.slice(0, -1).join(', ')} and ${meals[meals.length - 1]}`;
      return fail(
        `${food.name} is an ingredient of ${named}. Deleting it removes ${
          usedIn.length === 1 ? 'that line' : 'those lines'
        } from the plan. Days you have already logged keep their record.`,
        { needsConfirmation: true },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.mealIngredient.deleteMany({
        where: { foodId: id, meal: { mealPlan: { userId } } },
      });
      await tx.food.delete({ where: { id } });
    });

    revalidateFoods();
    return ok(
      undefined,
      usedIn.length > 0
        ? `${food.name} deleted and removed from ${usedIn.length} plan ingredient${usedIn.length === 1 ? '' : 's'}. Past days are unchanged.`
        : `${food.name} deleted.`,
    );
  });
}

const bulkSchema = z.object({ id: cuid, bulkClass: z.enum(BULK_CLASSES) });

export async function setBulkClass(input: {
  id: string;
  bulkClass: (typeof BULK_CLASSES)[number];
}): Promise<ActionResult<undefined>> {
  return runAction(bulkSchema, input, async ({ id, bulkClass }) => {
    const userId = await requireUserId();
    const food = await prisma.food.findFirst({ where: { id, userId } });
    if (!food) return fail('That food could not be found.');

    await prisma.food.update({ where: { id }, data: { bulkClass } });
    revalidateFoods();
    return ok(undefined);
  });
}

/* -------------------------------------------------------------------------- */
/* Substitution groups                                                         */
/* -------------------------------------------------------------------------- */

const groupSchema = z.object({
  id: optionalCuid,
  name: nonEmptyName,
  notes: optionalText,
  foodIds: z.array(cuid).min(2, 'A substitution group needs at least two foods to choose between.'),
  preferredFoodId: optionalCuid,
});

export async function saveOptionGroup(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(groupSchema, input, async (values) => {
    const userId = await requireUserId();

    const foods = await prisma.food.findMany({
      where: { id: { in: values.foodIds }, userId },
      select: { id: true },
    });
    if (foods.length !== values.foodIds.length) return fail('Some of those foods could not be found.');

    const preferred =
      values.preferredFoodId && values.foodIds.includes(values.preferredFoodId)
        ? values.preferredFoodId
        : values.foodIds[0]!;

    const duplicate = await prisma.foodOptionGroup.findFirst({
      where: { userId, name: values.name, ...(values.id ? { NOT: { id: values.id } } : {}) },
    });
    if (duplicate) {
      return fail(`You already have a group called "${values.name}".`, {
        fieldErrors: { name: ['That name is already used.'] },
      });
    }

    const groupId = await prisma.$transaction(async (tx) => {
      let id = values.id;

      if (id) {
        const existing = await tx.foodOptionGroup.findFirst({ where: { id, userId } });
        if (!existing) throw new UserFacingError('That group could not be found.');
        await tx.foodOptionGroup.update({
          where: { id },
          data: { name: values.name, notes: values.notes ?? null, preferredFoodId: preferred },
        });
        await tx.foodOptionGroupMember.deleteMany({ where: { groupId: id } });
      } else {
        const created = await tx.foodOptionGroup.create({
          data: { userId, name: values.name, notes: values.notes ?? null, preferredFoodId: preferred },
        });
        id = created.id;
      }

      await tx.foodOptionGroupMember.createMany({
        data: values.foodIds.map((foodId, index) => ({ groupId: id!, foodId, sortOrder: index })),
      });

      return id!;
    });

    revalidateFoods();
    revalidatePath('/plan/groups');
    return ok({ id: groupId }, values.id ? 'Group updated.' : 'Group created.');
  });
}

export async function deleteOptionGroup(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const group = await prisma.foodOptionGroup.findFirst({ where: { id, userId } });
    if (!group) return fail('That group could not be found.');

    const used = await prisma.mealIngredient.count({ where: { optionGroupId: id } });
    if (used > 0) {
      return fail(
        `"${group.name}" is used by ${used} ingredient${used === 1 ? '' : 's'}. Change those to a single food first.`,
      );
    }

    await prisma.foodOptionGroup.delete({ where: { id } });
    revalidateFoods();
    revalidatePath('/plan/groups');
    return ok(undefined, 'Group deleted.');
  });
}

const preferenceSchema = z.object({
  optionGroupId: cuid,
  foodId: cuid,
  /** Apply to a single week rather than changing the default. */
  weekStart: z.string().optional(),
});

/** Choose this week's option, or change the group default. */
export async function setOptionPreference(input: {
  optionGroupId: string;
  foodId: string;
  weekStart?: string;
}): Promise<ActionResult<undefined>> {
  return runAction(preferenceSchema, input, async ({ optionGroupId, foodId, weekStart }) => {
    const userId = await requireUserId();

    const member = await prisma.foodOptionGroupMember.findFirst({
      where: { groupId: optionGroupId, foodId, group: { userId } },
      include: { food: { select: { name: true } }, group: { select: { name: true } } },
    });
    if (!member) return fail('That food is not part of this group.');

    if (weekStart) {
      const { toDbDate, isValidDayKey } = await import('@/lib/domain/dates');
      if (!isValidDayKey(weekStart)) return fail('That week is not valid.');

      await prisma.planWeekPreference.upsert({
        where: { userId_weekStart_optionGroupId: { userId, weekStart: toDbDate(weekStart), optionGroupId } },
        update: { foodId },
        create: { userId, weekStart: toDbDate(weekStart), optionGroupId, foodId },
      });
    } else {
      await prisma.foodOptionGroup.update({ where: { id: optionGroupId }, data: { preferredFoodId: foodId } });
    }

    revalidateFoods();
    revalidatePath('/plan/groups');
    revalidatePath('/today');
    return ok(
      undefined,
      `${member.group.name}: using ${member.food.name}${weekStart ? ' this week' : ' by default'}.`,
    );
  });
}
