import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShoppingBasket } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { formatDayShort, fromDbDate } from '@/lib/domain/dates';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { GroceryList, type GroceryItemRow } from '@/components/groceries/grocery-list';
import { WeekActions } from '@/components/groceries/week-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = { DRAFT: 'Draft', ACTIVE: 'Active', COMPLETED: 'Done', ARCHIVED: 'Archived' } as const;

export default async function GroceryWeekPage({ params }: { params: Promise<{ weekId: string }> }) {
  const user = await requireUser();
  const { weekId } = await params;

  const week = await prisma.groceryWeek.findFirst({
    where: { id: weekId, userId: user.id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!week) notFound();

  const total = week.items.length;
  const done = week.items.filter((i) => i.purchased || i.haveAlready).length;
  const remaining = total - done;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <>
      <PageHeader
        title={week.name}
        subtitle={`${formatDayShort(fromDbDate(week.startDate))} – ${formatDayShort(fromDbDate(week.endDate))}`}
        backHref="/groceries"
        action={<WeekActions weekId={week.id} status={week.status} />}
      />

      <PageBody>
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="tabular text-[28px] font-semibold leading-8">
                {remaining}{' '}
                <span className="text-[17px] font-medium text-muted-foreground">{remaining === 1 ? 'item' : 'items'} remaining</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {week.trainingDays} training days · {week.restDays} rest days ·{' '}
                {week.inventoryApplied ? 'uses what you already have' : 'ignores your inventory'}
              </p>
            </div>
            <Badge variant={week.status === 'COMPLETED' ? 'success' : 'default'}>{STATUS_LABEL[week.status]}</Badge>
          </div>
          <Progress value={percent} className="h-1.5" indicatorClassName={remaining === 0 ? 'bg-success' : undefined} />
          <Button asChild size="hero">
            <Link href={`/groceries/${week.id}/shop`}>
              <ShoppingBasket className="size-5" />
              Shop
            </Link>
          </Button>
        </Card>

        {week.notes ? (
          <Card className="p-3">
            <p className="whitespace-pre-line text-xs text-muted-foreground">{week.notes}</p>
          </Card>
        ) : null}

        <GroceryList groceryWeekId={week.id} items={week.items as unknown as GroceryItemRow[]} />
      </PageBody>
    </>
  );
}
