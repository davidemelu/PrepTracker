import Link from 'next/link';
import { ChefHat, ChevronRight, Percent, Play, Refrigerator, Snowflake, Sun } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { fromDbDate, relativeDayLabel, todayKey } from '@/lib/domain/dates';
import { storageActions, summariseStorage, type StoredPortionLike } from '@/lib/domain/storage';
import { getSettings } from '@/lib/queries/plan';
import { suggestDayTypeCounts } from '@/lib/server/grocery-service';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { NewSessionSheet } from '@/components/prep/new-session-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Prep' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL = { PLANNED: 'Planned', IN_PROGRESS: 'In progress', COMPLETED: 'Done' } as const;
const STATUS_VARIANT = { PLANNED: 'secondary', IN_PROGRESS: 'default', COMPLETED: 'success' } as const;

function Tile({
  icon: Icon,
  label,
  value,
  href,
  warn = false,
}: {
  icon: typeof Refrigerator;
  label: string;
  value: number;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-24 flex-1 flex-col justify-between rounded-xl border bg-card p-3 shadow-sm',
        warn ? 'border-warning/50 bg-warning/10' : 'border-border',
      )}
    >
      <span className={cn('flex items-center gap-1 text-xs font-semibold uppercase tracking-wide', warn ? 'text-warning' : 'text-muted-foreground')}>
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      <span>
        <span className={cn('tabular block text-[28px] font-semibold leading-8', warn && 'text-warning')}>{value}</span>
        <span className={cn('text-xs', warn ? 'text-warning' : 'text-muted-foreground')}>portions</span>
      </span>
    </Link>
  );
}

/**
 * Prep opens on what is in storage right now and the session you are in the
 * middle of. Past sessions and yield settings sit underneath.
 */
export default async function PrepPage() {
  const user = await requireUser();
  const today = todayKey();
  const settings = await getSettings(user.id);

  const [sessions, portions, dayTypeCounts] = await Promise.all([
    prisma.prepSession.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: 20,
      include: {
        batches: { select: { cookedWeightG: true, _count: { select: { storagePortions: true } } } },
        tasks: { select: { done: true } },
      },
    }),
    prisma.storagePortion.findMany({
      where: { userId: user.id, status: { notIn: ['CONSUMED', 'DISCARDED'] } },
    }),
    suggestDayTypeCounts(user.id, settings.defaultPlanDays),
  ]);

  const portionLikes: StoredPortionLike[] = portions.map((p) => ({
    id: p.id,
    label: p.label,
    portions: p.portions,
    location: p.location,
    status: p.status,
    prepDate: fromDbDate(p.prepDate),
    thawOn: p.thawOn ? fromDbDate(p.thawOn) : null,
    useByDate: p.useByDate ? fromDbDate(p.useByDate) : null,
  }));

  const summary = summariseStorage(portionLikes, today);
  const actions = storageActions(portionLikes, today);
  const moveNow = actions.filter((a) => a.kind === 'MOVE_TO_FRIDGE');
  const thawTonight = moveNow.reduce((sum, a) => sum + a.portion.portions, 0);

  const current = sessions.find((s) => s.status !== 'COMPLETED') ?? null;
  const past = sessions.filter((s) => s.id !== current?.id);

  const describe = (session: (typeof sessions)[number]) => {
    const cooked = session.batches.filter((b) => b.cookedWeightG != null).length;
    const done = session.tasks.filter((t) => t.done).length;
    return `${cooked} of ${session.batches.length} cooked · ${done} of ${session.tasks.length} tasks`;
  };

  return (
    <>
      <PageHeader title="Prep" action={current ? <NewSessionSheet dayTypes={dayTypeCounts} /> : null} />

      <PageBody>
        <section className="space-y-2">
          <SectionTitle>Storage</SectionTitle>
          <div className="flex gap-2">
            <Tile icon={Refrigerator} label="Ready" value={summary.fridgePortions} href="/prep/storage" />
            <Tile icon={Snowflake} label="Freezer" value={summary.freezerPortions} href="/prep/storage" />
            <Tile icon={Sun} label="Thaw tonight" value={thawTonight} href="/prep/storage" warn={thawTonight > 0} />
          </div>
          {moveNow.length > 0 ? (
            <Link
              href="/prep/storage"
              className="flex min-h-11 items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
            >
              <Snowflake className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{moveNow[0]!.message}{moveNow.length > 1 ? ` and ${moveNow.length - 1} more` : ''}</span>
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            </Link>
          ) : null}
        </section>

        <section className="space-y-2">
          <SectionTitle>Prep session</SectionTitle>
          {current ? (
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-[17px] font-semibold">{current.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {relativeDayLabel(fromDbDate(current.date), today)} · {current.daysCovered} days of food
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[current.status]}>{STATUS_LABEL[current.status]}</Badge>
              </div>
              <p className="tabular text-sm">{describe(current)}</p>
              <Button asChild size="hero">
                <Link href={`/prep/${current.id}`}>
                  <Play className="size-5" />
                  {current.status === 'PLANNED' ? 'Start prep' : 'Continue prep'}
                </Link>
              </Button>
            </Card>
          ) : (
            <EmptyState
              icon={ChefHat}
              title="No prep session this week."
              description="PrepTracker works out how much of each food to cook and how many portions you will get."
              action={<NewSessionSheet dayTypes={dayTypeCounts} triggerLabel="Plan a prep session" triggerVariant="default" triggerSize="default" />}
            />
          )}
        </section>

        <Link href="/prep/yields" className="block">
          <Card className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40">
            <Percent className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-tight">Cooking yields</span>
              <span className="block text-xs text-muted-foreground">Raw to cooked, improved by what you weigh</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Card>
        </Link>

        {past.length > 0 ? (
          <section className="space-y-2">
            <SectionTitle>Past sessions</SectionTitle>
            <Card className="divide-y divide-border">
              {past.map((session) => (
                <Link
                  key={session.id}
                  href={`/prep/${session.id}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-tight">{session.name}</span>
                    <span className="tabular block text-xs text-muted-foreground">
                      {relativeDayLabel(fromDbDate(session.date), today)} · {describe(session)}
                    </span>
                  </span>
                  <Badge variant={STATUS_VARIANT[session.status]}>{STATUS_LABEL[session.status]}</Badge>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </Card>
          </section>
        ) : null}
      </PageBody>
    </>
  );
}
