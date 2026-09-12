'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { deleteDayType, saveDayType, updateWeeklySchedule } from '@/lib/actions/settings';
import { weekdayName } from '@/lib/domain/dates';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const COLORS = ['#16a34a', '#0284c7', '#9333ea', '#d97706', '#dc2626', '#64748b'];

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
  const [color, setColor] = useState(initial?.color ?? COLORS[5]!);
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
        />
        {save.fieldErrors.name ? (
          <p className="text-sm text-destructive">{save.fieldErrors.name[0]}</p>
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
        <Label>Colour</Label>
        <div className="flex gap-2">
          {COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`Colour ${option}`}
              onClick={() => setColor(option)}
              className={cn(
                'size-10 rounded-lg border-2 transition-transform',
                color === option ? 'border-foreground scale-110' : 'border-transparent',
              )}
              style={{ backgroundColor: option }}
            />
          ))}
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
        <Button
          variant="ghost"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={remove.isPending}
          onClick={() => {
            if (confirm(`Delete ${initial.name}? Days already logged keep their recorded name.`)) {
              remove.run({ id: initial.id });
            }
          }}
        >
          <Trash2 className="size-4" />
          Delete day type
        </Button>
      ) : null}

      {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}

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
