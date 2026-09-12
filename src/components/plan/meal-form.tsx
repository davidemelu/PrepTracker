'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteMeal, saveMeal } from '@/lib/actions/plan';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Input, NumberInput } from '@/components/ui/input';
import { Checkbox, Label, Switch } from '@/components/ui/primitives';
import { SheetFooter } from '@/components/ui/sheet';

export interface DayTypeOption {
  id: string;
  name: string;
  color: string;
}

export interface MealFormValues {
  id?: string;
  name: string;
  description: string;
  defaultTime: string;
  windowMinutes: string;
  isPreWorkout: boolean;
  isPostWorkout: boolean;
  active: boolean;
  dayTypeIds: string[];
}

export function MealForm({
  mealPlanId,
  dayTypes,
  initial,
  onDone,
  onCancel,
}: {
  mealPlanId: string;
  dayTypes: DayTypeOption[];
  initial?: Partial<MealFormValues>;
  onDone?: (id: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<MealFormValues>({
    id: initial?.id,
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    defaultTime: initial?.defaultTime ?? '',
    windowMinutes: initial?.windowMinutes ?? '',
    isPreWorkout: initial?.isPreWorkout ?? false,
    isPostWorkout: initial?.isPostWorkout ?? false,
    active: initial?.active ?? true,
    dayTypeIds: initial?.dayTypeIds ?? dayTypes.map((d) => d.id),
  });

  const save = useAction(saveMeal, {
    onSuccess: ({ id }) => {
      router.refresh();
      onDone?.(id);
    },
  });

  const remove = useAction(deleteMeal, {
    onSuccess: () => {
      router.push('/plan');
      router.refresh();
    },
  });

  const set = <K extends keyof MealFormValues>(key: K, value: MealFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const toggleDayType = (id: string, checked: boolean) =>
    set(
      'dayTypeIds',
      checked ? [...new Set([...values.dayTypeIds, id])] : values.dayTypeIds.filter((d) => d !== id),
    );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="meal-name">Name</Label>
        <Input
          id="meal-name"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Meal 1"
          aria-invalid={Boolean(save.fieldErrors.name)}
        />
        {save.fieldErrors.name ? (
          <p className="text-sm text-destructive">{save.fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meal-description">Description</Label>
        <Input
          id="meal-description"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Pre-workout"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="meal-time">Default time</Label>
          <input
            id="meal-time"
            type="time"
            value={values.defaultTime}
            onChange={(e) => set('defaultTime', e.target.value)}
            className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meal-window">Window (min)</Label>
          <NumberInput
            id="meal-window"
            value={values.windowMinutes}
            onChange={(e) => set('windowMinutes', e.target.value)}
            placeholder="30"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Eaten on</legend>
        {save.fieldErrors.dayTypeIds ? (
          <p className="text-sm text-destructive">{save.fieldErrors.dayTypeIds[0]}</p>
        ) : null}
        <div className="space-y-1.5">
          {dayTypes.map((dayType) => (
            <label
              key={dayType.id}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border px-3"
            >
              <Checkbox
                checked={values.dayTypeIds.includes(dayType.id)}
                onCheckedChange={(checked) => toggleDayType(dayType.id, checked === true)}
              />
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: dayType.color }}
                aria-hidden
              />
              <span className="flex-1">{dayType.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">
            Pre-workout meal
            <span className="block text-xs text-muted-foreground">
              The time generator places it before training.
            </span>
          </span>
          <Switch
            checked={values.isPreWorkout}
            onCheckedChange={(checked) => set('isPreWorkout', checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">
            Post-workout meal
            <span className="block text-xs text-muted-foreground">Placed after training finishes.</span>
          </span>
          <Switch
            checked={values.isPostWorkout}
            onCheckedChange={(checked) => set('isPostWorkout', checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">
            Active
            <span className="block text-xs text-muted-foreground">
              Inactive meals stay in the plan but are not added to new days.
            </span>
          </span>
          <Switch checked={values.active} onCheckedChange={(checked) => set('active', checked)} />
        </label>
      </div>

      {values.id ? (
        <Button
          variant="ghost"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={remove.isPending}
          onClick={() => {
            if (confirm(`Delete ${values.name}? Days you have already logged keep their record.`)) {
              remove.run({ id: values.id! });
            }
          }}
        >
          <Trash2 className="size-4" />
          Delete meal
        </Button>
      ) : null}

      {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}

      <SheetFooter>
        {onCancel ? (
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          className="flex-1"
          disabled={save.isPending}
          onClick={() =>
            save.run({
              ...values,
              mealPlanId,
              windowMinutes: values.windowMinutes === '' ? undefined : values.windowMinutes,
              defaultTime: values.defaultTime === '' ? undefined : values.defaultTime,
            } as unknown as Parameters<typeof saveMeal>[0])
          }
        >
          Save
        </Button>
      </SheetFooter>
    </div>
  );
}
