import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { getWorkoutFocuses } from '@/lib/queries/day';
import { getWeeklySchedule } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { ScheduleManager } from '@/components/plan/schedule-manager';
import { WorkoutsManager, type WeekdayWorkout } from '@/components/plan/workouts-manager';

export const metadata = { title: 'Training days & workouts' };
export const dynamic = 'force-dynamic';

/**
 * One screen for the seven weekdays: which day type each is, and the usual
 * session on training days. Day types and the workout catalogue follow.
 */
export default async function SchedulePage() {
  const user = await requireUser();

  const [{ dayTypes, days }, focuses, scheduleDays] = await Promise.all([
    getWeeklySchedule(user.id),
    getWorkoutFocuses(user.id),
    prisma.scheduleDay.findMany({
      where: { userId: user.id },
      orderBy: { dayOfWeek: 'asc' },
      include: { dayType: true, focuses: { orderBy: { sortOrder: 'asc' }, include: { focus: true } } },
    }),
  ]);

  const assignments: Record<number, string> = {};
  for (const day of days) assignments[day.dayOfWeek] = day.dayTypeId;
  for (let day = 1; day <= 7; day += 1) {
    assignments[day] ??= dayTypes[0]?.id ?? '';
  }

  const weekdays: WeekdayWorkout[] = scheduleDays.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    dayTypeName: day.dayType.name,
    isTraining: day.dayType.isTraining,
    workoutName: day.workoutName,
    focusIds: day.focuses.map((f) => f.focusId),
    focusNames: day.focuses.map((f) => f.focus.name),
  }));

  return (
    <>
      <PageHeader title="Training days & workouts" subtitle="Your usual week" backHref="/plan" />
      <PageBody>
        <ScheduleManager
          dayTypes={dayTypes.map((d) => ({ id: d.id, name: d.name, isTraining: d.isTraining, color: d.color }))}
          assignments={assignments}
        />
        <WorkoutsManager focuses={focuses} weekdays={weekdays} />
      </PageBody>
    </>
  );
}
