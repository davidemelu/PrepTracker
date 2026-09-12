import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { weekdayShort } from '@/lib/domain/dates';
import { formatWorkoutShort } from '@/lib/domain/workout';
import { getSettings } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { SettingsManager } from '@/components/more/settings-manager';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, scheduleDays] = await Promise.all([
    getSettings(user.id),
    prisma.scheduleDay.findMany({
      where: { userId: user.id },
      orderBy: { dayOfWeek: 'asc' },
      include: { dayType: true, focuses: { orderBy: { sortOrder: 'asc' }, include: { focus: true } } },
    }),
  ]);

  const weekSummary = scheduleDays
    .map((day) => {
      const workout = formatWorkoutShort({ workoutName: day.workoutName, focusNames: day.focuses.map((f) => f.focus.name) }, 2);
      return `${weekdayShort(day.dayOfWeek)} ${day.dayType.isTraining ? (workout ?? 'Training') : 'Rest'}`;
    })
    .join(' · ');

  return (
    <>
      <PageHeader title="Settings" backHref="/more" />
      <PageBody>
        <SettingsManager
          weekSummary={weekSummary}
          initial={{
            waterTargetMl: settings.waterTargetMl,
            quickAddAMl: settings.quickAddAMl,
            quickAddBMl: settings.quickAddBMl,
            fridgeDays: settings.fridgeDays,
            freezerThawLeadDays: settings.freezerThawLeadDays,
            defaultPortionG: settings.defaultPortionG,
            defaultPlanDays: settings.defaultPlanDays,
            seasoningNote: settings.seasoningNote,
            notificationsEnabled: settings.notificationsEnabled,
            timing: {
              autoScheduleMeals: settings.autoScheduleMeals,
              firstMealTime: settings.firstMealTime,
              mealIntervalMinutes: settings.mealIntervalMinutes,
              mealIntervalMaxMinutes: settings.mealIntervalMaxMinutes,
              mealDurationMinutes: settings.mealDurationMinutes,
              workoutTime: settings.workoutTime,
              workoutDurationMinutes: settings.workoutDurationMinutes,
              lastMealEarliest: settings.lastMealEarliest,
              lastMealLatest: settings.lastMealLatest,
              bedtime: settings.bedtime,
              preWorkoutMinutes: settings.preWorkoutMinutes,
              postWorkoutMinutes: settings.postWorkoutMinutes,
            },
          }}
        />
      </PageBody>
    </>
  );
}
