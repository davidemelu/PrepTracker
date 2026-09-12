'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Dumbbell, Loader2, Moon, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { applyScheduledWorkout, setDayWorkout, setDayWorkoutTime } from '@/lib/actions/workout';
import { formatTime12h } from '@/lib/domain/time';
import { formatWorkout, groupFocuses, type DayWorkout, type WorkoutFocusLike } from '@/lib/domain/workout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface WorkoutLineProps {
  date: string;
  isTraining: boolean;
  workout: DayWorkout;
  workoutTime: string | null;
  defaultWorkoutTime: string;
  focuses: WorkoutFocusLike[];
  selectedFocusIds: string[];
}

/**
 * Which body parts a split preset selects. Matched by name against the user's
 * own catalogue, so a renamed or missing focus is simply skipped.
 */
const PRESET_PARTS: Record<string, string[]> = {
  push: ['Chest', 'Shoulders', 'Triceps'],
  pull: ['Back', 'Biceps'],
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  upper: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'],
  lower: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  'full body': ['Chest', 'Back', 'Shoulders', 'Legs'],
};

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-11 rounded-full border px-3.5 text-sm font-medium transition-colors',
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

/**
 * One line under the day-state control: what is being trained and when. On a
 * rest day it says so and offers nothing to edit. The sheet leads with split
 * presets so the common case is two taps.
 */
export function WorkoutLine({
  date,
  isTraining,
  workout,
  workoutTime,
  defaultWorkoutTime,
  focuses,
  selectedFocusIds,
}: WorkoutLineProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(selectedFocusIds);
  const [name, setName] = useState(workout.workoutName ?? '');
  const [time, setTime] = useState(workoutTime ?? defaultWorkoutTime);
  const [isPending, startTransition] = useTransition();

  if (!isTraining) {
    return (
      <p className="flex min-h-7 items-center gap-2 px-1 text-[15px] font-medium text-muted-foreground">
        <Moon className="size-4 shrink-0" aria-hidden />
        Rest day · no training
      </p>
    );
  }

  const label = formatWorkout(workout);
  const groups = groupFocuses(focuses);
  const splits = groups.find((g) => g.category === 'SPLIT')?.focuses ?? [];
  const partGroups = groups.filter((g) => g.category !== 'SPLIT');
  const byName = new Map(focuses.map((f) => [f.name.trim().toLowerCase(), f]));

  const openEditor = () => {
    setSelected(selectedFocusIds);
    setName(workout.workoutName ?? '');
    setTime(workoutTime ?? defaultWorkoutTime);
    setOpen(true);
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

  const applyPreset = (preset: WorkoutFocusLike) => {
    const parts = PRESET_PARTS[preset.name.trim().toLowerCase()] ?? [];
    const ids = parts.map((p) => byName.get(p.toLowerCase())?.id).filter((id): id is string => Boolean(id));
    // No matching body parts in this catalogue: record the split itself.
    setSelected(ids.length > 0 ? ids : [preset.id]);
    if (ids.length > 0) setName(preset.name);
  };

  const activePreset = splits.find((s) => s.name === name && (PRESET_PARTS[s.name.trim().toLowerCase()] ?? []).length > 0);

  const save = () => {
    startTransition(async () => {
      if (time && time !== (workoutTime ?? defaultWorkoutTime)) {
        const timed = await setDayWorkoutTime({ date, workoutTime: time });
        if (!timed.ok) {
          toast.error(timed.error);
          return;
        }
      }
      const result = await setDayWorkout({ date, focusIds: selected, workoutName: name });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
    });
  };

  const useUsual = () => {
    startTransition(async () => {
      const result = await applyScheduledWorkout({ date });
      if (!result.ok) toast.error(result.error);
      else setOpen(false);
    });
  };

  return (
    <>
      <div className="flex min-h-7 items-center gap-2 px-1">
        <Dumbbell className="size-4 shrink-0 text-training" aria-hidden />
        {label ? (
          <>
            <span className="tabular min-w-0 flex-1 text-[15px] font-medium">
              {label}
              {workoutTime ? <span className="text-muted-foreground"> · {formatTime12h(workoutTime)}</span> : null}
            </span>
            <button type="button" onClick={openEditor} className="-my-2 h-11 shrink-0 px-2 text-sm font-semibold text-primary">
              Edit
            </button>
          </>
        ) : (
          <>
            <span className="tabular min-w-0 flex-1 text-[15px] text-muted-foreground">
              Training day{workoutTime ? ` · ${formatTime12h(workoutTime)}` : ''}
            </span>
            <button type="button" onClick={openEditor} className="-my-2 flex h-11 shrink-0 items-center gap-1 px-2 text-sm font-semibold text-primary">
              <Plus className="size-4" aria-hidden />
              Set workout
            </button>
          </>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Today's workout" description="Saved against this date only.">
          <div className="space-y-5">
            {splits.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Presets</p>
                <div className="flex flex-wrap gap-2">
                  {splits.map((split) => (
                    <Chip key={split.id} active={activePreset?.id === split.id || selected.includes(split.id)} onClick={() => applyPreset(split)}>
                      {split.name}
                    </Chip>
                  ))}
                  <Chip active={false} onClick={useUsual}>
                    Usual for this weekday
                  </Chip>
                </div>
              </div>
            ) : null}

            {partGroups.map((group) => (
              <fieldset key={group.category}>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.category === 'MUSCLE_GROUP' ? 'Body parts' : group.label}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {group.focuses.map((focus) => (
                    <Chip key={focus.id} active={selected.includes(focus.id)} onClick={() => toggle(focus.id)}>
                      {focus.name}
                    </Chip>
                  ))}
                  {group.category === 'MUSCLE_GROUP' ? (
                    <Link
                      href="/plan/workouts"
                      className="flex h-11 items-center gap-1 rounded-full border border-dashed border-border px-3.5 text-sm font-medium text-primary"
                    >
                      <Plus className="size-4" aria-hidden />
                      Add
                    </Link>
                  ) : null}
                </div>
              </fieldset>
            ))}

            <p className="rounded-lg bg-muted px-3 py-2 text-sm">
              {selected.length > 0 ? (
                <span className="font-medium">
                  {formatWorkout({
                    workoutName: name,
                    focusNames: selected.map((id) => focuses.find((f) => f.id === id)?.name ?? '').filter(Boolean),
                  })}
                </span>
              ) : (
                <span className="text-muted-foreground">Nothing selected. Saving clears today&apos;s workout.</span>
              )}
            </p>

            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium">
                More: session name, training time
                <span className="tabular ml-1 text-muted-foreground">({formatTime12h(time || defaultWorkoutTime)})</span>
              </summary>
              <div className="space-y-4 px-3 pb-3">
                <div className="space-y-1.5">
                  <Label htmlFor="workout-name">Session name</Label>
                  <Input id="workout-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Upper A" maxLength={60} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="workout-time">Training at</Label>
                  <input
                    id="workout-time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Meals still to come re-time around this. Your usual {formatTime12h(defaultWorkoutTime)} is unchanged.
                  </p>
                </div>
              </div>
            </details>
          </div>

          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={isPending} onClick={save}>
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {activePreset && selected.length > 0 ? `Use ${activePreset.name}` : 'Save workout'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
