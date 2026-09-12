'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { UserFacingError } from '@/lib/errors';
import { requireUserId } from '@/lib/auth/guards';
import { generateMealTimes } from '@/lib/domain/schedule';
import {
  checkbox,
  cuid,
  idSchema,
  nonEmptyName,
  numberish,
  optionalCuid,
  optionalText,
  optionalTimeString,
  quantity,
  unitString,
} from '@/lib/validation/common';
import { fail, ok, runAction, type ActionResult } from './result';

/**
 * Meal plan editing.
 *
 * Nothing here touches a stored day. Editing the plan changes what *future*
 * days will be generated from; existing days keep their snapshot until you
 * explicitly rebuild them.
 */

const STATES = ['RAW', 'COOKED', 'AS_IS'] as const;

function revalidatePlan() {
  revalidatePath('/plan');
  revalidatePath('/plan/meals', 'layout');
  revalidatePath('/groceries');
}

async function assertOwnsMeal(userId: string, mealId: string) {
  const meal = await prisma.meal.findFirst({
    where: { id: mealId, mealPlan: { userId } },
    include: { mealPlan: { select: { id: true } } },
  });
  if (!meal) throw new UserFacingError('That meal could not be found.');
  return meal;
}

/* -------------------------------------------------------------------------- */
/* Plans                                                                       */
/* -------------------------------------------------------------------------- */

const planSchema = z.object({
  id: optionalCuid,
  name: nonEmptyName,
  description: optionalText,
});

export async function saveMealPlan(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(planSchema, input, async (values) => {
    const userId = await requireUserId();

    if (values.id) {
      const existing = await prisma.mealPlan.findFirst({ where: { id: values.id, userId } });
      if (!existing) return fail('That plan could not be found.');
      await prisma.mealPlan.update({
        where: { id: values.id },
        data: { name: values.name, description: values.description ?? null },
      });
      revalidatePlan();
      return ok({ id: values.id }, 'Plan updated.');
    }

    const hasActive = await prisma.mealPlan.count({ where: { userId, isActive: true } });
    const created = await prisma.mealPlan.create({
      data: {
        userId,
        name: values.name,
        description: values.description ?? null,
        isActive: hasActive === 0,
      },
    });
    revalidatePlan();
    return ok({ id: created.id }, 'Plan created.');
  });
}


/** Exactly one plan is active; the others stay available to switch back to. */
export async function activateMealPlan(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const plan = await prisma.mealPlan.findFirst({ where: { id, userId } });
    if (!plan) return fail('That plan could not be found.');

    await prisma.$transaction([
      prisma.mealPlan.updateMany({ where: { userId }, data: { isActive: false } }),
      prisma.mealPlan.update({ where: { id }, data: { isActive: true, archivedAt: null } }),
    ]);

    revalidatePlan();
    revalidatePath('/today');
    return ok(undefined, `"${plan.name}" is now the active plan. Existing days keep their current meals until you rebuild them.`);
  });
}

export async function deleteMealPlan(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const plan = await prisma.mealPlan.findFirst({ where: { id, userId } });
    if (!plan) return fail('That plan could not be found.');

    const total = await prisma.mealPlan.count({ where: { userId } });
    if (total <= 1) return fail('This is your only plan. Create another one before deleting it.');

    await prisma.mealPlan.delete({ where: { id } });

    if (plan.isActive) {
      const next = await prisma.mealPlan.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
      if (next) await prisma.mealPlan.update({ where: { id: next.id }, data: { isActive: true } });
    }

    revalidatePlan();
    return ok(undefined, 'Plan deleted. Past days are unchanged.');
  });
}

