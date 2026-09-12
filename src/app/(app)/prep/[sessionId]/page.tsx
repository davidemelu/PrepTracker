import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { formatDayShort, fromDbDate } from '@/lib/domain/dates';
import { batchStage } from '@/lib/domain/prep-stage';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { BatchCard, type BatchRow } from '@/components/prep/batch-card';
import { PrepTasks, type PrepTaskRow } from '@/components/prep/prep-tasks';
import { SessionActions } from '@/components/prep/session-actions';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PrepSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
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

  const stages = batches.map(batchStage);
  const activeIndex = stages.findIndex((s) => s !== 'done');
  const doneCount = stages.filter((s) => s === 'done').length;
  const tasksDone = tasks.filter((t) => t.done).length;

  return (
    <>
      <PageHeader
        title={session.name}
        subtitle={`${formatDayShort(prepDate)} · ${session.daysCovered} days of food`}
        backHref="/prep"
        action={<SessionActions sessionId={session.id} status={session.status} />}
      />

      <PageBody>
        {batches.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">
                {activeIndex === -1 ? 'All batches done' : `Batch ${activeIndex + 1} of ${batches.length}`}
              </span>
              <span className="text-sm text-muted-foreground">{batches.map((b) => b.foodName).join(' · ')}</span>
            </div>
            <div className="flex gap-1.5" aria-hidden>
              {stages.map((stage, index) => (
                <div key={batches[index]!.id} className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn('h-full rounded-full', stage === 'done' ? 'w-full bg-success' : index === activeIndex ? 'bg-primary' : 'w-0')}
                    style={index === activeIndex ? { width: stage === 'raw' ? '15%' : stage === 'cooked' ? '50%' : '85%' } : undefined}
                  />
                </div>
              ))}
            </div>
            <p className="sr-only">
              {doneCount} of {batches.length} batches done.
            </p>
          </div>
        ) : null}

        <section className="space-y-2">
          {batches.map((batch, index) => (
            <BatchCard key={batch.id} batch={batch} prepDate={prepDate} daysCovered={session.daysCovered} active={index === activeIndex} />
          ))}
        </section>

        <section className="space-y-2">
          <SectionTitle>
            Tasks <span className="tabular normal-case tracking-normal">{tasksDone} of {tasks.length}</span>
          </SectionTitle>
          <PrepTasks prepSessionId={session.id} tasks={tasks} />
        </section>
      </PageBody>
    </>
  );
}
