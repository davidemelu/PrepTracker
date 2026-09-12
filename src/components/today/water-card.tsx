'use client';

import { useState } from 'react';
import { Droplets, Minus, Plus, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { addWater, deleteWaterEntry, undoLastWater } from '@/lib/actions/water';
import { formatWater } from '@/lib/domain/water';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NumberInput } from '@/components/ui/input';
import { Label, Progress } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter, SheetTrigger } from '@/components/ui/sheet';
import type { DayView } from '@/lib/queries/day';

interface WaterCardProps {
  date: string;
  water: DayView['water'];
  quickAddA: number;
  quickAddB: number;
}

/**
 * The most-used control in the app: two taps to log a glass.
 *
 * Optimistic so the number moves the instant you tap, even on a slow home
 * network, and an undo is always one tap away.
 */
export function WaterCard({ date, water, quickAddA, quickAddB }: WaterCardProps) {
  const [optimisticMl, setOptimisticMl] = useState(water.totalMl);
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  // Adjust state during render when the server sends a new total, rather than
  // in an effect: this is the pattern React recommends for syncing to a prop,
  // and it avoids a second render pass with a stale number on screen.
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

  const undo = useAction(undoLastWater);
  const remove = useAction(deleteWaterEntry);

  const quickAdd = (amountMl: number) => {
    setOptimisticMl((current) => current + amountMl);
    setPendingAmount(amountMl);
    add.run({ date, amountMl });
  };

  const percent = water.targetMl > 0 ? Math.min(100, (optimisticMl / water.targetMl) * 100) : 0;
  const remaining = Math.max(0, water.targetMl - optimisticMl);

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
    setCustomOpen(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Droplets className="size-4 text-primary" />
          <span className="text-sm font-medium">Water</span>
        </div>
        <p className="tabular text-sm text-muted-foreground">
          <span className="text-base font-semibold text-foreground">{formatWater(optimisticMl)}</span>
          {' / '}
          {formatWater(water.targetMl)}
        </p>
      </div>

      <Progress value={percent} className="mt-2.5 h-3" />

      <p className="mt-1.5 text-xs text-muted-foreground">
        {remaining > 0 ? (
          <>
            {formatWater(remaining)} to go · {Math.round(percent)}%
          </>
        ) : (
          <span className="font-medium text-success">Target reached · {Math.round(water.percent)}%</span>
        )}
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <Button variant="secondary" className="h-12" onClick={() => quickAdd(quickAddA)} disabled={add.isPending}>
          <Plus className="size-4" />
          {quickAddA}
        </Button>
        <Button variant="secondary" className="h-12" onClick={() => quickAdd(quickAddB)} disabled={add.isPending}>
          <Plus className="size-4" />
          {quickAddB}
        </Button>

        <Sheet open={customOpen} onOpenChange={setCustomOpen}>
          <SheetTrigger asChild>
            <Button variant="secondary" className="h-12" aria-label="Add a custom amount of water">
              Custom
            </Button>
          </SheetTrigger>
          <SheetContent title="Add water" description="Enter an amount in millilitres.">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="water-amount">Amount (mL)</Label>
                <NumberInput
                  id="water-amount"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="750"
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[330, 750, 1000].map((preset) => (
                  <Button key={preset} variant="outline" size="sm" onClick={() => setCustomAmount(String(preset))}>
                    {preset} mL
                  </Button>
                ))}
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" className="flex-1" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={submitCustom}>
                Add
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Button
          variant="outline"
          className="h-12"
          onClick={() => {
            setOptimisticMl(water.totalMl);
            undo.run({ date });
          }}
          disabled={undo.isPending || water.entries.length === 0}
          aria-label="Undo the last water entry"
        >
          <Undo2 className="size-4" />
        </Button>
      </div>

      {water.entries.length > 0 ? (
        <details className="mt-3 border-t border-border pt-2">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground">
            {water.entries.length} entr{water.entries.length === 1 ? 'y' : 'ies'} today
          </summary>
          <ul className="mt-2 space-y-1">
            {[...water.entries].reverse().map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="tabular text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="tabular flex-1 text-right">{formatWater(entry.amountMl)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${entry.amountMl} mL entry`}
                  onClick={() => remove.run({ entryId: entry.id })}
                  disabled={remove.isPending}
                >
                  <Minus className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
