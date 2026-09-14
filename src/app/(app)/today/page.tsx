import Link from 'next/link';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Utensils } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { addDays, formatDayShort, isValidDayKey, relativeDayLabel, todayKey } from '@/lib/domain/dates';
import { findNextMeal, findOverdueMeals } from '@/lib/domain/schedule';
import { currentTimeString, timeToMinutes } from '@/lib/domain/time';
import { formatWater } from '@/lib/domain/water';
import {
  getDayFocusIds,
  getDayTypes,
  getDayView,
  getSubstitutionOptions,
  getWorkoutFocuses,
} from '@/lib/queries/day';
import { getReminders } from '@/lib/queries/reminders';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { DayStateControl } from '@/components/today/day-state-control';
import { MealRow, type MealRowState } from '@/components/today/meal-row';
import { NextMealHero } from '@/components/today/next-meal-hero';
import { NoteRow } from '@/components/today/note-row';
import { ProgressStrip } from '@/components/today/progress-strip';
import { ReminderNotifier } from '@/components/today/reminder-notifier';
import { ReminderStrip } from '@/components/today/reminder-strip';
import { SupplementGroups } from '@/components/today/supplement-groups';
import { WaterCard } from '@/components/today/water-card';
import { WorkoutLine } from '@/components/today/workout-line';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

