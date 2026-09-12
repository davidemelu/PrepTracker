'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Sparkles } from 'lucide-react';
import { generateGroceryWeek } from '@/lib/actions/groceries';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Input, NumberInput } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';

export interface DayTypeCountRow {
  dayTypeId: string;
  dayTypeName: string;
  days: number;
}

/**
 * Creating a list. The day-type counts are prefilled from the weekly schedule
 * (5 training, 2 rest by default) but stay editable, because a real week is
 * often not the template week.
 */
export function NewWeekSheet({
  defaults,
}: {
  defaults: { startDate: string; daysPlanned: number; dayTypes: DayTypeCountRow[] };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [counts, setCounts] = useState<Record<string, string>>(
    Object.fromEntries(defaults.dayTypes.map((d) => [d.dayTypeId, String(d.days)])),
  );
  const [applyInventory, setApplyInventory] = useState(true);
  const [includeSupplements, setIncludeSupplements] = useState(false);
  const [includeOptional, setIncludeOptional] = useState(true);

  const generate = useAction(generateGroceryWeek, {
    onSuccess: ({ id }) => {
      setOpen(false);
      router.push(`/groceries/${id}`);
      router.refresh();
    },
  });

  const totalDays = Object.values(counts).reduce((sum, v) => sum + (Number(v) || 0), 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        List
      </Button>

      <SheetContent title="New grocery list" description="Built from your active meal plan.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gw-name">Name</Label>
            <Input
              id="gw-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Week of ${startDate}`}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gw-start">Starting</Label>
            <input
              id="gw-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Days to shop for</legend>
            {defaults.dayTypes.map((dayType) => (
              <div key={dayType.dayTypeId} className="flex items-center gap-3">
                <Label htmlFor={`gw-${dayType.dayTypeId}`} className="w-28 shrink-0">
                  {dayType.dayTypeName}
                </Label>
                <NumberInput
                  id={`gw-${dayType.dayTypeId}`}
                  value={counts[dayType.dayTypeId] ?? '0'}
                  onChange={(e) =>
                    setCounts((prev) => ({ ...prev, [dayType.dayTypeId]: e.target.value }))
                  }
                />
                <span className="w-10 shrink-0 text-sm text-muted-foreground">days</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{totalDays} days in total.</p>
          </fieldset>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">
                Subtract what I already have
                <span className="block text-xs text-muted-foreground">
                  Only where the inventory units convert safely.
                </span>
              </span>
              <Switch checked={applyInventory} onCheckedChange={setApplyInventory} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">Include supplements</span>
              <Switch checked={includeSupplements} onCheckedChange={setIncludeSupplements} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">
                Include optional ingredients
                <span className="block text-xs text-muted-foreground">Seasonings and extras.</span>
              </span>
              <Switch checked={includeOptional} onCheckedChange={setIncludeOptional} />
            </label>
          </div>

          {generate.error ? <p className="text-sm text-destructive">{generate.error}</p> : null}
        </div>

        <SheetFooter>
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={generate.isPending || totalDays === 0}
            onClick={() =>
              generate.run({
                name: name || undefined,
                startDate,
                daysPlanned: totalDays,
                dayTypeCounts: Object.fromEntries(
                  Object.entries(counts).map(([id, value]) => [id, Number(value) || 0]),
                ),
                applyInventory,
                includeSupplements,
                includeOptional,
              } as unknown as Parameters<typeof generateGroceryWeek>[0])
            }
          >
            <Sparkles className="size-4" />
            Generate
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
