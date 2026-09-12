import Link from 'next/link';
import { requireUser } from '@/lib/auth/guards';
import { addDays, formatDayShort, todayKey } from '@/lib/domain/dates';
import { dayAdherence } from '@/lib/domain/adherence';
import { formatWater } from '@/lib/domain/water';
import {
  getCheckInHistory,
  getDayRows,
  getHistoryLists,
  getYieldHistory,
} from '@/lib/queries/analytics';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { HistoryTabs } from '@/components/more/history-tabs';

export const metadata = { title: 'History' };
export const dynamic = 'force-dynamic';

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const days = Math.min(365, Math.max(7, Number(params.days) || 60));
  const today = todayKey();
  const from = addDays(today, -(days - 1));

  const [rows, lists, yields, checkIns] = await Promise.all([
    getDayRows(user.id, from, today),
    getHistoryLists(user.id),
    getYieldHistory(user.id),
    getCheckInHistory(user.id, from, today),
  ]);

  const dayRows = rows
    .filter((row) => row.exists)
    .reverse()
    .map((row) => {
      const adherence = dayAdherence({
        meals: row.meals,
        supplements: row.supplements,
        waterMl: row.waterMl,
        waterTargetMl: row.waterTargetMl,
      });
      return {
        date: row.date,
        label: formatDayShort(row.date),
        dayTypeName: row.dayTypeName,
        isTraining: row.isTraining,
        mealsCompleted: adherence.meals.completed,
        mealsTotal: adherence.meals.total,
        supplementsCompleted: adherence.supplements.completed,
        supplementsTotal: adherence.supplements.total,
        water: formatWater(row.waterMl),
        waterPercent: adherence.water.percent,
        overall: adherence.overallPercent,
        notes: row.notes,
      };
    });

  return (
    <>
      <PageHeader title="History" subtitle={`Last ${days} days`} backHref="/more" />
      <PageBody>
        <HistoryTabs
          days={dayRows}
          groceryWeeks={lists.groceryWeeks}
          prepSessions={lists.prepSessions}
          yields={yields}
          checkIns={checkIns}
        />
        <p className="pb-2 text-center text-xs text-muted-foreground">
          Showing {days} days.{' '}
          <Link href="/more/history?days=365" className="underline">
            Show a year
          </Link>
        </p>
      </PageBody>
    </>
  );
}
