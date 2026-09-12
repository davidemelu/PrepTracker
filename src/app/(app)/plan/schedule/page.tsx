import { requireUser } from '@/lib/auth/guards';
import { getWeeklySchedule } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { ScheduleManager } from '@/components/plan/schedule-manager';

export const metadata = { title: 'Weekly schedule' };
export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const user = await requireUser();
  const { dayTypes, days } = await getWeeklySchedule(user.id);

  const assignments: Record<number, string> = {};
  for (const day of days) assignments[day.dayOfWeek] = day.dayTypeId;
  for (let day = 1; day <= 7; day += 1) {
    assignments[day] ??= dayTypes[0]?.id ?? '';
  }

  return (
    <>
      <PageHeader title="Weekly schedule" subtitle="Training and rest days" backHref="/plan" />
      <PageBody>
        <ScheduleManager
          dayTypes={dayTypes.map((d) => ({
            id: d.id,
            name: d.name,
            isTraining: d.isTraining,
            color: d.color,
          }))}
          assignments={assignments}
        />
      </PageBody>
    </>
  );
}