/** Copy a plan, so a change can be trialled without losing the original. */
export async function duplicateMealPlan(input: { id: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();

    const source = await prisma.mealPlan.findFirst({
      where: { id, userId },
      include: {
        meals: {
          orderBy: { sortOrder: 'asc' },
          include: { dayTypeSettings: true, ingredients: { include: { quantities: true } } },
        },
      },
    });
    if (!source) return fail('That plan could not be found.');

    const copy = await prisma.mealPlan.create({
      data: {
        userId,
        name: `${source.name} (copy)`,
        description: source.description,
        isActive: false,
      },
    });

    for (const meal of source.meals) {
      await prisma.meal.create({
        data: {
          mealPlanId: copy.id,
          name: meal.name,
          description: meal.description,
          sortOrder: meal.sortOrder,
          defaultTime: meal.defaultTime,
          windowMinutes: meal.windowMinutes,
          isPreWorkout: meal.isPreWorkout,
          isPostWorkout: meal.isPostWorkout,
          active: meal.active,
          dayTypeSettings: {
            create: meal.dayTypeSettings.map((s) => ({
              dayTypeId: s.dayTypeId,
              included: s.included,
              timeOverride: s.timeOverride,
            })),
          },
          ingredients: {
            create: meal.ingredients.map((ingredient) => ({
              foodId: ingredient.foodId,
              optionGroupId: ingredient.optionGroupId,
              unit: ingredient.unit,
              state: ingredient.state,
              required: ingredient.required,
              sortOrder: ingredient.sortOrder,
              notes: ingredient.notes,
              quantities: {
                create: ingredient.quantities.map((q) => ({
                  dayTypeId: q.dayTypeId,
                  quantity: q.quantity,
                })),
              },
            })),
          },
        },
      });
    }

    revalidatePlan();
    return ok({ id: copy.id }, 'Plan duplicated.');
  });
}

/* -------------------------------------------------------------------------- */
/* Meals                                                                       */
/* -------------------------------------------------------------------------- */

const mealSchema = z.object({
  id: optionalCuid,
  mealPlanId: cuid,
  name: nonEmptyName,
  description: optionalText,
  defaultTime: optionalTimeString,
  windowMinutes: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    numberish.refine((v) => v >= 0 && v <= 240, 'An eating window must be between 0 and 240 minutes.').optional(),
  ),
  isPreWorkout: checkbox.optional(),
  isPostWorkout: checkbox.optional(),
  active: checkbox.optional(),
  /** Day type ids this meal is eaten on. */
  dayTypeIds: z.array(cuid).default([]),
});

export async function saveMeal(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(mealSchema, input, async (values) => {
    const userId = await requireUserId();

    const plan = await prisma.mealPlan.findFirst({ where: { id: values.mealPlanId, userId } });
    if (!plan) return fail('That plan could not be found.');

    const dayTypes = await prisma.dayType.findMany({ where: { userId }, select: { id: true } });
    const validDayTypeIds = new Set(dayTypes.map((d) => d.id));
    const selected = values.dayTypeIds.filter((id) => validDayTypeIds.has(id));

    if (selected.length === 0) {
      return fail('Choose at least one day type this meal applies to.', {
        fieldErrors: { dayTypeIds: ['Choose at least one day type.'] },
      });
    }

    const base = {
      name: values.name,
      description: values.description ?? null,
      defaultTime: values.defaultTime ?? null,
      windowMinutes: values.windowMinutes ?? null,
      isPreWorkout: values.isPreWorkout ?? false,
      isPostWorkout: values.isPostWorkout ?? false,
      active: values.active ?? true,
    };

    if (values.id) {
      await assertOwnsMeal(userId, values.id);

      await prisma.$transaction(async (tx) => {
        await tx.meal.update({ where: { id: values.id! }, data: base });
        for (const dayType of dayTypes) {
          await tx.mealDayTypeSetting.upsert({
            where: { mealId_dayTypeId: { mealId: values.id!, dayTypeId: dayType.id } },
            update: { included: selected.includes(dayType.id) },
            create: { mealId: values.id!, dayTypeId: dayType.id, included: selected.includes(dayType.id) },
          });
        }
      });

      revalidatePlan();
      return ok({ id: values.id }, 'Meal updated.');
    }

    const count = await prisma.meal.count({ where: { mealPlanId: values.mealPlanId } });
    const created = await prisma.meal.create({
      data: {
        mealPlanId: values.mealPlanId,
        ...base,
        sortOrder: count,
        dayTypeSettings: {
          create: dayTypes.map((d) => ({ dayTypeId: d.id, included: selected.includes(d.id) })),
        },
      },
    });

    revalidatePlan();
    return ok({ id: created.id }, 'Meal added.');
  });
}

