import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { ShoppingMode } from '@/components/groceries/shopping-mode';
import type { GroceryItemRow } from '@/components/groceries/grocery-list';

export const metadata = { title: 'Shopping' };
export const dynamic = 'force-dynamic';

export default async function ShopPage({ params }: { params: Promise<{ weekId: string }> }) {
  const user = await requireUser();
  const { weekId } = await params;

  const week = await prisma.groceryWeek.findFirst({
    where: { id: weekId, userId: user.id },
    include: { items: { orderBy: { name: 'asc' } } },
  });

  if (!week) notFound();

  return (
    <>
      <PageHeader title="Shopping" subtitle={week.name} backHref={`/groceries/${week.id}`} sticky={false} />
      <PageBody>
        <ShoppingMode groceryWeekId={week.id} items={week.items as unknown as GroceryItemRow[]} />
      </PageBody>
    </>
  );
}
