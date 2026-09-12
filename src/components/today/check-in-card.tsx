'use client';

import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { saveCheckIn, updateDayNotes } from '@/lib/actions/day';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DayView } from '@/lib/queries/day';

const RATINGS = [
  { key: 'ratingHunger', label: 'Hunger' },
  { key: 'ratingEnergy', label: 'Energy' },
  { key: 'ratingTraining', label: 'Training' },
  { key: 'ratingAdherence', label: 'Adherence' },
] as const;

type RatingKey = (typeof RATINGS)[number]['key'];

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n} out of 5`}
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              'tabular size-9 rounded-lg border text-sm font-medium transition-colors',
              value === n
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-accent',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Optional daily check-in. Everything is optional by design — a check-in you
 * feel obliged to fill in stops getting filled in.
 */
export function CheckInCard({ date, checkIn, dayNotes }: { date: string; checkIn: DayView['checkIn']; dayNotes: string | null }) {
  const [open, setOpen] = useState(false);
  const [ratings, setRatings] = useState<Record<RatingKey, number | null>>({
    ratingHunger: checkIn?.ratingHunger ?? null,
    ratingEnergy: checkIn?.ratingEnergy ?? null,
    ratingTraining: checkIn?.ratingTraining ?? null,
    ratingAdherence: checkIn?.ratingAdherence ?? null,
  });
  const [notes, setNotes] = useState(checkIn?.notes ?? '');
  const [digestionNote, setDigestionNote] = useState(checkIn?.digestionNote ?? '');
  const [workoutNote, setWorkoutNote] = useState(checkIn?.workoutNote ?? '');
  const [mealDifficultyNote, setMealDifficultyNote] = useState(checkIn?.mealDifficultyNote ?? '');
  const [prepIssueNote, setPrepIssueNote] = useState(checkIn?.prepIssueNote ?? '');
  const [quickNote, setQuickNote] = useState(dayNotes ?? '');

  const save = useAction(saveCheckIn, { onSuccess: () => setOpen(false) });
  const saveNote = useAction(updateDayNotes);

  const filled = RATINGS.filter((r) => ratings[r.key] != null).length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <NotebookPen className="size-4 text-primary" />
          Notes &amp; check-in
        </CardTitle>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm">
              {filled > 0 || checkIn?.notes ? 'Edit' : 'Add'}
            </Button>
          </SheetTrigger>

          <SheetContent title="Daily check-in" description="All optional. Fill in as much or as little as you like.">
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border border-border p-3">
                {RATINGS.map((rating) => (
                  <RatingRow
                    key={rating.key}
                    label={rating.label}
                    value={ratings[rating.key]}
                    onChange={(value) => setRatings((prev) => ({ ...prev, [rating.key]: value }))}
                  />
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ci-notes">General notes</Label>
                <Textarea id="ci-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ci-digestion">Digestion</Label>
                  <Textarea
                    id="ci-digestion"
                    className="min-h-16"
                    value={digestionNote}
                    onChange={(e) => setDigestionNote(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ci-workout">Workout quality</Label>
                  <Textarea
                    id="ci-workout"
                    className="min-h-16"
                    value={workoutNote}
                    onChange={(e) => setWorkoutNote(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ci-meal">Meal difficulty</Label>
                  <Textarea
                    id="ci-meal"
                    className="min-h-16"
                    value={mealDifficultyNote}
                    onChange={(e) => setMealDifficultyNote(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ci-prep">Prep issues</Label>
                  <Textarea
                    id="ci-prep"
                    className="min-h-16"
                    value={prepIssueNote}
                    onChange={(e) => setPrepIssueNote(e.target.value)}
                  />
                </div>
              </div>
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
                    ...ratings,
                    notes,
                    digestionNote,
                    workoutNote,
                    mealDifficultyNote,
                    prepIssueNote,
                  })
                }
              >
                Save
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </CardHeader>

      <CardContent className="space-y-2">
        <Textarea
          className="min-h-16"
          placeholder="Anything worth remembering about today…"
          value={quickNote}
          onChange={(e) => setQuickNote(e.target.value)}
          onBlur={() => {
            if (quickNote !== (dayNotes ?? '')) saveNote.run({ date, notes: quickNote });
          }}
        />

        {filled > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {RATINGS.filter((r) => ratings[r.key] != null).map((r) => (
              <span key={r.key} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {r.label} {ratings[r.key]}/5
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
