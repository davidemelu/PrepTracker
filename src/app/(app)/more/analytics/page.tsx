import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { addDays, todayKey } from '@/lib/domain/dates';
import { formatWater } from '@/lib/domain/water';
import {
  getMealCompletionBreakdown,
  getPeriodStats,
  getSupplementAdherence,
  getWaterTrend,
  getWeeklyAdherence,
  getYieldHistory,
} from '@/lib/queries/analytics';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import {
  CompletionByMealChart,
  SupplementAdherenceChart,
  WaterTrendChart,
  WeeklyAdherenceChart,
  YieldChart,
} from '@/components/more/charts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

const RANGES = [
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const days = RANGES.some((r) => String(r.days) === params.days) ? Number(params.days) : 30;
  const today = todayKey();
  const from = addDays(today, -(days - 1));

  const [stats, weekly, water, byMeal, supplements, yields] = await Promise.all([
    getPeriodStats(user.id, from, today),
    getWeeklyAdherence(user.id, Math.min(12, Math.ceil(days / 7)), today),
    getWaterTrend(user.id, addDays(today, -13), today),
    getMealCompletionBreakdown(user.id, from, today),
    getSupplementAdherence(user.id, from, today),
    getYieldHistory(user.id),
  ]);

  const hasData = stats.trackedDays > 0;

  return (
    <>
      <PageHeader title="Analytics" subtitle={`Last ${days} days`} backHref="/more" />

      <PageBody>
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <Button
              key={range.days}
              asChild
              variant={range.days === days ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
            >
              <Link href={`/more/analytics?days=${range.days}`}>{range.label}</Link>
            </Button>
          ))}
        </div>

        {!hasData ? (
          <EmptyState
            icon={BarChart3}
            title="No tracked days yet"
            description="Complete a few meals and log some water, then come back to see how you are trending."
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                <CardDescription>
                  {stats.trackedDays} of {stats.totalDays} days tracked
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {[
                  ['Overall', `${Math.round(stats.overallPercent)}%`],
                  ['Meals', `${stats.completedMeals}/${stats.plannedMeals}`],
                  ['Perfect days', String(stats.perfectDays)],
                  ['Average water', formatWater(stats.averageWaterMl)],
                  [
                    'Training days',
                    stats.trainingDayPercent != null ? `${Math.round(stats.trainingDayPercent)}%` : '—',
                  ],
                  [
                    'Rest days',
                    stats.restDayPercent != null ? `${Math.round(stats.restDayPercent)}%` : '—',
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border p-3">
                    <p className="tabular text-xl font-bold leading-none">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {weekly.length > 1 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Weekly adherence</CardTitle>
                  <CardDescription>
                    Overall in blue, meals in green, water in light blue
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <WeeklyAdherenceChart data={weekly} />
                </CardContent>
              </Card>
            ) : null}

            {water.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Water, last 14 days</CardTitle>
                  <CardDescription>Green bars hit the target</CardDescription>
                </CardHeader>
                <CardContent>
                  <WaterTrendChart data={water} />
                </CardContent>
              </Card>
            ) : null}

            {byMeal.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Completion by meal</CardTitle>
                  <CardDescription>Which meal slips most often</CardDescription>
                </CardHeader>
                <CardContent>
                  <CompletionByMealChart data={byMeal} />
                </CardContent>
              </Card>
            ) : null}

            {supplements.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Supplement adherence</CardTitle>
                  <CardDescription>Lowest first</CardDescription>
                </CardHeader>
                <CardContent>
                  <SupplementAdherenceChart data={supplements} />
                </CardContent>
              </Card>
            ) : null}
          </>
        )}

        {yields.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Cooking yield by protein</CardTitle>
              <CardDescription>Average of what you have actually measured</CardDescription>
            </CardHeader>
            <CardContent>
              <YieldChart data={yields} />
              <ul className="mt-3 space-y-1 border-t border-border pt-2">
                {yields.map((row) => (
                  <li key={row.foodName} className="flex justify-between gap-2 text-xs">
                    <span>{row.foodName}</span>
                    <span className="tabular text-muted-foreground">
                      {row.points.filter((p) => p.source === 'MEASURED').length} measured · now{' '}
                      {row.currentPct ?? '—'}%
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}
