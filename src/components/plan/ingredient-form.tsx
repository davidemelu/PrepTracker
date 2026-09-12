'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteIngredient, saveIngredient } from '@/lib/actions/plan';
import { UNIT_DEFINITIONS } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Input, NumberInput } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { SheetFooter } from '@/components/ui/sheet';

export interface FoodOption {
  id: string;
  name: string;
  defaultUnit: string;
  category: string;
}

export interface GroupOption {
  id: string;
  name: string;
}

export interface DayTypeQuantity {
  id: string;
  name: string;
}

export interface IngredientFormValues {
  id?: string;
  source: 'food' | 'group';
  foodId: string;
  optionGroupId: string;
  unit: string;
  state: 'RAW' | 'COOKED' | 'AS_IS';
  required: boolean;
  notes: string;
  quantities: Record<string, string>;
}

const STATES = [
  { value: 'AS_IS', label: 'As purchased' },
  { value: 'COOKED', label: 'Cooked weight' },
  { value: 'RAW', label: 'Raw weight' },
] as const;

/**
 * One ingredient line: what it is, how much on each day type, then the rarely
 * changed details behind a disclosure.
 */
export function IngredientForm({
  mealId,
  foods,
  groups,
  dayTypes,
  initial,
  onDone,
  onCancel,
}: {
  mealId: string;
  foods: FoodOption[];
  groups: GroupOption[];
  dayTypes: DayTypeQuantity[];
  initial?: Partial<IngredientFormValues>;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();

  const [values, setValues] = useState<IngredientFormValues>({
    id: initial?.id,
    source: initial?.source ?? (initial?.optionGroupId ? 'group' : 'food'),
    foodId: initial?.foodId ?? '',
    optionGroupId: initial?.optionGroupId ?? '',
    unit: initial?.unit ?? 'g',
    state: initial?.state ?? 'AS_IS',
    required: initial?.required ?? true,
    notes: initial?.notes ?? '',
    quantities: initial?.quantities ?? Object.fromEntries(dayTypes.map((d) => [d.id, '0'])),
  });

  const save = useAction(saveIngredient, {
    onSuccess: () => {
      router.refresh();
      onDone?.();
    },
  });

  const remove = useAction(deleteIngredient, {
    onSuccess: () => {
      router.refresh();
      onDone?.();
    },
  });

  const set = <K extends keyof IngredientFormValues>(key: K, value: IngredientFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const chooseFood = (foodId: string) => {
    const food = foods.find((f) => f.id === foodId);
    setValues((prev) => ({
      ...prev,
      foodId,
      // Default the unit to the food's own so quantities aggregate cleanly.
      unit: food && !prev.id ? food.defaultUnit : prev.unit,
    }));
  };

  const submit = () =>
    save.run({
      id: values.id,
      mealId,
      foodId: values.source === 'food' ? values.foodId : undefined,
      optionGroupId: values.source === 'group' ? values.optionGroupId : undefined,
      unit: values.unit,
      state: values.state,
      required: values.required,
      notes: values.notes,
      quantities: Object.fromEntries(
        Object.entries(values.quantities).map(([id, value]) => [id, Number(value.replace(',', '.')) || 0]),
      ),
    } as unknown as Parameters<typeof saveIngredient>[0]);

  const chosenName =
    values.source === 'food'
      ? (foods.find((f) => f.id === values.foodId)?.name ?? 'this ingredient')
      : (groups.find((g) => g.id === values.optionGroupId)?.name ?? 'this ingredient');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        {(['food', 'group'] as const).map((source) => (
          <button
            key={source}
            type="button"
            onClick={() => set('source', source)}
            className={`h-11 rounded-md text-sm font-medium transition-colors ${
              values.source === source ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {source === 'food' ? 'Single food' : 'Choice of foods'}
          </button>
        ))}
      </div>

      {values.source === 'food' ? (
        <div className="space-y-1.5">
          <Label htmlFor="ing-food">Food</Label>
          <Select id="ing-food" value={values.foodId} onChange={(e) => chooseFood(e.target.value)}>
            <option value="">Choose a food…</option>
            {foods.map((food) => (
              <option key={food.id} value={food.id}>
                {food.name}
              </option>
            ))}
          </Select>
          {save.fieldErrors.foodId ? <p className="text-sm text-destructive">{save.fieldErrors.foodId[0]}</p> : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="ing-group">Substitution group</Label>
          <Select id="ing-group" value={values.optionGroupId} onChange={(e) => set('optionGroupId', e.target.value)}>
            <option value="">Choose a group…</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">Pick which one you want under Plan → Substitutions, or on the day itself.</p>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Amount per day type</legend>
        <div className="space-y-2">
          {dayTypes.map((dayType) => (
            <div key={dayType.id} className="flex items-center gap-3">
              <Label htmlFor={`qty-${dayType.id}`} className="w-24 shrink-0">
                {dayType.name}
              </Label>
              <NumberInput
                id={`qty-${dayType.id}`}
                value={values.quantities[dayType.id] ?? '0'}
                onChange={(e) => set('quantities', { ...values.quantities, [dayType.id]: e.target.value })}
              />
              <span className="w-10 shrink-0 text-sm text-muted-foreground">{values.unit}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Set 0 to leave this food out on that day type. The line stays in the plan.</p>
      </fieldset>

      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium">
          More: unit, weighed state, optional, note
        </summary>
        <div className="space-y-4 px-3 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ing-unit">Unit</Label>
              <Select id="ing-unit" value={values.unit} onChange={(e) => set('unit', e.target.value)}>
                {UNIT_DEFINITIONS.map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ing-state">Weighed</Label>
              <Select id="ing-state" value={values.state} onChange={(e) => set('state', e.target.value as IngredientFormValues['state'])}>
                {STATES.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {values.state === 'COOKED' ? (
            <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
              Cooked weights are converted to raw amounts on the grocery list using the food&apos;s cooking yield.
            </p>
          ) : null}

          <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
            <span className="text-sm">
              Required
              <span className="block text-xs text-muted-foreground">Optional items can be left off the grocery list.</span>
            </span>
            <Switch checked={values.required} onCheckedChange={(checked) => set('required', checked)} />
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="ing-notes">Note</Label>
            <Input id="ing-notes" value={values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Seasoning with each meal" />
          </div>
        </div>
      </details>

      {values.id ? (
        <DeleteButton
          label="Remove ingredient"
          title={`Remove ${chosenName} from this meal?`}
          description="Removes it from the plan. Days you have already logged keep their record."
          pending={remove.isPending}
          onConfirm={() => remove.run({ id: values.id! })}
          className="w-full"
        />
      ) : null}

      {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}

      <SheetFooter>
        {onCancel ? (
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button className="flex-1" disabled={save.isPending} onClick={submit}>
          Save
        </Button>
      </SheetFooter>
    </div>
  );
}
