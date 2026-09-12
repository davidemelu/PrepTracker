'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { formatAmount } from '@/lib/domain/units';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { MealForm, type DayTypeOption, type MealFormValues } from './meal-form';
import {
  IngredientForm,
  type FoodOption,
  type GroupOption,
  type IngredientFormValues,
} from './ingredient-form';

export interface IngredientRow {
  id: string;
  label: string;
  subLabel: string | null;
  unit: string;
  state: 'RAW' | 'COOKED' | 'AS_IS';
  required: boolean;
  notes: string | null;
  foodId: string | null;
  optionGroupId: string | null;
  quantities: Record<string, number>;
}

/**
 * The meal editor. Ingredients and their per-day-type quantities are edited in
 * sheets so the list stays visible behind them on a phone.
 */
export function MealDetail({
  mealId,
  mealPlanId,
  meal,
  ingredients,
  dayTypes,
  foods,
  groups,
}: {
  mealId: string;
  mealPlanId: string;
  meal: Partial<MealFormValues>;
  ingredients: IngredientRow[];
  dayTypes: DayTypeOption[];
  foods: FoodOption[];
  groups: GroupOption[];
}) {
  const [editingMeal, setEditingMeal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<IngredientRow | null>(null);
  const [addingIngredient, setAddingIngredient] = useState(false);

  const toFormValues = (row: IngredientRow): Partial<IngredientFormValues> => ({
    id: row.id,
    source: row.optionGroupId ? 'group' : 'food',
    foodId: row.foodId ?? '',
    optionGroupId: row.optionGroupId ?? '',
    unit: row.unit,
    state: row.state,
    required: row.required,
    notes: row.notes ?? '',
    quantities: Object.fromEntries(dayTypes.map((d) => [d.id, String(row.quantities[d.id] ?? 0)])),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{meal.name}</h2>
            {meal.description ? (
              <p className="text-sm text-muted-foreground">{meal.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {meal.isPreWorkout ? <Badge variant="secondary">Pre-workout</Badge> : null}
              {meal.isPostWorkout ? <Badge variant="secondary">Post-workout</Badge> : null}
              {meal.active === false ? <Badge variant="secondary">Inactive</Badge> : null}
              {dayTypes
                .filter((d) => meal.dayTypeIds?.includes(d.id))
                .map((d) => (
                  <Badge key={d.id} variant="outline">
                    {d.name}
                  </Badge>
                ))}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditingMeal(true)}>
            <Pencil className="size-4" />
            Edit
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ingredients
        </h3>
        <Button size="sm" variant="outline" onClick={() => setAddingIngredient(true)}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {ingredients.length === 0 ? (
        <EmptyState
          title="No ingredients yet"
          description="Add foods and set how much you eat on each day type."
          action={
            <Button size="sm" onClick={() => setAddingIngredient(true)}>
              <Plus className="size-4" />
              Add ingredient
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-border">
          {ingredients.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setEditingIngredient(row)}
              className="flex w-full items-start gap-3 p-4 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-tight">
                  {row.label}
                  {!row.required ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>
                  ) : null}
                </span>
                {row.subLabel ? (
                  <span className="block text-xs text-muted-foreground">{row.subLabel}</span>
                ) : null}
                {row.state !== 'AS_IS' ? (
                  <span className="block text-xs text-muted-foreground">
                    {row.state === 'COOKED' ? 'Cooked weight' : 'Raw weight'}
                  </span>
                ) : null}
                {row.notes ? (
                  <span className="block text-xs text-muted-foreground">{row.notes}</span>
                ) : null}
              </span>

              <span className="shrink-0 text-right">
                {dayTypes.map((dayType) => (
                  <span key={dayType.id} className="block text-sm">
                    <span className="text-xs text-muted-foreground">{dayType.name} </span>
                    <span className="tabular font-medium">
                      {formatAmount(row.quantities[dayType.id] ?? 0, row.unit)}
                    </span>
                  </span>
                ))}
              </span>
            </button>
          ))}
        </Card>
      )}

      <Sheet open={editingMeal} onOpenChange={setEditingMeal}>
        <SheetContent title="Edit meal">
          <MealForm
            mealPlanId={mealPlanId}
            dayTypes={dayTypes}
            initial={meal}
            onDone={() => setEditingMeal(false)}
            onCancel={() => setEditingMeal(false)}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={addingIngredient} onOpenChange={setAddingIngredient}>
        <SheetContent title="Add ingredient" description={`To ${meal.name}`}>
          <IngredientForm
            mealId={mealId}
            foods={foods}
            groups={groups}
            dayTypes={dayTypes}
            onDone={() => setAddingIngredient(false)}
            onCancel={() => setAddingIngredient(false)}
          />
        </SheetContent>
      </Sheet>

      <Sheet
        open={editingIngredient !== null}
        onOpenChange={(open) => (open ? undefined : setEditingIngredient(null))}
      >
        <SheetContent title="Edit ingredient" description={editingIngredient?.label}>
          {editingIngredient ? (
            <IngredientForm
              key={editingIngredient.id}
              mealId={mealId}
              foods={foods}
              groups={groups}
              dayTypes={dayTypes}
              initial={toFormValues(editingIngredient)}
              onDone={() => setEditingIngredient(null)}
              onCancel={() => setEditingIngredient(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
