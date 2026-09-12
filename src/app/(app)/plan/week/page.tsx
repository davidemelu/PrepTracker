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
import { formatWorkoutShort } from '@/lib/domain/workout';
import { getDayRows } from '@/lib/queries/analytics';
import { getSettings } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { WeekDayRow } from '@/components/plan/week-day-row';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'This week' };
export const dynamic = 'force-dynamic';

/**
 * The week as a list of days, one line each, with the planned and actual meal
 * times a tap away. One sentence of summary at the top; no ring, no table.
 */
export default async function WeekPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const settings = await getSettings(user.id);

  const today = todayKey();
  const anchor = params.week && isValidDayKey(params.week) ? params.week : today;
  const weekStart = startOfWeek(anchor, settings.weekStartsOn);
  const weekEnd = endOfWeek(anchor, settings.weekStartsOn);
  const isThisWeek = weekStart === startOfWeek(today, settings.weekStartsOn);

  const rows = await getDayRows(user.id, weekStart, weekEnd);

  const days = rows.map((row) => {
    const adherence = dayAdherence({
      meals: row.meals,
      supplements: row.supplements,
      waterMl: row.waterMl,
      waterTargetMl: row.waterTargetMl,
    });
    const isToday = row.date === today;
    const isFuture = row.date > today;
    const finished = row.exists && !isToday && !isFuture;
    const score = finished ? Math.round(adherence.overallPercent) : null;
    return { row, adherence, isToday, isFuture, finished, score };
  });

  const tracked = days.filter((d) => d.finished);
  const onPlan = tracked.filter((d) => adherenceBand(d.adherence.overallPercent) !== 'poor' && adherenceBand(d.adherence.overallPercent) !== 'ok');
  const averageWater =
    tracked.length > 0 ? Math.round(tracked.reduce((sum, d) => sum + d.row.waterMl, 0) / tracked.length) : 0;

  return (
    <>
      <PageHeader
        title={isThisWeek ? 'This week' : `Week of ${formatDayShort(weekStart)}`}
        subtitle={`${formatDayShort(weekStart)} – ${formatDayShort(weekEnd)}`}
        backHref="/today"
        action={
          <>
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/plan/week?week=${addDays(weekStart, -7)}`} aria-label="Previous week">
                <ChevronLeft className="size-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/plan/week?week=${addDays(weekStart, 7)}`} aria-label="Next week">
                <ChevronRight className="size-5" />
              </Link>
            </Button>
          </>
        }
      />

      <PageBody>
        {!isThisWeek ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link href="/plan/week">This week</Link>
            </Button>
          </div>
        ) : null}

        <p className="px-1 text-[15px] font-medium">
          {tracked.length === 0 ? (
            <span className="text-muted-foreground">No finished days to score yet.</span>
          ) : (
            <>
              {onPlan.length} of {tracked.length} {tracked.length === 1 ? 'day' : 'days'} on plan
              <span className="text-muted-foreground"> · {formatWater(averageWater)} average water</span>
            </>
          )}
        </p>

        <ul className="rounded-xl border border-border bg-card shadow-sm">
          {days.map(({ row, adherence, isToday, isFuture, finished, score }) => {
            const stats = !row.exists
              ? null
              : isFuture
                ? `${adherence.meals.total} meals planned`
                : `${adherence.meals.completed}/${adherence.meals.total} meals${isToday ? ' so far' : ''} · ${formatWater(row.waterMl)} · ${adherence.supplements.completed}/${adherence.supplements.total} supplements`;
            return (
              <WeekDayRow
                key={row.date}
                date={row.date}
                weekday={weekdayShort(isoWeekday(row.date))}
                dayNumber={row.date.slice(-2)}
                exists={row.exists}
                isToday={isToday}
                isFuture={isFuture}
                dayTypeName={row.dayTypeName}
                isTraining={row.isTraining}
                workout={formatWorkoutShort(row.workout)}
                stats={stats}
                score={score}
                band={finished ? adherenceBand(adherence.overallPercent) : null}
                times={row.mealTimes}
              />
            );
          })}
        </ul>

        <p className="px-1 text-xs text-muted-foreground">
          A day counts as on plan at 80% or more. Longer ranges are under More → History.
        </p>
      </PageBody>
    </>
  );
}
