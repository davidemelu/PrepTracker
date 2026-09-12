'use client';

import { useState } from 'react';
import { ChevronRight, NotebookPen } from 'lucide-react';
import { saveCheckIn, updateDayNotes } from '@/lib/actions/day';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DayView } from '@/lib/queries/day';

const RATINGS = [
  { key: 'ratingHunger', label: 'Hunger' },
  { key: 'ratingEnergy', label: 'Energy' },
  { key: 'ratingTraining', label: 'Training' },
  { key: 'ratingAdherence', label: 'Adherence' },
] as const;

type RatingKey = (typeof RATINGS)[number]['key'];

const DETAIL_NOTES = [
  { key: 'digestionNote', label: 'Digestion' },
  { key: 'workoutNote', label: 'Workout quality' },
  { key: 'mealDifficultyNote', label: 'Meal difficulty' },
  { key: 'prepIssueNote', label: 'Prep issues' },
] as const;

type DetailKey = (typeof DETAIL_NOTES)[number]['key'];

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
      <div className="flex gap-1" role="group" aria-label={`${label} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n} out of 5`}
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              'tabular size-11 rounded-lg border text-sm font-medium transition-colors',
              value === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
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
 * One row at the bottom of Today. The note and the optional check-in live in a
 * sheet, so a day with nothing to say costs one line of screen.
 */
export function NoteRow({ date, checkIn, dayNotes }: { date: string; checkIn: DayView['checkIn']; dayNotes: string | null }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(dayNotes ?? '');
  const [ratings, setRatings] = useState<Record<RatingKey, number | null>>({
    ratingHunger: checkIn?.ratingHunger ?? null,
    ratingEnergy: checkIn?.ratingEnergy ?? null,
    ratingTraining: checkIn?.ratingTraining ?? null,
    ratingAdherence: checkIn?.ratingAdherence ?? null,
  });
  const [details, setDetails] = useState<Record<DetailKey, string>>({
    digestionNote: checkIn?.digestionNote ?? '',
    workoutNote: checkIn?.workoutNote ?? '',
    mealDifficultyNote: checkIn?.mealDifficultyNote ?? '',
    prepIssueNote: checkIn?.prepIssueNote ?? '',
  });

  const saveNote = useAction(updateDayNotes, { successToast: false });
  const save = useAction(saveCheckIn, { successToast: false, onSuccess: () => setOpen(false) });

  const filledRatings = RATINGS.filter((r) => ratings[r.key] != null);
  const hasAnything = Boolean(dayNotes) || filledRatings.length > 0;

  const submit = () => {
    if (note !== (dayNotes ?? '')) saveNote.run({ date, notes: note });
    save.run({ date, ...ratings, notes: checkIn?.notes ?? '', ...details });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1 text-left"
      >
        <NotebookPen className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          {hasAnything ? (
            <>
              <span className="block truncate text-sm font-medium">{dayNotes || 'Check-in saved'}</span>
              {filledRatings.length > 0 ? (
                <span className="block text-xs text-muted-foreground">
                  {filledRatings.map((r) => `${r.label} ${ratings[r.key]}/5`).join(' · ')}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-sm font-semibold text-primary">Add a note about today</span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Today's note" description="All optional. Anything worth remembering about today.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="day-note">Note</Label>
              <Textarea
                id="day-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ran out of rice, used potatoes instead…"
              />
            </div>

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

            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium">More notes</summary>
              <div className="grid gap-3 px-3 pb-3">
                {DETAIL_NOTES.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`ci-${field.key}`}>{field.label}</Label>
                    <Textarea
                      id={`ci-${field.key}`}
                      className="min-h-16"
                      value={details[field.key]}
                      onChange={(e) => setDetails((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </details>

            {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}
          </div>

          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={save.isPending || saveNote.isPending} onClick={submit}>
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
