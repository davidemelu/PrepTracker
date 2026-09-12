'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus } from 'lucide-react';
import { deleteDayType, saveDayType, updateWeeklySchedule } from '@/lib/actions/settings';
import { weekdayName } from '@/lib/domain/dates';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface DayTypeRow {
  id: string;
  name: string;
  isTraining: boolean;
  color: string;
}

/**
 * Named, not just listed. "Colour #9333ea" is what a screen reader used to read
 * out, which tells you nothing about which swatch you are on; the name is also
 * what the selected one is announced as.
 */
const COLORS = [
  { value: '#16a34a', name: 'Green' },
  { value: '#0284c7', name: 'Blue' },
  { value: '#9333ea', name: 'Purple' },
  { value: '#d97706', name: 'Amber' },
  { value: '#dc2626', name: 'Red' },
  { value: '#64748b', name: 'Slate' },
] as const;

function DayTypeForm({
  initial,
  dayTypes,
  onDone,
  onCancel,
}: {
  initial?: DayTypeRow;
  dayTypes: DayTypeRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [isTraining, setIsTraining] = useState(initial?.isTraining ?? false);
  const [color, setColor] = useState(initial?.color ?? COLORS[5].value);
  const colourLabelId = useId();
  const swatches = useRef<Array<HTMLButtonElement | null>>([]);
  const [copyFrom, setCopyFrom] = useState(dayTypes[0]?.id ?? '');

  const finish = () => {
    router.refresh();
    onDone();
  };

  const save = useAction(saveDayType, { onSuccess: finish });
  const remove = useAction(deleteDayType, { onSuccess: finish });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dt-name">Name</Label>
        <Input
          id="dt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Light training"
          aria-invalid={save.fieldErrors.name ? true : undefined}
          // Pointed at the message below, so the reason is read out with the
          // field rather than being left as text nothing refers to.
          aria-describedby={save.fieldErrors.name ? 'dt-name-error' : undefined}
        />
        {save.fieldErrors.name ? (
          <p id="dt-name-error" role="alert" className="text-sm text-destructive">
            {save.fieldErrors.name[0]}
          </p>
        ) : null}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <span className="text-sm">
          Counts as a training day
          <span className="block text-xs text-muted-foreground">
            Controls training-only supplements and the training vs rest split in analytics.
          </span>
        </span>
        <Switch checked={isTraining} onCheckedChange={setIsTraining} />
      </label>

      <div className="space-y-1.5">
        {/*
          A plain span with an id rather than a Label, because a Label with no
          `htmlFor` names nothing, and a group of buttons cannot be the target
          of one. The group is a radio group with the usual keyboard pattern:
          one tab stop, arrows between the swatches.
        */}
        <span id={colourLabelId} className="text-sm font-medium leading-none">
          Colour
        </span>
        <div role="radiogroup" aria-labelledby={colourLabelId} className="flex gap-2">
          {COLORS.map((option, index) => {
            const selected = color === option.value;
            return (
              <button
                key={option.value}
                ref={(node) => {
                  swatches.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.name}
                tabIndex={selected || (index === 0 && !COLORS.some((c) => c.value === color)) ? 0 : -1}
                onClick={() => setColor(option.value)}
                onKeyDown={(event) => {
                  const last = COLORS.length - 1;
                  let next: number | null = null;
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
                  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1;
                  else if (event.key === 'Home') next = 0;
                  else if (event.key === 'End') next = last;
                  if (next === null) return;
                  event.preventDefault();
                  const target = COLORS[next];
                  if (!target) return;
                  setColor(target.value);
                  swatches.current[next]?.focus();
                }}
                className={cn(
                  'flex size-11 items-center justify-center rounded-lg border-2 transition-transform',
                  selected ? 'border-foreground scale-110' : 'border-transparent',
                )}
                style={{ backgroundColor: option.value }}
              >
                {/* A tick, so the chosen swatch is not signalled by an outline alone. */}
                {selected ? <Check className="size-5 text-white drop-shadow" strokeWidth={3} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {!initial && dayTypes.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="dt-copy">Copy quantities from</Label>
          <Select id="dt-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Start from zero</option>
            {dayTypes.map((dayType) => (
              <option key={dayType.id} value={dayType.id}>
                {dayType.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Every ingredient in your plan gets a quantity for this new day type. Copying gives you a
            sensible starting point to adjust.
          </p>
        </div>
      ) : null}

      {initial && dayTypes.length > 1 ? (
        <DeleteButton
          label="Delete day type"
          title={`Delete ${initial.name}?`}
          description="Weekdays using it fall back to your default type. Days already logged keep their recorded name."
          pending={remove.isPending}
          onConfirm={() => remove.run({ id: initial.id })}
          className="w-full"
        />
      ) : null}

      {save.error ? <p role="alert" className="text-sm text-destructive">{save.error}</p> : null}

      <SheetFooter>
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={save.isPending}
          onClick={() =>
            save.run({
              id: initial?.id,
              name,
              isTraining,
              color,
              copyFromDayTypeId: initial ? undefined : copyFrom || undefined,
            } as unknown as Parameters<typeof saveDayType>[0])
          }
        >
          Save
        </Button>
      </SheetFooter>
    </div>
  );
}

/**
 * The repeating weekly pattern plus the day types themselves. Changing the
 * pattern affects days you have not opened yet; any day you have already looked
 * at keeps the type it was created with until you override it on that day.
 */
export function ScheduleManager({
  dayTypes,
  assignments,
}: {
  dayTypes: DayTypeRow[];
  assignments: Record<number, string>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<number, string>>(assignments);
  const [editing, setEditing] = useState<DayTypeRow | null>(null);
  const [adding, setAdding] = useState(false);

  const save = useAction(updateWeeklySchedule, { onSuccess: () => router.refresh() });

  const dirty = Object.entries(draft).some(([day, id]) => assignments[Number(day)] !== id);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Weekly pattern</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
            <div key={day} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-medium">{weekdayName(day)}</span>
              <Select
                aria-label={`Day type for ${weekdayName(day)}`}
                value={draft[day] ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, [day]: e.target.value }))}
              >
                {dayTypes.map((dayType) => (
                  <option key={dayType.id} value={dayType.id}>
                    {dayType.name}
                  </option>
                ))}
              </Select>
            </div>
          ))}

          <Button
            size="block"
            className="mt-2"
            disabled={!dirty || save.isPending}
            onClick={() => save.run({ assignments: draft } as unknown as Parameters<typeof updateWeeklySchedule>[0])}
          >
            {dirty ? 'Save weekly schedule' : 'Saved'}
          </Button>
          <p className="text-xs text-muted-foreground">
            You can still override any single date from the Today screen without changing this pattern.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Day types</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-1">
          {dayTypes.map((dayType) => (
            <button
              key={dayType.id}
              type="button"
              onClick={() => setEditing(dayType)}
              className="flex w-full min-h-12 items-center gap-3 rounded-lg border border-border px-3 text-left transition-colors hover:bg-accent/40"
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: dayType.color }}
                aria-hidden
              />
              <span className="flex-1 font-medium">{dayType.name}</span>
              {dayType.isTraining ? <Badge variant="training">Training</Badge> : null}
            </button>
          ))}
        </CardContent>
      </Card>

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent title="New day type" description="For example a light training or refeed day.">
          <DayTypeForm
            dayTypes={dayTypes}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <SheetContent title={editing?.name ?? 'Day type'}>
          {editing ? (
            <DayTypeForm
              key={editing.id}
              initial={editing}
              dayTypes={dayTypes}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
