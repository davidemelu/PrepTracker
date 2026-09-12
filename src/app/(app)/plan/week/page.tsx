import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import {
  addDays,
  endOfWeek,
  formatDayShort,
  isValidDayKey,
  isoWeekday,
  startOfWeek,
  todayKey,
  weekdayShort,
} from '@/lib/domain/dates';
import { adherenceBand, dayAdherence } from '@/lib/domain/adherence';
import { formatWater } from '@/lib/domain/water';
import { formatTime12h } from '@/lib/domain/time';
import { formatWorkoutShort } from '@/lib/domain/workout';
import { getDayRows, getPeriodStats } from '@/lib/queries/analytics';
import { getSettings } from '@/lib/queries/plan';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Progress } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Weekly tracker' };
export const dynamic = 'force-dynamic';

const BAND_TEXT = {
  great: 'text-success',
  good: 'text-primary',
  ok: 'text-warning',
  poor: 'text-destructive',
} as const;

const BAND_STROKE = {
  great: 'stroke-success',
  good: 'stroke-primary',
  ok: 'stroke-warning',
  poor: 'stroke-destructive',
} as const;

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const settings = await getSettings(user.id);

  const today = todayKey();
  const anchor = params.week && isValidDayKey(params.week) ? params.week : today;
  const weekStart = startOfWeek(anchor, settings.weekStartsOn);
  const weekEnd = endOfWeek(anchor, settings.weekStartsOn);

  const [rows, stats] = await Promise.all([
    getDayRows(user.id, weekStart, weekEnd),
    getPeriodStats(user.id, weekStart, weekEnd),
  ]);

  const band = adherenceBand(stats.overallPercent);

  return (
    <>
      <PageHeader
        title="Weekly tracker"
        subtitle={`${formatDayShort(weekStart)} – ${formatDayShort(weekEnd)}`}
        backHref="/plan"
      />

      <PageBody>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/plan/week?week=${addDays(weekStart, -7)}`}>
              <ChevronLeft className="size-4" />
              Previous
            </Link>
          </Button>
          {weekStart !== startOfWeek(today, settings.weekStartsOn) ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/plan/week">This week</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/plan/week?week=${addDays(weekStart, 7)}`}>
              Next
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>

        {/* Summary --------------------------------------------------------- */}
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <ProgressRing
              value={stats.overallPercent}
              size={88}
              strokeWidth={8}
              indicatorClassName={BAND_STROKE[band]}
              label={`${Math.round(stats.overallPercent)}%`}
              sublabel="OVERALL"
            />
            <dl className="flex-1 space-y-1.5 text-sm">
              {[
                ['Meals', stats.mealPercent, `${stats.completedMeals}/${stats.plannedMeals}`],
                ['Supplements', stats.supplementPercent, ''],
                ['Water', stats.waterPercent, formatWater(stats.averageWaterMl) + ' avg'],
              ].map(([label, value, detail]) => (
                <div key={label as string} className="flex items-center gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="flex flex-1 items-center gap-2">
                    <Progress value={value as number} className="h-2 flex-1" />
                    <span className="tabular w-12 shrink-0 text-right text-xs font-medium">
                      {Math.round(value as number)}%
                    </span>
                  </dd>
                  {detail ? (
                    <span className="tabular w-20 shrink-0 text-right text-xs text-muted-foreground">
                      {detail}
                    </span>
                  ) : null}
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            <div>
              <p className="tabular text-lg font-bold">{stats.perfectDays}</p>
              <p className="text-xs text-muted-foreground">perfect days</p>
            </div>
            <div>
              <p className="tabular text-lg font-bold">{stats.missedMeals}</p>
              <p className="text-xs text-muted-foreground">missed meals</p>
            </div>
            <div>
              <p className="tabular text-lg font-bold">{stats.trackedDays}</p>
              <p className="text-xs text-muted-foreground">days tracked</p>
            </div>
          </div>

          {stats.mostMissedMeal ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Most often missed: <span className="font-medium">{stats.mostMissedMeal.name}</span> (
              {stats.mostMissedMeal.misses}×)
            </p>
          ) : null}

          {stats.trainingDayPercent != null && stats.restDayPercent != null ? (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              Training days {Math.round(stats.trainingDayPercent)}% · Rest days{' '}
              {Math.round(stats.restDayPercent)}%
            </p>
          ) : null}
        </Card>

        {/* Days ------------------------------------------------------------ */}
        <section className="space-y-2">
          <SectionTitle>Monday to Sunday</SectionTitle>

          {rows.map((row) => {
            const adherence = dayAdherence({
              meals: row.meals,
              supplements: row.supplements,
              waterMl: row.waterMl,
              waterTargetMl: row.waterTargetMl,
            });
            const dayBand = adherenceBand(adherence.overallPercent);
            const isToday = row.date === today;
            // A day that has not happened cannot have been missed, so it shows
            // no score at all rather than a discouraging 0%.
            const isFuture = row.date > today;
            const workout = formatWorkoutShort(row.workout);
            // Actual times are the interesting half: the plan already says when
            // a meal was meant to happen.
            const eaten = row.mealTimes.filter((m) => m.status === 'COMPLETED' && m.actualTime);

            return (
              <Link key={row.date} href={`/today?date=${row.date}`} className="block" prefetch={false}>
                <Card
                  className={cn(
                    'flex items-center gap-3 p-3 transition-colors hover:bg-accent/40',
                    isToday && 'border-primary/50',
                    !row.exists && 'opacity-60',
                  )}
                >
                  <div className="w-10 shrink-0 text-center">
                    <p className="text-xs font-medium text-muted-foreground">
                      {weekdayShort(isoWeekday(row.date))}
                    </p>
                    <p className="tabular text-lg font-bold leading-none">{row.date.slice(-2)}</p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.exists ? (
                        <Badge variant={row.isTraining ? 'training' : 'rest'}>{row.dayTypeName}</Badge>
                      ) : (
                        <Badge variant="outline">Not tracked</Badge>
                      )}
                      {isToday ? <Badge>Today</Badge> : null}
                    </div>

                    {workout ? (
                      <p className="truncate text-sm font-medium text-training">{workout}</p>
                    ) : row.exists && row.isTraining && !isFuture ? (
                      <p className="text-xs text-muted-foreground">No workout recorded</p>
                    ) : null}

                    {row.exists && !isFuture ? (
                      <p className="tabular mt-0.5 text-xs text-muted-foreground">
                        {adherence.meals.completed}/{adherence.meals.total} meals ·{' '}
                        {adherence.supplements.completed}/{adherence.supplements.total} supps ·{' '}
                        {formatWater(row.waterMl)}
                      </p>
                    ) : row.exists ? (
                      <p className="tabular mt-0.5 text-xs text-muted-foreground">
                        {adherence.meals.total} meals planned
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Open this day to generate it from your plan
                      </p>
                    )}

                    {eaten.length > 0 ? (
                      <p className="tabular mt-0.5 truncate text-xs text-muted-foreground">
                        {eaten
                          .map((m) => `${m.name.replace(/^Meal /, 'M')} ${formatTime12h(m.actualTime!)}`)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </div>

                  {row.exists && !isFuture ? (
                    <span
                      className={cn('tabular shrink-0 text-lg font-bold', BAND_TEXT[dayBand])}
                    >
                      {Math.round(adherence.overallPercent)}%
                    </span>
                  ) : isFuture ? (
                    <span className="shrink-0 text-xs text-muted-foreground">Upcoming</span>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </section>
      </PageBody>
    </>
  );
}
