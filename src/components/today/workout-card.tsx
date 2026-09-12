'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Dumbbell, Plus, X } from 'lucide-react';
import {
  applyScheduledWorkout,
  clearDayWorkout,
  setDayWorkout,
  setDayWorkoutTime,
} from '@/lib/actions/workout';
import { formatTime12h } from '@/lib/domain/time';
import { formatWorkout, groupFocuses, type DayWorkout, type WorkoutFocusLike } from '@/lib/domain/workout';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface WorkoutCardProps {
  date: string;
  isTraining: boolean;
  workout: DayWorkout;
  /** What time this session is, which may differ from the usual one. */
  workoutTime: string | null;
  /** The usual time from Settings, for the "back to usual" shortcut. */
  defaultWorkoutTime: string;
  focuses: WorkoutFocusLike[];
  selectedFocusIds: string[];
}

/**
 * What you are training today.
 *
 * Only rendered on a training day — on a rest day there is nothing to record,
 * and the spec is explicit that the inputs should not be in the way.
 */
export function WorkoutCard({
  date,
  isTraining,
  workout,
  workoutTime,
  defaultWorkoutTime,
  focuses,
  selectedFocusIds,
}: WorkoutCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(selectedFocusIds);
  const [name, setName] = useState(workout.workoutName ?? '');

  const refresh = () => router.refresh();
  // Applied on its own rather than with Save, because changing it re-times the
  // rest of the day and you want to see that happen before committing.
  const saveTime = useAction(setDayWorkoutTime, { onSuccess: refresh });
  const save = useAction(setDayWorkout, {
    onSuccess: () => {
      setOpen(false);
      refresh();
    },
  });
  const clear = useAction(clearDayWorkout, { onSuccess: refresh });
  const applyUsual = useAction(applyScheduledWorkout, {
    onSuccess: () => {
      setOpen(false);
      refresh();
    },
  });

  if (!isTraining) return null;

  const label = formatWorkout(workout);
  const groups = groupFocuses(focuses);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

  const openEditor = () => {
    setSelected(selectedFocusIds);
    setName(workout.workoutName ?? '');
    setOpen(true);
  };

  return (
    <>
      <Card
        className={cn(
          'p-4 transition-colors',
          label ? 'border-training/40 bg-training/5' : 'border-dashed',
        )}
      >
        <button type="button" onClick={openEditor} className="flex w-full items-center gap-3 text-left">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl',
              label ? 'bg-training/15 text-training' : 'bg-muted text-muted-foreground',
            )}
          >
            <Dumbbell className="size-5" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Today&apos;s workout</span>
            {label ? (
              <span className="block truncate text-lg font-semibold leading-tight">{label}</span>
            ) : (
              <span className="block text-sm text-muted-foreground">
                Tap to record what you are training
              </span>
            )}
          </span>

          {workoutTime ? (
            <span className="tabular shrink-0 text-right text-sm">
              <span className="block font-medium">{formatTime12h(workoutTime)}</span>
              <span className="block text-xs text-muted-foreground">planned</span>
            </span>
          ) : (
            <Plus className="size-5 shrink-0 text-muted-foreground" />
          )}
        </button>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          title="Today's workout"
          description="Pick everything you are training. Saved against this date only."
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="workout-time">Training at</Label>
              <div className="flex items-center gap-2">
                <input
                  id="workout-time"
                  type="time"
                  value={workoutTime ?? defaultWorkoutTime}
                  disabled={saveTime.isPending}
                  onChange={(e) =>
                    e.target.value && saveTime.run({ date, workoutTime: e.target.value })
                  }
                  className="flex h-12 flex-1 rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {workoutTime && workoutTime !== defaultWorkoutTime ? (
                  <Button
                    variant="outline"
                    disabled={saveTime.isPending}
                    onClick={() => saveTime.run({ date, workoutTime: defaultWorkoutTime })}
                  >
                    Usual
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Your meals re-time around this. Today only — your usual{' '}
                {formatTime12h(defaultWorkoutTime)} is unchanged.
              </p>
              {saveTime.error ? (
                <p className="text-sm text-destructive">{saveTime.error}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="workout-name">Session name (optional)</Label>
              <Input
                id="workout-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Upper A"
                maxLength={60}
              />
              {save.fieldErrors.workoutName ? (
                <p className="text-sm text-destructive">{save.fieldErrors.workoutName[0]}</p>
              ) : null}
            </div>

            {selected.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 rounded-lg bg-muted p-2.5">
                {selected.map((id) => {
                  const focus = focuses.find((f) => f.id === id);
                  if (!focus) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                    >
                      {focus.name}
                      <X className="size-3" />
                    </button>
                  );
                })}
              </div>
            ) : null}

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

            <Button
              variant="outline"
              size="block"
              disabled={applyUsual.isPending}
              onClick={() => applyUsual.run({ date })}
            >
              <CalendarCheck className="size-4" />
              Use this weekday&apos;s usual workout
            </Button>

            {label ? (
              <Button
                variant="ghost"
                size="block"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={clear.isPending}
                onClick={() => {
                  clear.run({ date });
                  setOpen(false);
                }}
              >
                Clear today&apos;s workout
              </Button>
            ) : null}

            {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}
          </div>

          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={save.isPending}
              onClick={() =>
                save.run({
                  date,
                  focusIds: selected,
                  workoutName: name,
                } as unknown as Parameters<typeof setDayWorkout>[0])
              }
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
