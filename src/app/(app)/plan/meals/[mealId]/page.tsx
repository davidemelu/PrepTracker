import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import {
  getFoodPickerOptions,
  getMealForEdit,
  getOptionGroups,
  getWeeklySchedule,
} from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { MealDetail, type IngredientRow } from '@/components/plan/meal-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ mealId: string }> }) {
  const user = await requireUser();
  const { mealId } = await params;
  const meal = await getMealForEdit(user.id, mealId);
  return { title: meal?.name ?? 'Meal' };
}

export default async function MealPage({ params }: { params: Promise<{ mealId: string }> }) {
  const user = await requireUser();
  const { mealId } = await params;

  const [meal, { dayTypes }, foods, groups] = await Promise.all([
    getMealForEdit(user.id, mealId),
    getWeeklySchedule(user.id),
    getFoodPickerOptions(user.id),
    getOptionGroups(user.id),
  ]);

  if (!meal) notFound();

  const ingredients: IngredientRow[] = meal.ingredients.map((ingredient) => ({
    id: ingredient.id,
    label: ingredient.food?.name ?? ingredient.optionGroup?.name ?? 'Unassigned ingredient',
    subLabel: ingredient.optionGroup ? 'Choice of foods' : null,
    unit: ingredient.unit,
    state: ingredient.state,
    required: ingredient.required,
    notes: ingredient.notes,
    foodId: ingredient.foodId,
    optionGroupId: ingredient.optionGroupId,
    quantities: Object.fromEntries(ingredient.quantities.map((q) => [q.dayTypeId, q.quantity])),
  }));

  return (
    <>
      <PageHeader title={meal.name} subtitle={meal.mealPlan.name} backHref="/plan" />
      <PageBody>
        <MealDetail
          mealId={meal.id}
          mealPlanId={meal.mealPlanId}
          meal={{
            id: meal.id,
            name: meal.name,
            description: meal.description ?? '',
            defaultTime: meal.defaultTime ?? '',
            windowMinutes: meal.windowMinutes != null ? String(meal.windowMinutes) : '',
            isPreWorkout: meal.isPreWorkout,
            isPostWorkout: meal.isPostWorkout,
            active: meal.active,
            dayTypeIds: meal.dayTypeSettings.filter((s) => s.included).map((s) => s.dayTypeId),
          }}
          ingredients={ingredients}
          dayTypes={dayTypes.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
          foods={foods}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        />
      </PageBody>
    </>
  );
}
