'use client';

import { useState } from 'react';
import { Droplets, Minus, MoreHorizontal, Plus, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { addWater, deleteWaterEntry, undoLastWater } from '@/lib/actions/water';
import { formatWater, progressFromTotal } from '@/lib/domain/water';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NumberInput } from '@/components/ui/input';
import { Label, Progress } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DayView } from '@/lib/queries/day';

interface WaterCardProps {
  date: string;
  water: DayView['water'];
  quickAddA: number;
  quickAddB: number;
}

/** "250 mL" / "1 L" for the quick-add buttons. */
function quickLabel(ml: number): string {
  return formatWater(ml);
}

/**
 * The most-used control in the app: one tap to log a glass.
 *
 * Optimistic so the number moves the instant you tap, even on a slow home
 * network; undo is a labelled text button rather than a bare icon.
 */
export function WaterCard({ date, water, quickAddA, quickAddB }: WaterCardProps) {
  const [optimisticMl, setOptimisticMl] = useState(water.totalMl);
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  // Adjust state during render when the server sends a new total, rather than
  // in an effect: this is the pattern React recommends for syncing to a prop.
  const [lastServerMl, setLastServerMl] = useState(water.totalMl);
  if (lastServerMl !== water.totalMl) {
    setLastServerMl(water.totalMl);
    setOptimisticMl(water.totalMl);
  }

  const add = useAction(addWater, {
    successToast: false,
    onSuccess: () => setPendingAmount(null),
    onError: (message) => {
      setOptimisticMl(water.totalMl);
      setPendingAmount(null);
      toast.error(message);
    },
    onNeedsConfirmation: (message) => {
      const amount = pendingAmount;
      setOptimisticMl(water.totalMl);
      setPendingAmount(null);
      toast.warning(message, {
        action: {
          label: 'Add again',
          onClick: () => {
            if (amount == null) return;
            setOptimisticMl((current) => current + amount);
            add.run({ date, amountMl: amount, confirmDuplicate: true });
          },
        },
      });
    },
  });

  const undo = useAction(undoLastWater, { successToast: false });
  const remove = useAction(deleteWaterEntry, { successToast: false });

  const quickAdd = (amountMl: number) => {
    setOptimisticMl((current) => current + amountMl);
    setPendingAmount(amountMl);
    add.run({ date, amountMl });
  };

  // Recomputed here rather than read off `water`, because the optimistic total
  // moves before the server answers — but through the same function the server
  // used, so a tap and the reload that follows it cannot disagree.
  const progress = progressFromTotal(optimisticMl, water.targetMl);
  const percent = progress.percentCapped;
  const remaining = progress.remainingMl;
  const reached = progress.goalReached;
  const lastEntry = water.entries.length > 0 ? water.entries[water.entries.length - 1] : null;

  const submitCustom = () => {
    const parsed = Number(customAmount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Enter an amount in millilitres.');
      return;
    }
    const amount = Math.round(parsed);
    setOptimisticMl((current) => current + amount);
    setPendingAmount(amount);
    add.run({ date, amountMl: amount, confirmDuplicate: true });
    setCustomAmount('');
    setMoreOpen(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Droplets className="size-3.5" aria-hidden />
          Water
        </h2>
        <p className="tabular text-sm text-muted-foreground">
          <span className="text-[28px] font-semibold leading-8 text-foreground">{formatWater(optimisticMl)}</span>
          {' / '}
          {formatWater(water.targetMl)}
        </p>
      </div>

      <Progress
        value={percent}
        className="mt-2.5 h-1.5"
        indicatorClassName={reached ? 'bg-success' : undefined}
        aria-label="Water progress"
      />

      <div className="mt-2 flex min-h-6 items-center justify-between gap-2">
        <p className={cn('text-sm', reached ? 'font-medium text-success' : 'text-muted-foreground')}>
          {reached ? `Target reached · ${formatWater(optimisticMl)}` : `${formatWater(remaining)} to go`}
        </p>
        {lastEntry ? (
          <button
            type="button"
            onClick={() => {
              setOptimisticMl(water.totalMl - lastEntry.amountMl);
              undo.run({ date });
            }}
            disabled={undo.isPending}
            className="-my-2 -mr-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold text-primary disabled:opacity-50"
          >
            <Undo2 className="size-4" aria-hidden />
            Undo {formatWater(lastEntry.amountMl)}
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="tonal" size="hero" className="min-w-0 flex-1 px-2" onClick={() => quickAdd(quickAddA)} disabled={add.isPending}>
          <Plus className="size-5" aria-hidden />
          {quickLabel(quickAddA)}
        </Button>
        <Button variant="tonal" size="hero" className="min-w-0 flex-1 px-2" onClick={() => quickAdd(quickAddB)} disabled={add.isPending}>
          <Plus className="size-5" aria-hidden />
          {quickLabel(quickAddB)}
        </Button>
        <Button
          variant="outline"
          className="h-13 w-13 shrink-0 rounded-xl px-0 text-muted-foreground"
          aria-label="More water options"
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal className="size-5" />
        </Button>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent title="Water" description="Add a custom amount or correct today's entries.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="water-amount">Amount (mL)</Label>
              <NumberInput
                id="water-amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="750"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {[330, 750, 1000].map((preset) => (
                  <Button key={preset} variant="outline" size="sm" onClick={() => setCustomAmount(String(preset))}>
                    {formatWater(preset)}
                  </Button>
                ))}
              </div>
            </div>

            {water.entries.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Today&apos;s entries
                </p>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {[...water.entries].reverse().map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2 px-3 py-1 text-sm">
                      <span className="tabular text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="tabular flex-1 text-right font-medium">{formatWater(entry.amountMl)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove the ${formatWater(entry.amountMl)} entry`}
                        onClick={() => remove.run({ entryId: entry.id })}
                        disabled={remove.isPending}
                      >
                        <Minus className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={() => setMoreOpen(false)}>
              Close
            </Button>
            <Button className="flex-1" onClick={submitCustom} disabled={!customAmount.trim()}>
              Add
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
