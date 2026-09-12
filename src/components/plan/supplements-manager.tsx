'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Pill, Play, Plus } from 'lucide-react';
import {
  deleteSupplement,
  saveSupplement,
  toggleSupplementActive,
} from '@/lib/actions/supplements';
import { formatDose, SUPPLEMENT_TIMING_LABELS, type SupplementTimingKey } from '@/lib/domain/materialise';
import { DOSAGE_UNITS } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, NumberInput, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface SupplementRow {
  id: string;
  name: string;
  dosageAmount: number | null;
  dosageUnit: string | null;
  countPerDose: number;
  form: string;
  notes: string | null;
  active: boolean;
  timing: SupplementTimingKey;
  applicability: 'EVERY_DAY' | 'TRAINING_ONLY' | 'REST_ONLY';
  mealId: string | null;
  mealName: string | null;
  timeOfDay: string | null;
}

const FORMS = ['TABLET', 'CAPSULE', 'SOFTGEL', 'SCOOP', 'GUMMY', 'LIQUID', 'POWDER', 'OTHER'] as const;
const TIMINGS = Object.keys(SUPPLEMENT_TIMING_LABELS) as SupplementTimingKey[];
const APPLICABILITY = [
  { value: 'EVERY_DAY', label: 'Every day' },
  { value: 'TRAINING_ONLY', label: 'Training days only' },
  { value: 'REST_ONLY', label: 'Rest days only' },
] as const;

function SupplementForm({
  initial,
  meals,
  onDone,
  onCancel,
}: {
  initial?: SupplementRow;
  meals: Array<{ id: string; name: string }>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: initial?.name ?? '',
    dosageAmount: initial?.dosageAmount != null ? String(initial.dosageAmount) : '',
    dosageUnit: initial?.dosageUnit ?? '',
    countPerDose: String(initial?.countPerDose ?? 1),
    form: initial?.form ?? 'CAPSULE',
    timing: initial?.timing ?? ('AM' as SupplementTimingKey),
    applicability: initial?.applicability ?? ('EVERY_DAY' as const),
    mealId: initial?.mealId ?? '',
    timeOfDay: initial?.timeOfDay ?? '',
    notes: initial?.notes ?? '',
    active: initial?.active ?? true,
  });

  const finish = () => {
    router.refresh();
    onDone();
  };

  const save = useAction(saveSupplement, { onSuccess: finish });
  const remove = useAction(deleteSupplement, { onSuccess: finish });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="supp-name">Name</Label>
        <Input
          id="supp-name"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          aria-invalid={Boolean(save.fieldErrors.name)}
        />
        {save.fieldErrors.name ? (
          <p className="text-sm text-destructive">{save.fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="supp-dosage">Dosage</Label>
          <NumberInput
            id="supp-dosage"
            value={values.dosageAmount}
            onChange={(e) => set('dosageAmount', e.target.value)}
            placeholder="500"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supp-dosage-unit">Unit</Label>
          <Select
            id="supp-dosage-unit"
            value={values.dosageUnit}
            onChange={(e) => set('dosageUnit', e.target.value)}
            aria-invalid={Boolean(save.fieldErrors.dosageUnit)}
          >
            <option value="">None</option>
            {DOSAGE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="supp-count">How many per dose</Label>
          <NumberInput
            id="supp-count"
            value={values.countPerDose}
            onChange={(e) => set('countPerDose', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supp-form">Form</Label>
          <Select id="supp-form" value={values.form} onChange={(e) => set('form', e.target.value)}>
            {FORMS.map((form) => (
              <option key={form} value={form}>
                {form.charAt(0) + form.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="supp-timing">When</Label>
        <Select
          id="supp-timing"
          value={values.timing}
          onChange={(e) => set('timing', e.target.value as SupplementTimingKey)}
        >
          {TIMINGS.map((timing) => (
            <option key={timing} value={timing}>
              {SUPPLEMENT_TIMING_LABELS[timing]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="supp-meal">Take with a meal (optional)</Label>
        <Select id="supp-meal" value={values.mealId} onChange={(e) => set('mealId', e.target.value)}>
          <option value="">Not tied to a meal</option>
          {meals.map((meal) => (
            <option key={meal.id} value={meal.id}>
              {meal.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="supp-days">Days</Label>
          <Select
            id="supp-days"
            value={values.applicability}
            onChange={(e) => set('applicability', e.target.value as typeof values.applicability)}
          >
            {APPLICABILITY.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supp-time">Time (optional)</Label>
          <input
            id="supp-time"
            type="time"
            value={values.timeOfDay}
            onChange={(e) => set('timeOfDay', e.target.value)}
            className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="supp-notes">Notes</Label>
        <Textarea
          id="supp-notes"
          className="min-h-16"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      {initial ? (
        <DeleteButton
          label="Delete supplement"
          title={`Delete ${initial.name}?`}
          description="It stops appearing on new days. Past days keep their record. To pause it instead, use the pause button in the list."
          pending={remove.isPending}
          onConfirm={() => remove.run({ id: initial.id })}
          className="w-full"
        />
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
              ...values,
              mealId: values.mealId || undefined,
              timeOfDay: values.timeOfDay || undefined,
              dosageAmount: values.dosageAmount || undefined,
              dosageUnit: values.dosageUnit || undefined,
            } as unknown as Parameters<typeof saveSupplement>[0])
          }
        >
          Save
        </Button>
      </SheetFooter>
    </div>
  );
}

export function SupplementsManager({
  supplements,
  meals,
}: {
  supplements: SupplementRow[];
  meals: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SupplementRow | null>(null);
  const [adding, setAdding] = useState(false);

  const toggle = useAction(toggleSupplementActive, { onSuccess: () => router.refresh() });

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
        PrepTracker records what you have decided to take. It offers no dosage guidance and does not
        check interactions.
      </p>

      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Supplement
        </Button>
      </div>

      {supplements.length === 0 ? (
        <EmptyState icon={Pill} title="No supplements yet" description="Add the ones you take." />
      ) : (
        <Card className="divide-y divide-border">
          {supplements.map((supplement) => (
            <div key={supplement.id} className="flex items-center gap-2 p-3">
              <button
                type="button"
                onClick={() => setEditing(supplement)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('font-medium leading-tight', !supplement.active && 'text-muted-foreground')}>
                    {supplement.name}
                  </span>
                  {!supplement.active ? <Badge variant="secondary">Paused</Badge> : null}
                  {supplement.applicability !== 'EVERY_DAY' ? (
                    <Badge variant="outline">
                      {supplement.applicability === 'TRAINING_ONLY' ? 'Training only' : 'Rest only'}
                    </Badge>
                  ) : null}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatDose(supplement)} ·{' '}
                  {supplement.mealName
                    ? `${SUPPLEMENT_TIMING_LABELS[supplement.timing]} · ${supplement.mealName}`
                    : SUPPLEMENT_TIMING_LABELS[supplement.timing]}
                </span>
              </button>

              <Button
                variant="ghost"
                size="icon"
                aria-label={supplement.active ? `Pause ${supplement.name}` : `Resume ${supplement.name}`}
                disabled={toggle.isPending}
                onClick={() => toggle.run({ id: supplement.id })}
              >
                {supplement.active ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent title="New supplement">
          <SupplementForm meals={meals} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <SheetContent title={editing?.name ?? 'Supplement'}>
          {editing ? (
            <SupplementForm
              key={editing.id}
              initial={editing}
              meals={meals}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
