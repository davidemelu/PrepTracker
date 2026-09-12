'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { deleteWorkoutFocus, saveWorkoutFocus, setScheduledWorkout } from '@/lib/actions/workout';
import { weekdayName } from '@/lib/domain/dates';
import {
  groupFocuses,
  WORKOUT_CATEGORY_LABELS,
  WORKOUT_CATEGORY_ORDER,
  formatWorkoutShort,
  type WorkoutFocusCategoryKey,
  type WorkoutFocusLike,
} from '@/lib/domain/workout';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteButton } from '@/components/ui/delete-button';
import { Input, NumberInput } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface WeekdayWorkout {
  dayOfWeek: number;
  dayTypeName: string;
  isTraining: boolean;
  workoutName: string | null;
  focusIds: string[];
  focusNames: string[];
}

/**
 * The workout catalogue plus the usual workout for each weekday.
 *
 * Weekday defaults are copied onto a day the first time it is generated. They
 * are a starting point, never a rewrite: a day you have already trained keeps
 * exactly what it recorded.
 */
export function WorkoutsManager({
  focuses,
  weekdays,
}: {
  focuses: WorkoutFocusLike[];
  weekdays: WeekdayWorkout[];
}) {
  const router = useRouter();
  const [editingFocus, setEditingFocus] = useState<WorkoutFocusLike | null>(null);
  const [addingFocus, setAddingFocus] = useState(false);
  const [editingDay, setEditingDay] = useState<WeekdayWorkout | null>(null);

  const refresh = () => router.refresh();
  const groups = groupFocuses(focuses.filter((f) => f.active));
  const inactive = focuses.filter((f) => !f.active);

  return (
    <div className="space-y-4">
      {/* Weekly defaults --------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Usual weekly workout</CardTitle>
          <CardDescription>
            Applied to each new day as it is generated. Days you have already logged keep what they
            recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {weekdays.map((day) => {
            const label = formatWorkoutShort({
              workoutName: day.workoutName,
              focusNames: day.focusNames,
            });

            return (
              <button
                key={day.dayOfWeek}
                type="button"
                disabled={!day.isTraining}
                onClick={() => setEditingDay(day)}
                className={cn(
                  'flex min-h-14 w-full items-center gap-3 rounded-lg border border-border px-3 text-left transition-colors',
                  day.isTraining ? 'hover:bg-accent/40' : 'opacity-60',
                )}
              >
                <span className="w-24 shrink-0 text-sm font-medium">
                  {weekdayName(day.dayOfWeek)}
                </span>
                <span className="min-w-0 flex-1">
                  {day.isTraining ? (
                    label ? (
                      <span className="block truncate text-sm">{label}</span>
                    ) : (
                      <span className="block text-sm text-muted-foreground">Not set</span>
                    )
                  ) : (
                    <span className="block text-sm text-muted-foreground">Rest day</span>
                  )}
                </span>
                <Badge variant={day.isTraining ? 'training' : 'rest'}>{day.dayTypeName}</Badge>
              </button>
            );
          })}
          <p className="pt-1 text-xs text-muted-foreground">
            Which days are training days is set in the weekly pattern above.
          </p>
        </CardContent>
      </Card>

      {/* Catalogue --------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Workout focuses</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setAddingFocus(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {groups.map((group) => (
            <div key={group.category}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.focuses.map((focus) => (
                  <button
                    key={focus.id}
                    type="button"
                    onClick={() => setEditingFocus(focus)}
                    className="h-10 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-accent"
                  >
                    {focus.name}
                    {focus.preWorkoutMinutes != null ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {focus.preWorkoutMinutes}m
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {inactive.length > 0 ? (
            <div className="border-t border-border pt-2">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Hidden
              </p>
              <div className="flex flex-wrap gap-2">
                {inactive.map((focus) => (
                  <button
                    key={focus.id}
                    type="button"
                    onClick={() => setEditingFocus(focus)}
                    className="h-10 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground"
                  >
                    {focus.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <FocusSheet
        open={addingFocus || editingFocus !== null}
        focus={editingFocus}
        onClose={() => {
          setAddingFocus(false);
          setEditingFocus(null);
        }}
        onDone={refresh}
      />

      <WeekdaySheet
        day={editingDay}
        focuses={focuses}
        onClose={() => setEditingDay(null)}
        onDone={refresh}
      />
    </div>
  );
}

function FocusSheet({
  open,
  focus,
  onClose,
  onDone,
}: {
  open: boolean;
  focus: WorkoutFocusLike | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(focus?.name ?? '');
  const [category, setCategory] = useState<WorkoutFocusCategoryKey>(focus?.category ?? 'MUSCLE_GROUP');
  const [active, setActive] = useState(focus?.active ?? true);
  const [preWorkout, setPreWorkout] = useState(
    focus?.preWorkoutMinutes != null ? String(focus.preWorkoutMinutes) : '',
  );

  // Re-sync when a different focus is opened.
  const [lastId, setLastId] = useState(focus?.id ?? null);
  if (lastId !== (focus?.id ?? null)) {
    setLastId(focus?.id ?? null);
    setName(focus?.name ?? '');
    setCategory(focus?.category ?? 'MUSCLE_GROUP');
    setActive(focus?.active ?? true);
    setPreWorkout(focus?.preWorkoutMinutes != null ? String(focus.preWorkoutMinutes) : '');
  }

  const finish = () => {
    onDone();
    onClose();
  };

  const save = useAction(saveWorkoutFocus, { onSuccess: finish });
  const remove = useAction(deleteWorkoutFocus, { onSuccess: finish });

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent title={focus ? focus.name : 'New workout focus'}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="focus-name">Name</Label>
            <Input
              id="focus-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rear delts"
            />
            {save.fieldErrors.name ? (
              <p className="text-sm text-destructive">{save.fieldErrors.name[0]}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="focus-category">Group</Label>
            <Select
              id="focus-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as WorkoutFocusCategoryKey)}
            >
              {WORKOUT_CATEGORY_ORDER.map((key) => (
                <option key={key} value={key}>
                  {WORKOUT_CATEGORY_LABELS[key]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="focus-prewo">Eat this long before training (minutes)</Label>
            <NumberInput
              id="focus-prewo"
              value={preWorkout}
              onChange={(e) => setPreWorkout(e.target.value)}
              placeholder="Use the default"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the default from Plan → Meal timing. Set it higher for sessions you
              want more digestion time before — legs are seeded at 90 minutes. When a session mixes
              focuses, the longest gap wins.
            </p>
            {save.fieldErrors.preWorkoutMinutes ? (
              <p className="text-sm text-destructive">{save.fieldErrors.preWorkoutMinutes[0]}</p>
            ) : null}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="text-sm">
              Show in the picker
              <span className="block text-xs text-muted-foreground">
                Hiding keeps past days intact.
              </span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>

          {focus ? (
            <DeleteButton
              label="Delete focus"
              title={`Delete ${focus.name}?`}
              description="It disappears from the picker. Days you trained it keep their record."
              pending={remove.isPending}
              onConfirm={() => remove.run({ id: focus.id })}
              className="w-full"
            />
          ) : null}

          {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}
        </div>

        <SheetFooter>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={save.isPending}
            onClick={() =>
              save.run({
                id: focus?.id,
                name,
                category,
                active,
                preWorkoutMinutes: preWorkout,
              } as unknown as Parameters<typeof saveWorkoutFocus>[0])
            }
          >
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function WeekdaySheet({
  day,
  focuses,
  onClose,
  onDone,
}: {
  day: WeekdayWorkout | null;
  focuses: WorkoutFocusLike[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(day?.focusIds ?? []);
  const [name, setName] = useState(day?.workoutName ?? '');

  const [lastDay, setLastDay] = useState(day?.dayOfWeek ?? null);
  if (lastDay !== (day?.dayOfWeek ?? null)) {
    setLastDay(day?.dayOfWeek ?? null);
    setSelected(day?.focusIds ?? []);
    setName(day?.workoutName ?? '');
  }

  const save = useAction(setScheduledWorkout, {
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  const groups = groupFocuses(focuses.filter((f) => f.active));

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

  return (
    <Sheet open={day !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        title={day ? `Usual ${weekdayName(day.dayOfWeek)} workout` : 'Weekly workout'}
        description="Used for days generated from now on."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="weekday-name">Session name (optional)</Label>
            <Input
              id="weekday-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Push 1"
              maxLength={60}
            />
          </div>

          {groups.map((group) => (
            <fieldset key={group.category} className="space-y-2">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </legend>
              <div className="flex flex-wrap gap-2">
                {group.focuses.map((focus) => {
                  const active = selected.includes(focus.id);
                  return (
                    <button
                      key={focus.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(focus.id)}
                      className={cn(
                        'h-11 rounded-lg border px-3 text-sm font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      {focus.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}
        </div>

        <SheetFooter>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={save.isPending || !day}
            onClick={() =>
              day &&
              save.run({
                dayOfWeek: day.dayOfWeek,
                focusIds: selected,
                workoutName: name,
              } as unknown as Parameters<typeof setScheduledWorkout>[0])
            }
          >
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

