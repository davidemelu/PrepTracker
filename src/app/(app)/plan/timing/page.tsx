import { requireUser } from '@/lib/auth/guards';
import { getActivePlan, getSettings } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { TimingManager } from '@/components/plan/timing-manager';

export const metadata = { title: 'Meal timing' };
export const dynamic = 'force-dynamic';

export default async function TimingPage() {
  const user = await requireUser();
  const [settings, plan] = await Promise.all([getSettings(user.id), getActivePlan(user.id)]);

  return (
    <>
      <PageHeader title="Meal timing" subtitle="Generate a schedule from your day" backHref="/plan" />
      <PageBody>
        <TimingManager
          mealPlanId={plan?.id ?? null}
          initial={{
            autoScheduleMeals: settings.autoScheduleMeals,
            firstMealTime: settings.firstMealTime,
            mealIntervalMinutes: String(settings.mealIntervalMinutes),
            mealIntervalMaxMinutes: String(settings.mealIntervalMaxMinutes),
            mealDurationMinutes: String(settings.mealDurationMinutes),
            workoutTime: settings.workoutTime,
            workoutDurationMinutes: String(settings.workoutDurationMinutes),
            lastMealEarliest: settings.lastMealEarliest,
            lastMealLatest: settings.lastMealLatest,
            bedtime: settings.bedtime,
            preWorkoutMinutes: String(settings.preWorkoutMinutes),
            postWorkoutMinutes: String(settings.postWorkoutMinutes),
          }}
        />
      </PageBody>
    </>
  );
}
