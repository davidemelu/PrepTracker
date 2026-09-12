import Link from 'next/link';
import { ChevronLeft, ChevronRight, Utensils } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { addDays, formatDayLong, isValidDayKey, relativeDayLabel, todayKey } from '@/lib/domain/dates';
import { findNextMeal, findOverdueMeals } from '@/lib/domain/schedule';
import { currentTimeString, formatDuration, formatTime12h } from '@/lib/domain/time';
import {
  getDayFocusIds,
  getDayTypes,
  getDayView,
  getSubstitutionOptions,
  getWorkoutFocuses,
} from '@/lib/queries/day';
import { getReminders } from '@/lib/queries/reminders';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { CheckInCard } from '@/components/today/check-in-card';
import { DaySummary } from '@/components/today/day-summary';
import { DayTypeSwitcher } from '@/components/today/day-type-switcher';
import { MealCard } from '@/components/today/meal-card';
import { ReminderNotifier } from '@/components/today/reminder-notifier';
import { RemindersBanner } from '@/components/today/reminders-banner';
import { SupplementsCard } from '@/components/today/supplements-card';
import { WaterCard } from '@/components/today/water-card';
import { WorkoutCard } from '@/components/today/workout-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const today = todayKey();
  const date = params.date && isValidDayKey(params.date) ? params.date : today;

  const [day, dayTypes, substitutions, settings, workoutFocuses, selectedFocusIds] =
    await Promise.all([
      getDayView(user.id, date),
      getDayTypes(user.id),
      getSubstitutionOptions(user.id),
      prisma.settings.findUnique({ where: { userId: user.id } }),
      getWorkoutFocuses(user.id),
      getDayFocusIds(user.id, date),
    ]);

  const reminders = date === today ? await getReminders(user.id, day, today) : [];

  const nowTime = currentTimeString();
  const next = date === today ? findNextMeal(day.meals, nowTime) : null;
  const overdueIds = new Set(
    (date === today ? findOverdueMeals(day.meals, nowTime) : []).map((m) => m.id),
  );

  return (
    <>
      <PageHeader
        title={date === today ? 'Today' : relativeDayLabel(date, today)}
        subtitle={formatDayLong(date)}
        action={
          <DayTypeSwitcher
            date={date}
            currentDayTypeId={day.dayTypeId}
            currentDayTypeName={day.dayTypeName}
            isTraining={day.isTraining}
            dayTypes={dayTypes}
          />
        }
      />

      <PageBody>
        {/*
          Day stepper. Prefetch is off deliberately: opening a date materialises
          it from the plan, and prefetching would silently create days you only
          hovered over — which would then show up in the weekly tracker.
        */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link
              href={`/today?date=${addDays(date, -1)}`}
              aria-label="Previous day"
              prefetch={false}
            >
              <ChevronLeft className="size-4" />
              {relativeDayLabel(addDays(date, -1), today)}
            </Link>
          </Button>

          {date !== today ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/today">Back to today</Link>
            </Button>
          ) : null}

          <Button variant="ghost" size="sm" asChild>
            <Link
              href={`/today?date=${addDays(date, 1)}`}
              aria-label="Next day"
              prefetch={false}
            >
              {relativeDayLabel(addDays(date, 1), today)}
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>

        <DaySummary day={day} />

        {reminders.length > 0 ? (
          <>
            <RemindersBanner reminders={reminders} />
            <ReminderNotifier
              reminders={reminders}
              enabled={settings?.notificationsEnabled ?? false}
            />
          </>
        ) : null}

        {/* Next meal ----------------------------------------------------- */}
        {next ? (
          <Card className="flex items-center gap-3 p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Utensils className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Next meal</p>
              <p className="truncate font-semibold">{next.meal.name}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular font-semibold">
                {next.meal.scheduledTime ? formatTime12h(next.meal.scheduledTime) : '—'}
              </p>
              <p className="text-xs text-muted-foreground">in {formatDuration(next.minutesAway)}</p>
            </div>
          </Card>
        ) : null}

        <WorkoutCard
          date={date}
          isTraining={day.isTraining}
          workout={day.workout}
          workoutTime={day.workoutTime}
          defaultWorkoutTime={settings?.workoutTime ?? '19:30'}
          focuses={workoutFocuses}
          selectedFocusIds={selectedFocusIds}
        />

        <WaterCard
          date={date}
          water={day.water}
          quickAddA={settings?.quickAddAMl ?? 250}
          quickAddB={settings?.quickAddBMl ?? 500}
        />

        {/* Meals --------------------------------------------------------- */}
        <section className="space-y-2">
          <SectionTitle>
            Meals · {day.adherence.meals.completed} of {day.adherence.meals.total}
          </SectionTitle>

          {day.meals.length === 0 ? (
            <EmptyState
              icon={Utensils}
              title="No meals for this day"
              description="Either no plan is active or no meals apply to this day type."
              action={
                <Button asChild size="sm">
                  <Link href="/plan">Open the meal plan</Link>
                </Button>
              }
            />
          ) : (
            day.meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                substitutions={substitutions}
                isNext={next?.meal.id === meal.id}
                isOverdue={overdueIds.has(meal.id)}
              />
            ))
          )}
        </section>

        <SupplementsCard dailyPlanId={day.id} supplements={day.supplements} />

        <CheckInCard date={date} checkIn={day.checkIn} dayNotes={day.notes} />

        <p className="px-1 pb-2 text-center text-xs text-muted-foreground">
          Plan: {day.mealPlanName}
        </p>
      </PageBody>
    </>
  );
}
