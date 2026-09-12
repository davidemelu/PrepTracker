'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatTime12h } from '@/lib/domain/time';
import { cn } from '@/lib/utils';

export interface WeekDayRowProps {
  date: string;
  weekday: string;
  dayNumber: string;
  exists: boolean;
  isToday: boolean;
  isFuture: boolean;
  dayTypeName: string;
  isTraining: boolean;
  workout: string | null;
  stats: string | null;
  /** Rounded percentage for finished days only. */
  score: number | null;
  band: 'great' | 'good' | 'ok' | 'poor' | null;
  times: Array<{ name: string; status: string; scheduledTime: string | null; actualTime: string | null }>;
}

const BAND_TEXT = { great: 'text-success', good: 'text-primary', ok: 'text-warning', poor: 'text-destructive' } as const;

/**
 * One day of the week. Collapsed it is the summary line; opened it shows the
 * planned and actual time of every meal, which is the part worth looking back
 * at.
 */
export function WeekDayRow(props: WeekDayRowProps) {
  const [open, setOpen] = useState(false);
  const canExpand = props.exists && props.times.length > 0;

  return (
    <li className={cn('border-t border-border first:border-t-0', props.isToday && 'bg-primary/5')}>
      <button
        type="button"
        aria-expanded={canExpand ? open : undefined}
        onClick={() => canExpand && setOpen((o) => !o)}
        className="flex min-h-16 w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        <span className="w-11 shrink-0 text-center">
          <span className="block text-xs font-semibold uppercase text-muted-foreground">{props.weekday}</span>
          <span className="tabular block text-xl font-bold leading-6">{props.dayNumber}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {props.exists ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  props.isTraining ? 'bg-training/12 text-training' : 'bg-rest/12 text-rest',
                )}
              >
                {props.dayTypeName}
              </span>
            ) : (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {props.isFuture ? 'Planned' : 'No record'}
              </span>
            )}
            {props.workout ? <span className="font-medium">{props.workout}</span> : null}
            {props.isToday ? <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">Today</span> : null}
          </span>
          {props.stats ? <span className="tabular mt-0.5 block text-[13px] text-muted-foreground">{props.stats}</span> : null}
        </span>

        {props.score != null && props.band ? (
          <span className={cn('tabular shrink-0 text-[17px] font-bold', BAND_TEXT[props.band])}>{props.score}%</span>
        ) : canExpand ? (
          <span className="shrink-0 text-muted-foreground">{open ? <ChevronDown className="size-5" aria-hidden /> : <ChevronRight className="size-5" aria-hidden />}</span>
        ) : null}
      </button>

      {open && canExpand ? (
        <div className="space-y-2 px-3 pb-3 pl-[4.25rem]">
          <ul className="tabular space-y-1 rounded-lg bg-background p-2.5 text-[13px]">
            {props.times.map((meal) => (
              <li key={meal.name} className="flex justify-between gap-3">
                <span>{meal.name}</span>
                <span className="text-right">
                  <span className="text-muted-foreground">
                    planned {meal.scheduledTime ? formatTime12h(meal.scheduledTime) : '—'} ·{' '}
                  </span>
                  {meal.status === 'COMPLETED' ? (
                    <>
                      <span className="text-muted-foreground">eaten </span>
                      {meal.actualTime ? formatTime12h(meal.actualTime) : 'yes'}
                    </>
                  ) : meal.status === 'SKIPPED' ? (
                    <span className="text-muted-foreground">skipped</span>
                  ) : (
                    <span className="text-muted-foreground">not eaten</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <Link href={`/today?date=${props.date}`} prefetch={false} className="inline-flex h-11 items-center text-sm font-semibold text-primary">
            Open this day
          </Link>
        </div>
      ) : null}
    </li>
  );
}
