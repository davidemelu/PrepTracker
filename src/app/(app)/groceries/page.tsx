import Link from 'next/link';
import { ChevronRight, ShoppingBasket, ShoppingCart } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { formatDayShort, fromDbDate, startOfWeek, todayKey } from '@/lib/domain/dates';
import { suggestDayTypeCounts } from '@/lib/server/grocery-service';
import { getSettings } from '@/lib/queries/plan';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { NewWeekSheet } from '@/components/groceries/new-week-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/primitives';

export const metadata = { title: 'Groceries' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL = { DRAFT: 'Draft', ACTIVE: 'Active', COMPLETED: 'Done', ARCHIVED: 'Archived' } as const;
const STATUS_VARIANT = { DRAFT: 'secondary', ACTIVE: 'default', COMPLETED: 'success', ARCHIVED: 'outline' } as const;

/**
 * Groceries opens on the list you are shopping from, with Shop as the one
 * primary action. Past lists are an archive underneath.
 */
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

  const current = weeks.find((w) => w.status === 'ACTIVE' || w.status === 'DRAFT') ?? null;
  const past = weeks.filter((w) => w.id !== current?.id);

  const stats = (week: (typeof weeks)[number]) => {
    const total = week.items.length;
    const done = week.items.filter((i) => i.purchased || i.haveAlready).length;
    return { total, done, remaining: total - done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
  };

  return (
    <>
      <PageHeader title="Groceries" action={current ? <NewWeekSheet defaults={defaults} /> : null} />

      <PageBody>
        {current ? (
          (() => {
            const s = stats(current);
            return (
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-[17px] font-semibold">{current.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {formatDayShort(fromDbDate(current.startDate))} – {formatDayShort(fromDbDate(current.endDate))}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[current.status]}>{STATUS_LABEL[current.status]}</Badge>
                </div>

                <div>
                  <p className="tabular text-[28px] font-semibold leading-8">
                    {s.remaining}{' '}
                    <span className="text-[17px] font-medium text-muted-foreground">
                      {s.remaining === 1 ? 'item' : 'items'} remaining
                    </span>
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <Progress value={s.percent} className="h-1.5 flex-1" indicatorClassName={s.remaining === 0 ? 'bg-success' : undefined} />
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {s.done} of {s.total}
                    </span>
                  </div>
                </div>

                <Button asChild size="hero">
                  <Link href={`/groceries/${current.id}/shop`}>
                    <ShoppingBasket className="size-5" />
                    Shop
                  </Link>
                </Button>
                <Button asChild variant="outline" size="block">
                  <Link href={`/groceries/${current.id}`}>Review list</Link>
                </Button>
              </Card>
            );
          })()
        ) : (
          <EmptyState
            icon={ShoppingCart}
            title="No grocery list yet."
            description="Built from your meal plan. Cooked weights become raw amounts to buy."
            action={<NewWeekSheet defaults={defaults} triggerLabel="Generate this week's list" triggerVariant="default" triggerSize="default" />}
          />
        )}

        {past.length > 0 ? (
          <section className="space-y-2">
            <SectionTitle>Past lists</SectionTitle>
            <Card className="divide-y divide-border">
              {past.map((week) => {
                const s = stats(week);
                return (
                  <Link
                    key={week.id}
                    href={`/groceries/${week.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium leading-tight">{week.name}</span>
                      <span className="tabular block text-xs text-muted-foreground">
                        {formatDayShort(fromDbDate(week.startDate))} – {formatDayShort(fromDbDate(week.endDate))} · {s.done} of {s.total}
                      </span>
                    </span>
                    <Badge variant={STATUS_VARIANT[week.status]}>{STATUS_LABEL[week.status]}</Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                );
              })}
            </Card>
          </section>
        ) : null}
      </PageBody>
    </>
  );
}
