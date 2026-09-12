'use client';

import { useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { regenerateDay } from '@/lib/actions/day';
import { formatWater } from '@/lib/domain/water';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DayView } from '@/lib/queries/day';

function Stat({ label, value, percent, className }: { label: string; value: string; percent: number; className?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="tabular text-[17px] font-semibold leading-6">{value}</p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div className={cn('h-full rounded-full bg-primary', className)} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}

/**
 * How today is going, in one line: three counts with thin bars. No overall
 * percentage and no red ring during the day; a partial day is not a score.
 * Tapping opens the detail with calories and macros written out.
 */
export function ProgressStrip({ day }: { day: DayView }) {
  const [open, setOpen] = useState(false);
  const { adherence, water, macros } = day;
  const regenerate = useAction(regenerateDay, { onSuccess: () => setOpen(false) });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Today's progress. Show details"
        className="grid w-full grid-cols-3 gap-4 rounded-xl px-1 py-1 text-left"
      >
        <Stat
          label="Meals"
          value={`${adherence.meals.completed} / ${adherence.meals.total}`}
          percent={adherence.meals.percent}
          className={adherence.meals.completed === adherence.meals.total && adherence.meals.total > 0 ? 'bg-success' : undefined}
        />
        <Stat
          label="Water"
          value={`${formatWater(water.totalMl)} / ${formatWater(water.targetMl)}`}
          percent={water.percentCapped}
          className={water.goalReached ? 'bg-success' : undefined}
        />
        <Stat
          label="Supplements"
          value={`${adherence.supplements.completed} / ${adherence.supplements.total}`}
          percent={adherence.supplements.percent}
          className={adherence.supplements.completed === adherence.supplements.total && adherence.supplements.total > 0 ? 'bg-success' : undefined}
        />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Today in detail">
          <dl className="divide-y divide-border rounded-lg border border-border text-sm">
            <div className="flex justify-between px-3 py-2.5">
              <dt className="text-muted-foreground">Meals eaten</dt>
              <dd className="tabular font-medium">{adherence.meals.completed} of {adherence.meals.total}</dd>
            </div>
            <div className="flex justify-between px-3 py-2.5">
              <dt className="text-muted-foreground">Water</dt>
              <dd className="tabular font-medium">
                {formatWater(water.totalMl)} of {formatWater(water.targetMl)} · {Math.round(water.percent)}%
              </dd>
            </div>
            <div className="flex justify-between px-3 py-2.5">
              <dt className="text-muted-foreground">Supplements taken</dt>
              <dd className="tabular font-medium">{adherence.supplements.completed} of {adherence.supplements.total}</dd>
            </div>
            <div className="flex justify-between px-3 py-2.5">
              <dt className="text-muted-foreground">Overall so far</dt>
              <dd className="tabular font-medium">{Math.round(adherence.overallPercent)}%</dd>
            </div>
          </dl>

          {macros.calories != null ? (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned nutrition</p>
              <p className="tabular text-sm">
                <span className="font-semibold">{Math.round(macros.calories).toLocaleString('en-GB')}</span> kcal ·{' '}
                {Math.round(macros.protein ?? 0)} g protein · {Math.round(macros.carbs ?? 0)} g carbs ·{' '}
                {Math.round(macros.fat ?? 0)} g fat
              </p>
              {macros.missing.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {macros.missing.length} food{macros.missing.length === 1 ? ' has' : 's have'} no nutrition data yet.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 border-t border-border pt-4">
            <Button
              variant="outline"
              size="block"
              disabled={regenerate.isPending}
              onClick={() => regenerate.run({ date: day.date })}
            >
              {regenerate.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
              Update today from your plan
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Use this after editing your meal plan or timing. Meals already eaten keep their record.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
