import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { formatDayShort, fromDbDate } from '@/lib/domain/dates';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { BatchCard, type BatchRow } from '@/components/prep/batch-card';
import { PrepTasks, type PrepTaskRow } from '@/components/prep/prep-tasks';
import { SessionActions } from '@/components/prep/session-actions';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function PrepSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requireUser();
  const { sessionId } = await params;

  const session = await prisma.prepSession.findFirst({
    where: { id: sessionId, userId: user.id },
    include: {
      tasks: { orderBy: { sortOrder: 'asc' } },
      batches: {
        orderBy: { sortOrder: 'asc' },
        include: {
          food: { select: { cookingYieldPct: true } },
          _count: { select: { storagePortions: true } },
          storagePortions: { select: { portions: true } },
        },
      },
    },
  });

  if (!session) notFound();

  const prepDate = fromDbDate(session.date);

  const batches: BatchRow[] = session.batches.map((batch) => ({
    id: batch.id,
    foodName: batch.foodName,
    targetCookedG: batch.targetCookedG,
    rawWeightG: batch.rawWeightG,
    cookedWeightG: batch.cookedWeightG,
    measuredYieldPct: batch.measuredYieldPct,
    portionSizeG: batch.portionSizeG,
    portionsPlanned: batch.portionsPlanned,
    portionsMade: batch.portionsMade,
    containersPrepared: batch.containersPrepared,
    expectedYieldPct: batch.food?.cookingYieldPct ?? null,
    storedPortions: batch.storagePortions.reduce((sum, p) => sum + p.portions, 0),
  }));

  const tasks: PrepTaskRow[] = session.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    kind: task.kind,
    targetQty: task.targetQty,
    unit: task.unit,
    notes: task.notes,
    done: task.done,
  }));

  const cooked = batches.filter((b) => b.cookedWeightG != null).length;

  return (
    <>
      <PageHeader
        title={session.name}
        subtitle={`${formatDayShort(prepDate)} · ${session.daysCovered} days of food`}
        backHref="/prep"
        action={<SessionActions sessionId={session.id} status={session.status} />}
      />

      <PageBody>
        <Card className="p-4">
          <p className="text-sm">
            <span className="tabular font-semibold">{cooked}</span> of{' '}
            <span className="tabular font-semibold">{batches.length}</span> batches cooked ·{' '}
            <span className="tabular font-semibold">{tasks.filter((t) => t.done).length}</span> of{' '}
            <span className="tabular font-semibold">{tasks.length}</span> tasks done
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Covering {session.trainingDays} training and {session.restDays} rest days.
          </p>
        </Card>

        <section className="space-y-2">
          <SectionTitle>Cook</SectionTitle>
          <p className="px-1 text-xs text-muted-foreground">
            Weigh the raw food, cook it, then weigh the result. PrepTracker works out your real yield and
            how many portions you got, and uses it to sharpen the next shopping list.
          </p>
          {batches.map((batch) => (
            <BatchCard key={batch.id} batch={batch} prepDate={prepDate} />
          ))}
        </section>

        <section className="space-y-2">
          <SectionTitle>Tasks</SectionTitle>
          <PrepTasks prepSessionId={session.id} tasks={tasks} />
        </section>
      </PageBody>
    </>
  );
}
