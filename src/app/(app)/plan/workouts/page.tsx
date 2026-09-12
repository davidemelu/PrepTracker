import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { getWorkoutFocuses } from '@/lib/queries/day';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { WorkoutsManager, type WeekdayWorkout } from '@/components/plan/workouts-manager';

export const metadata = { title: 'Workouts' };
export const dynamic = 'force-dynamic';

export default async function WorkoutsPage() {
  const user = await requireUser();

  const [focuses, scheduleDays] = await Promise.all([
    getWorkoutFocuses(user.id),
    prisma.scheduleDay.findMany({
      where: { userId: user.id },
      orderBy: { dayOfWeek: 'asc' },
      include: {
        dayType: true,
        focuses: { orderBy: { sortOrder: 'asc' }, include: { focus: true } },
      },
    }),
  ]);

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
      <PageHeader title="Workouts" subtitle="What you train, and when" backHref="/plan" />
      <PageBody>
        <WorkoutsManager focuses={focuses} weekdays={weekdays} />
      </PageBody>
    </>
  );
}
