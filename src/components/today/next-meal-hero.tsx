'use client';

import { useState } from 'react';
import { Check, Dumbbell, Loader2, Moon } from 'lucide-react';
import { completeMeal } from '@/lib/actions/day';
import { formatDuration, formatTimeRange } from '@/lib/domain/time';
import { formatAmount } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SwapSheet } from '@/components/today/swap-sheet';
import { cn } from '@/lib/utils';
import type { DayItemView, DayMealView, SubstitutionOptionMap } from '@/lib/queries/day';

interface NextMealHeroProps {
  meal: DayMealView;
  /** Positive when upcoming, negative when overdue. */
  minutesAway: number;
  substitutions: SubstitutionOptionMap;
  dayTypeName: string;
  isTraining: boolean;
}

const STATE_LABEL: Record<string, string> = { RAW: 'raw', COOKED: 'cooked', AS_IS: '' };

/**
 * The one thing to do next. Name, purpose, time, countdown, the plate, and a
 * single hero button. Sits in the middle of the first screen so it is under
 * the thumb the moment the app opens.
 */
export function NextMealHero({ meal, minutesAway, substitutions, dayTypeName, isTraining }: NextMealHeroProps) {
  const [swapping, setSwapping] = useState<DayItemView | null>(null);
  const complete = useAction(completeMeal, { successToast: false });
  const overdue = minutesAway < 0;

  return (
    <Card
      className={cn(
        'p-4',
        overdue ? 'border-warning/50 ring-1 ring-warning/20' : 'border-primary/40 ring-1 ring-primary/15',
      )}
      aria-labelledby="next-meal-heading"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('text-xs font-semibold uppercase tracking-wide', overdue ? 'text-warning' : 'text-primary')}>
          {overdue ? `Overdue · ${formatDuration(minutesAway)}` : `Next meal · in ${formatDuration(minutesAway)}`}
        </p>
        <p className="tabular shrink-0 text-[17px] font-semibold">
          {meal.scheduledTime ? formatTimeRange(meal.scheduledTime, meal.windowMinutes) : ''}
        </p>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 id="next-meal-heading" className="text-[22px] font-semibold leading-7 tracking-tight">
          {meal.name}
        </h2>
        {meal.isPreWorkout ? (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            Pre-workout
          </span>
        ) : null}
      </div>

      <ul className="mt-3 space-y-1">
        {meal.items.map((item) => {
          const group = item.optionGroupId ? substitutions[item.optionGroupId] : undefined;
          const canSwap = Boolean(group && group.options.length > 1);
          const state = STATE_LABEL[item.state];
          return (
            <li key={item.id} className="flex min-h-7 items-baseline gap-3 text-[15px]">
              <span className="tabular w-16 shrink-0 text-right font-semibold">{formatAmount(item.quantity, item.unit)}</span>
              <span className={cn('min-w-0 flex-1', !item.required && 'text-muted-foreground')}>
                {item.foodName}
                {state ? <span className="text-muted-foreground"> ({state})</span> : null}
                {item.isSubstituted ? <span className="text-xs text-muted-foreground"> · swapped</span> : null}
              </span>
              {canSwap ? (
                <button
                  type="button"
                  onClick={() => setSwapping(item)}
                  className="-my-2 h-11 shrink-0 px-1 text-sm font-semibold text-primary"
                >
                  Swap
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {meal.notes ? <p className="mt-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">{meal.notes}</p> : null}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        {isTraining ? <Dumbbell className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
        {dayTypeName} portions
      </p>

      <Button
        variant="success"
        size="hero"
        className="mt-3"
        disabled={complete.isPending}
        onClick={() => complete.run({ dailyMealId: meal.id })}
      >
        {complete.isPending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <Check className="size-5" strokeWidth={3} aria-hidden />
        )}
        Mark eaten
      </Button>

      <SwapSheet item={swapping} substitutions={substitutions} onClose={() => setSwapping(null)} />
    </Card>
  );
}
