import Link from 'next/link';
import { ChevronRight, ShoppingCart } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { fromDbDate, startOfWeek, todayKey } from '@/lib/domain/dates';
import { suggestDayTypeCounts } from '@/lib/server/grocery-service';
import { getSettings } from '@/lib/queries/plan';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { NewWeekSheet } from '@/components/groceries/new-week-sheet';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/primitives';

export const metadata = { title: 'Groceries' };
export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  DRAFT: 'secondary',
  ACTIVE: 'default',
  COMPLETED: 'success',
  ARCHIVED: 'outline',
} as const;

export default async function GroceriesPage() {
  const user = await requireUser();
  const settings = await getSettings(user.id);

  const [weeks, dayTypeCounts] = await Promise.all([
    prisma.groceryWeek.findMany({
      where: { userId: user.id },
      orderBy: { startDate: 'desc' },
      take: 25,
      include: {
        _count: { select: { items: true } },
        items: { select: { purchased: true, haveAlready: true } },
      },
    }),
    suggestDayTypeCounts(user.id, settings.defaultPlanDays),
  ]);

  const defaults = {
    startDate: startOfWeek(todayKey(), settings.weekStartsOn),
    daysPlanned: settings.defaultPlanDays,
    dayTypes: dayTypeCounts,
  };

  return (
    <>
      <PageHeader title="Groceries" subtitle="Generated from your plan" action={<NewWeekSheet defaults={defaults} />} />

      <PageBody>
        {weeks.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No grocery lists yet"
            description="Generate one from your meal plan. Cooked weights are converted to raw amounts automatically."
          />
        ) : (
          <section className="space-y-2">
            <SectionTitle>Lists</SectionTitle>
            {weeks.map((week) => {
              const total = week.items.length;
              const done = week.items.filter((i) => i.purchased || i.haveAlready).length;
              const percent = total === 0 ? 0 : Math.round((done / total) * 100);

              return (
                <Link key={week.id} href={`/groceries/${week.id}`} className="block">
                  <Card className="p-4 transition-colors hover:bg-accent/40">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="font-semibold leading-tight">{week.name}</h3>
                          <Badge variant={STATUS_VARIANT[week.status]}>
                            {week.status.charAt(0) + week.status.slice(1).toLowerCase()}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {fromDbDate(week.startDate)} → {fromDbDate(week.endDate)} ·{' '}
                          {week.trainingDays} training, {week.restDays} rest
                        </p>
                      </div>
                      <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <Progress value={percent} className="h-2 flex-1" />
                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                        {done}/{total}
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </section>
        )}
      </PageBody>
    </>
  );
}