/**
 * Today, in the order the day is used: what kind of day it is, what to do
 * next, water, then the timeline of meals and supplements. Everything above
 * the fold is either a glance or a single tap.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const today = todayKey();
  const date = params.date && isValidDayKey(params.date) ? params.date : today;
  const isToday = date === today;

  const [day, dayTypes, substitutions, settings, workoutFocuses, selectedFocusIds] =
    await Promise.all([
      getDayView(user.id, date),
      getDayTypes(user.id),
      getSubstitutionOptions(user.id),
      prisma.settings.findUnique({ where: { userId: user.id } }),
      getWorkoutFocuses(user.id),
      getDayFocusIds(user.id, date),
    ]);

  const reminders = isToday ? await getReminders(user.id, day, today) : [];

  const nowTime = currentTimeString();
  const now = timeToMinutes(nowTime);
  const next = isToday ? findNextMeal(day.meals, nowTime) : null;
  const overdueIds = new Set((isToday ? findOverdueMeals(day.meals, nowTime) : []).map((m) => m.id));

  /** Signed minutes: positive = upcoming, negative = already due. */
  const minutesFor = (scheduledTime: string | null) =>
    scheduledTime ? timeToMinutes(scheduledTime) - now : 0;

  const heroMinutes = next ? (overdueIds.has(next.meal.id) ? minutesFor(next.meal.scheduledTime) : next.minutesAway) : 0;

  const loggedMeals = day.meals.filter((m) => m.status !== 'PENDING').length;
  const allEaten = day.meals.length > 0 && day.meals.every((m) => m.status === 'COMPLETED');
  const nothingLeft = day.meals.length > 0 && !next;

  const rowState = (meal: (typeof day.meals)[number]): MealRowState => {
    if (meal.status === 'COMPLETED') return 'done';
    if (meal.status === 'SKIPPED') return 'skipped';
    if (overdueIds.has(meal.id)) return 'overdue';
    if (next?.meal.id === meal.id) return 'next';
    return 'pending';
  };

  return (
    <>
      <PageHeader
        title={isToday ? 'Today' : relativeDayLabel(date, today)}
        subtitle={formatDayShort(date)}
        action={
          <>
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/today?date=${addDays(date, -1)}`} aria-label="Previous day" prefetch={false}>
                <ChevronLeft className="size-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/today?date=${addDays(date, 1)}`} aria-label="Next day" prefetch={false}>
                <ChevronRight className="size-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="text-primary" asChild>
              <Link href={`/plan/week?week=${date}`}>
                <CalendarDays className="size-4" />
                Week
              </Link>
            </Button>
          </>
        }
      />

      <PageBody className="space-y-3">
        {!isToday ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link href="/today">Back to today</Link>
            </Button>
          </div>
        ) : null}

        {/*
          Keyed by date. The chevrons either side of the title are soft
          navigations, so React keeps these components mounted across a change
          of day and any state they seeded from props on first render — the
          note, the water amount, the day type — would still be yesterday's.
          Remounting is cheap here and is the only way to be sure.

          The prefix on each key is not decoration. These are siblings, so a
          bare `date` would give four children the same key: React then matches
          children by key, three of the four old fibers are lost from that map
          and never deleted, and their DOM is left on the page while the new
          ones are inserted around it. That is a duplicated Training/Rest
          control and a water card still showing another day's total, added to
          on every revalidation — which is every tap that logs anything.
        */}
        <DayStateControl
          key={`day-state-${date}`}
          date={date}
          dayTypes={dayTypes}
          currentDayTypeId={day.dayTypeId}
          loggedMealCount={loggedMeals}
          totalMealCount={day.meals.length}
        />

        <WorkoutLine
          key={`workout-${date}`}
          date={date}
          isTraining={day.isTraining}
          workout={day.workout}
          workoutTime={day.workoutTime}
          defaultWorkoutTime={settings?.workoutTime ?? '19:30'}
          focuses={workoutFocuses}
          selectedFocusIds={selectedFocusIds}
        />

        <ProgressStrip day={day} />

        {/* The one thing to do next ------------------------------------------ */}
        {next ? (
          <NextMealHero
            meal={next.meal}
            minutesAway={heroMinutes}
            substitutions={substitutions}
            dayTypeName={day.dayTypeName}
            isTraining={day.isTraining}
          />
        ) : nothingLeft && isToday ? (
          <Card className="flex items-center gap-3 border-success/40 bg-success/5 p-4">
            <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold">{allEaten ? 'All meals eaten' : 'No meals left today'}</p>
              <p className="text-sm text-muted-foreground">
                {day.water.remainingMl > 0 ? `${formatWater(day.water.remainingMl)} of water to go` : 'Water target reached'}
                {day.adherence.supplements.total - day.adherence.supplements.completed > 0
                  ? ` · ${day.adherence.supplements.total - day.adherence.supplements.completed} supplements left`
                  : ''}
              </p>
            </div>
          </Card>
        ) : null}

        <WaterCard
          key={`water-${date}`}
          date={date}
          water={day.water}
          quickAddA={settings?.quickAddAMl ?? 250}
          quickAddB={settings?.quickAddBMl ?? 500}
        />

        {/* Meals ------------------------------------------------------------- */}
        <section className="space-y-2" aria-labelledby="meals-heading">
          <div className="flex items-center justify-between px-1">
            <h2 id="meals-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Meals
            </h2>
            <span className="tabular text-xs font-medium text-muted-foreground">
              {day.adherence.meals.completed} of {day.adherence.meals.total}
            </span>
          </div>

          {day.meals.length === 0 ? (
            <EmptyState
              icon={Utensils}
              title="No meals planned for today."
              action={
                <Button asChild>
                  <Link href="/plan">Open your plan</Link>
                </Button>
              }
            />
          ) : (
            <ul className="rounded-xl border border-border bg-card shadow-sm">
              {day.meals.map((meal) => {
                const state = rowState(meal);
                return (
                  <MealRow
                    key={meal.id}
                    meal={meal}
                    state={state}
                    minutes={state === 'next' ? next?.minutesAway : state === 'overdue' ? minutesFor(meal.scheduledTime) : undefined}
                    substitutions={substitutions}
                  />
                );
              })}
            </ul>
          )}
        </section>

        <SupplementGroups supplements={day.supplements} />

        {reminders.length > 0 ? (
          <>
            <ReminderStrip reminders={reminders} />
            <ReminderNotifier reminders={reminders} enabled={settings?.notificationsEnabled ?? false} />
          </>
        ) : null}

        <NoteRow key={`note-${date}`} date={date} checkIn={day.checkIn} dayNotes={day.notes} />
      </PageBody>
    </>
  );
}