export async function deleteMeal(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const meal = await assertOwnsMeal(userId, id);

    await prisma.meal.delete({ where: { id } });
    revalidatePlan();
    return ok(undefined, `${meal.name} deleted. Days you have already logged are unchanged.`);
  });
}

const reorderSchema = z.object({ mealPlanId: cuid, ids: z.array(cuid).min(1) });

export async function reorderMeals(input: { mealPlanId: string; ids: string[] }): Promise<ActionResult<undefined>> {
  return runAction(reorderSchema, input, async ({ mealPlanId, ids }) => {
    const userId = await requireUserId();
    const plan = await prisma.mealPlan.findFirst({ where: { id: mealPlanId, userId } });
    if (!plan) return fail('That plan could not be found.');

    const owned = await prisma.meal.findMany({ where: { id: { in: ids }, mealPlanId }, select: { id: true } });
    if (owned.length !== ids.length) return fail('Some meals could not be found.');

    await prisma.$transaction(
      ids.map((id, index) => prisma.meal.update({ where: { id }, data: { sortOrder: index } })),
    );
    revalidatePlan();
    return ok(undefined);
  });
}

/* -------------------------------------------------------------------------- */
/* Ingredients                                                                 */
/* -------------------------------------------------------------------------- */

const ingredientSchema = z
  .object({
    id: optionalCuid,
    mealId: cuid,
    foodId: optionalCuid,
    optionGroupId: optionalCuid,
    unit: unitString,
    state: z.enum(STATES),
    required: checkbox.optional(),
    notes: optionalText,
    /** dayTypeId -> quantity. Zero is valid and means "not on this day". */
    quantities: z.record(z.string(), quantity),
  })
  .refine((v) => Boolean(v.foodId) !== Boolean(v.optionGroupId), {
    message: 'Choose either a single food or a substitution group, not both.',
    path: ['foodId'],
  });

export async function saveIngredient(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(ingredientSchema, input, async (values) => {
    const userId = await requireUserId();
    await assertOwnsMeal(userId, values.mealId);

    if (values.foodId) {
      const food = await prisma.food.findFirst({ where: { id: values.foodId, userId } });
      if (!food) return fail('That food could not be found.');
    }
    if (values.optionGroupId) {
      const group = await prisma.foodOptionGroup.findFirst({ where: { id: values.optionGroupId, userId } });
      if (!group) return fail('That substitution group could not be found.');
    }

    const dayTypes = await prisma.dayType.findMany({ where: { userId }, select: { id: true } });
    const validIds = new Set(dayTypes.map((d) => d.id));

    const base = {
      foodId: values.foodId ?? null,
      optionGroupId: values.optionGroupId ?? null,
      unit: values.unit,
      state: values.state,
      required: values.required ?? true,
      notes: values.notes ?? null,
    };

    const ingredientId = await prisma.$transaction(async (tx) => {
      let id = values.id;

      if (id) {
        const existing = await tx.mealIngredient.findFirst({ where: { id, mealId: values.mealId } });
        if (!existing) throw new UserFacingError('That ingredient could not be found.');
        await tx.mealIngredient.update({ where: { id }, data: base });
      } else {
        const count = await tx.mealIngredient.count({ where: { mealId: values.mealId } });
        const created = await tx.mealIngredient.create({
          data: { mealId: values.mealId, ...base, sortOrder: count },
        });
        id = created.id;
      }

      for (const [dayTypeId, value] of Object.entries(values.quantities)) {
        if (!validIds.has(dayTypeId)) continue;
        await tx.mealIngredientQuantity.upsert({
          where: { mealIngredientId_dayTypeId: { mealIngredientId: id!, dayTypeId } },
          update: { quantity: value },
          create: { mealIngredientId: id!, dayTypeId, quantity: value },
        });
      }

      return id!;
    });

    revalidatePlan();
    return ok({ id: ingredientId }, values.id ? 'Ingredient updated.' : 'Ingredient added.');
  });
}

