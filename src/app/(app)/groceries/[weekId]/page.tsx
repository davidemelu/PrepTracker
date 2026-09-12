import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShoppingBasket } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { fromDbDate } from '@/lib/domain/dates';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { GroceryList, type GroceryItemRow } from '@/components/groceries/grocery-list';
import { WeekActions } from '@/components/groceries/week-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

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
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <>
      <PageHeader
        title={week.name}
        subtitle={`${fromDbDate(week.startDate)} → ${fromDbDate(week.endDate)}`}
        backHref="/groceries"
        action={<WeekActions weekId={week.id} status={week.status} />}
      />

      <PageBody>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {done} of {total} sorted
              </p>
              <p className="text-xs text-muted-foreground">
                {week.trainingDays} training days · {week.restDays} rest days ·{' '}
                {week.inventoryApplied ? 'inventory subtracted' : 'inventory not applied'}
              </p>
            </div>
            <Badge variant={week.status === 'COMPLETED' ? 'success' : 'default'}>
              {week.status.charAt(0) + week.status.slice(1).toLowerCase()}
            </Badge>
          </div>
          <Progress value={percent} className="mt-3 h-2" />
        </Card>

        <Button asChild size="block">
          <Link href={`/groceries/${week.id}/shop`}>
            <ShoppingBasket className="size-5" />
            Start shopping
          </Link>
        </Button>

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
