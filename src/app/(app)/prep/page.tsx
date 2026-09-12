import Link from 'next/link';
import { ChefHat, ChevronRight, Percent, Refrigerator, Snowflake } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { fromDbDate, relativeDayLabel, todayKey } from '@/lib/domain/dates';
import { storageActions, summariseStorage, type StoredPortionLike } from '@/lib/domain/storage';
import { getSettings } from '@/lib/queries/plan';
import { suggestDayTypeCounts } from '@/lib/server/grocery-service';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { NewSessionSheet } from '@/components/prep/new-session-sheet';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata = { title: 'Prep' };
export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  PLANNED: 'secondary',
  IN_PROGRESS: 'default',
  COMPLETED: 'success',
} as const;

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
        _count: { select: { batches: true, tasks: true } },
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
  const actions = storageActions(portionLikes, today).slice(0, 3);

  return (
    <>
      <PageHeader
        title="Prep"
        subtitle="Batch cooking, yields and storage"
        action={<NewSessionSheet dayTypes={dayTypeCounts} />}
      />

      <PageBody>
        {/* Storage snapshot ---------------------------------------------- */}
        <Link href="/prep/storage" className="block">
          <Card className="p-4 transition-colors hover:bg-accent/40">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Storage</h2>
              <ChevronRight className="size-5 text-muted-foreground" />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="tabular text-xl font-bold">{summary.fridgePortions}</p>
                <p className="text-xs text-muted-foreground">
                  <Refrigerator className="mr-0.5 inline size-3" />
                  fridge
                </p>
              </div>
              <div>
                <p className="tabular text-xl font-bold">{summary.freezerPortions}</p>
                <p className="text-xs text-muted-foreground">
                  <Snowflake className="mr-0.5 inline size-3" />
                  freezer
                </p>
              </div>
              <div>
                <p className="tabular text-xl font-bold">{summary.thawingPortions}</p>
                <p className="text-xs text-muted-foreground">thawing</p>
              </div>
            </div>

            {actions.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-border pt-2">
                {actions.map((action) => (
                  <li key={action.portion.id} className="text-sm text-muted-foreground">
                    {action.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </Link>

        <Link href="/prep/yields" className="block">
          <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/40">
            <Percent className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-tight">Cooking yields</span>
              <span className="block text-xs text-muted-foreground">
                Raw-to-cooked conversion, improved by what you actually measure
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Card>
        </Link>

        {/* Sessions -------------------------------------------------------- */}
        <section className="space-y-2">
          <SectionTitle>Prep sessions</SectionTitle>

          {sessions.length === 0 ? (
            <EmptyState
              icon={ChefHat}
              title="No prep sessions yet"
              description="Create one and PrepTracker works out how much of each food to cook, how much raw meat to start with, and how many portions you will get."
            />
          ) : (
            sessions.map((session) => {
              const doneTasks = session.tasks.filter((t) => t.done).length;
              return (
                <Link key={session.id} href={`/prep/${session.id}`} className="block">
                  <Card className="p-4 transition-colors hover:bg-accent/40">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="font-semibold leading-tight">{session.name}</h3>
                          <Badge variant={STATUS_VARIANT[session.status]}>
                            {session.status === 'IN_PROGRESS'
                              ? 'In progress'
                              : session.status.charAt(0) + session.status.slice(1).toLowerCase()}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {relativeDayLabel(fromDbDate(session.date), today)} · {session.daysCovered} days ·{' '}
                          {session._count.batches} to cook · {doneTasks}/{session._count.tasks} tasks
                        </p>
                      </div>
                      <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
                    </div>
                  </Card>
                </Link>
              );
            })
          )}
        </section>
      </PageBody>
    </>
  );
}
