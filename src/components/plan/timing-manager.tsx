'use client';

import { useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { generateSchedule } from '@/lib/actions/plan';
import { updateTimingSettings } from '@/lib/actions/settings';
import { formatTime12h } from '@/lib/domain/time';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberInput } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';

export interface TimingValues {
  autoScheduleMeals: boolean;
  firstMealTime: string;
  mealIntervalMinutes: string;
  mealIntervalMaxMinutes: string;
  mealDurationMinutes: string;
  workoutTime: string;
  workoutDurationMinutes: string;
  lastMealEarliest: string;
  lastMealLatest: string;
  bedtime: string;
  preWorkoutMinutes: string;
  postWorkoutMinutes: string;
}

/** The fields the number inputs can bind to — everything except the toggle. */
type NumericTimingKey = Exclude<keyof TimingValues, 'autoScheduleMeals'>;

function TimeField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Timing preferences and the schedule generator.
 *
 * Generation is a two-step: preview first, then apply. Your hand-set times are
 * never overwritten without you seeing what would change.
 */
export function TimingManager({
  mealPlanId,
  initial,
}: {
  mealPlanId: string | null;
  initial: TimingValues;
}) {
  const [values, setValues] = useState(initial);
  const [preview, setPreview] = useState<Array<{ mealId: string; name: string; label: string }> | null>(
    null,
  );
  const [warnings, setWarnings] = useState<string[]>([]);

  const save = useAction(updateTimingSettings);

  const generate = useAction(generateSchedule, {
    onSuccess: (data) => {
      setPreview(data.meals.map((m) => ({ mealId: m.mealId, name: m.name, label: m.label })));
      setWarnings(data.warnings);
    },
  });

  const set = <K extends keyof TimingValues>(key: K, value: TimingValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const numberField = (id: NumericTimingKey, label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NumberInput id={id} value={values[id]} onChange={(e) => set(id, e.target.value)} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {save.fieldErrors[id] ? <FieldError>{save.fieldErrors[id][0]}</FieldError> : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cascade</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="text-sm">
              Work meal times out automatically
              <span className="block text-xs text-muted-foreground">
                Each day is built from the first meal, the pre- and post-workout meals around
                training, and the last meal in its window. Everything else spreads evenly between
                those points, so a session at a different time re-times the day on its own. Turn
                this off to pin each meal to a fixed time instead.
              </span>
            </span>
            <Switch
              checked={values.autoScheduleMeals}
              onCheckedChange={(checked) => set('autoScheduleMeals', checked)}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your day</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TimeField
            id="firstMealTime"
            label="First meal"
            hint="When eating starts."
            value={values.firstMealTime}
            onChange={(v) => set('firstMealTime', v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <TimeField
              id="workoutTime"
              label="Workout starts"
              value={values.workoutTime}
              onChange={(v) => set('workoutTime', v)}
            />
            {numberField('workoutDurationMinutes', 'Workout length (min)')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TimeField
              id="lastMealEarliest"
              label="Last meal from"
              value={values.lastMealEarliest}
              onChange={(v) => set('lastMealEarliest', v)}
            />
            <TimeField
              id="lastMealLatest"
              label="Last meal by"
              value={values.lastMealLatest}
              onChange={(v) => set('lastMealLatest', v)}
            />
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            The last meal is placed inside this window, and the meals before it spread out to
            reach it.
          </p>
          <TimeField
            id="bedtime"
            label="Bedtime"
            hint="The last meal should finish before this."
            value={values.bedtime}
            onChange={(v) => set('bedtime', v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spacing</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {numberField('mealIntervalMinutes', 'Shortest gap (min)', 'Meals no closer than this.')}
          {numberField('mealIntervalMaxMinutes', 'Longest gap (min)', 'Meals no further than this.')}
          {numberField('mealDurationMinutes', 'Time per meal (min)')}
          {numberField(
            'preWorkoutMinutes',
            'Pre-workout (min)',
            'Before training starts. A focus can ask for longer — legs are seeded at 90.',
          )}
          {numberField('postWorkoutMinutes', 'Post-workout (min)', 'After training finishes.')}
        </CardContent>
      </Card>

      <FieldError className="px-1">{save.error}</FieldError>

      <Button
        size="block"
        disabled={save.isPending}
        onClick={() => save.run(values as unknown as Parameters<typeof updateTimingSettings>[0])}
      >
        Save timing
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Suggested meal times</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Build a schedule from the values above. The pre- and post-workout meals are pinned
            around training and the last meal sits in its window; everything else spreads evenly
            between them.
          </p>

          <Button
            variant="outline"
            size="block"
            disabled={!mealPlanId || generate.isPending}
            onClick={() => mealPlanId && generate.run({ mealPlanId })}
          >
            <Sparkles className="size-4" />
            Preview times
          </Button>

          {preview ? (
            <>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {preview.map((meal) => (
                  <li key={meal.mealId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="font-medium">{meal.name}</span>
                    <span className="tabular text-sm">{meal.label}</span>
                  </li>
                ))}
              </ul>

              {warnings.map((warning) => (
                <p
                  key={warning}
                  className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-warning"
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {warning}
                </p>
              ))}

              <Button
                size="block"
                disabled={!mealPlanId || generate.isPending}
                onClick={() => mealPlanId && generate.run({ mealPlanId, apply: true })}
              >
                Apply these times to the plan
              </Button>
            </>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Applying overwrites each meal&apos;s default time. Days you have already logged keep the times
            they were created with.
          </p>
        </CardContent>
      </Card>

      <p className="px-1 pb-2 text-xs text-muted-foreground">
        Current first meal: {formatTime12h(values.firstMealTime)} · Workout:{' '}
        {formatTime12h(values.workoutTime)}
      </p>
    </div>
  );
}