export async function deleteIngredient(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(idSchema, input, async ({ id }) => {
    const userId = await requireUserId();
    const ingredient = await prisma.mealIngredient.findFirst({
      where: { id, meal: { mealPlan: { userId } } },
    });
    if (!ingredient) return fail('That ingredient could not be found.');

    await prisma.mealIngredient.delete({ where: { id } });
    revalidatePlan();
    return ok(undefined, 'Ingredient removed.');
  });
}

const reorderIngredientsSchema = z.object({ mealId: cuid, ids: z.array(cuid).min(1) });

export async function reorderIngredients(input: {
  mealId: string;
  ids: string[];
}): Promise<ActionResult<undefined>> {
  return runAction(reorderIngredientsSchema, input, async ({ mealId, ids }) => {
    const userId = await requireUserId();
    await assertOwnsMeal(userId, mealId);

    // Owning the meal is not the same as owning the ids. Without this the sort
    // order of any ingredient anywhere could be rewritten by guessing its id,
    // exactly as reorderMeals already guards against.
    const owned = await prisma.mealIngredient.findMany({
      where: { id: { in: ids }, mealId },
      select: { id: true },
    });
    if (owned.length !== ids.length) return fail('Some ingredients could not be found.');

    await prisma.$transaction(
      ids.map((id, index) => prisma.mealIngredient.update({ where: { id }, data: { sortOrder: index } })),
    );
    revalidatePlan();
    return ok(undefined);
  });
}

/* -------------------------------------------------------------------------- */
/* Suggested schedule                                                          */
/* -------------------------------------------------------------------------- */

const generateSchema = z.object({ mealPlanId: cuid, apply: z.boolean().optional() });

/**
 * Generate meal times from the timing preferences. Returns the suggestion so
 * the UI can show it before anything is written.
 */
export async function generateSchedule(input: {
  mealPlanId: string;
  apply?: boolean;
}): Promise<
  ActionResult<{ meals: Array<{ mealId: string; name: string; time: string; label: string }>; warnings: string[] }>
> {
  return runAction(generateSchema, input, async ({ mealPlanId, apply }) => {
    const userId = await requireUserId();

    const [plan, settings] = await Promise.all([
      prisma.mealPlan.findFirst({
        where: { id: mealPlanId, userId },
        include: { meals: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
      }),
      prisma.settings.findUnique({ where: { userId } }),
    ]);

    if (!plan) return fail('That plan could not be found.');
    if (!settings) return fail('Settings are missing. Reload the page and try again.');

    const result = generateMealTimes(
      plan.meals.map((meal) => ({
        id: meal.id,
        name: meal.name,
        sortOrder: meal.sortOrder,
        isPreWorkout: meal.isPreWorkout,
        isPostWorkout: meal.isPostWorkout,
        windowMinutes: meal.windowMinutes,
      })),
      {
        firstMealTime: settings.firstMealTime,
        mealIntervalMinutes: settings.mealIntervalMinutes,
        mealIntervalMaxMinutes: settings.mealIntervalMaxMinutes,
        mealDurationMinutes: settings.mealDurationMinutes,
        workoutTime: settings.workoutTime,
        workoutDurationMinutes: settings.workoutDurationMinutes,
        lastMealEarliest: settings.lastMealEarliest,
        lastMealLatest: settings.lastMealLatest,
        bedtime: settings.bedtime,
        preWorkoutMinutes: settings.preWorkoutMinutes,
        postWorkoutMinutes: settings.postWorkoutMinutes,
      },
    );

    if (apply) {
      await prisma.$transaction(
        result.meals.map((meal) =>
          prisma.meal.update({ where: { id: meal.mealId }, data: { defaultTime: meal.time } }),
        ),
      );
      revalidatePlan();
    }

    return ok(
      {
        meals: result.meals.map((m) => ({ mealId: m.mealId, name: m.name, time: m.time, label: m.label })),
        warnings: result.warnings,
      },
      apply ? 'Meal times updated.' : undefined,
    );
  });
}
