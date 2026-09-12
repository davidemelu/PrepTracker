'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createPrepSession } from '@/lib/actions/prep';
import { todayKey } from '@/lib/domain/dates';
import { useAction } from '@/lib/hooks/use-action';
import { Button, type ButtonProps } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { Input, NumberInput } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';

export function NewSessionSheet({
  dayTypes,
  triggerLabel = 'New session',
  triggerVariant = 'ghost',
  triggerSize = 'sm',
}: {
  dayTypes: Array<{ dayTypeId: string; dayTypeName: string; days: number }>;
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayKey());
  const [counts, setCounts] = useState<Record<string, string>>(
    Object.fromEntries(dayTypes.map((d) => [d.dayTypeId, String(d.days)])),
  );

  const create = useAction(createPrepSession, {
    onSuccess: ({ id }) => {
      setOpen(false);
      router.push(`/prep/${id}`);
    },
  });

  const total = Object.values(counts).reduce((sum, v) => sum + (Number(v) || 0), 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        size={triggerSize}
        variant={triggerVariant}
        className={triggerVariant === 'ghost' ? 'text-primary' : undefined}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        {triggerLabel}
      </Button>

      <SheetContent title="Plan a prep session" description="Works out how much of each food to cook.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ps-date">Prep date</Label>
            <input
              id="ps-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Days of food to cook</legend>
            {dayTypes.map((dayType) => (
              <div key={dayType.dayTypeId} className="flex items-center gap-3">
                <Label htmlFor={`ps-${dayType.dayTypeId}`} className="w-28 shrink-0">
                  {dayType.dayTypeName}
                </Label>
                <NumberInput
                  id={`ps-${dayType.dayTypeId}`}
                  value={counts[dayType.dayTypeId] ?? '0'}
                  onChange={(e) => setCounts((prev) => ({ ...prev, [dayType.dayTypeId]: e.target.value }))}
                />
                <span className="w-10 shrink-0 text-sm text-muted-foreground">days</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{total} days in total.</p>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="ps-name">Name (optional)</Label>
            <Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday prep" />
          </div>

          {create.error ? <FieldError>{create.error}</FieldError> : null}
        </div>

        <SheetFooter>
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={create.isPending || total === 0}
            onClick={() =>
              create.run({
                name: name || undefined,
                date,
                dayTypeCounts: Object.fromEntries(Object.entries(counts).map(([id, value]) => [id, Number(value) || 0])),
              } as unknown as Parameters<typeof createPrepSession>[0])
            }
          >
            Create
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
