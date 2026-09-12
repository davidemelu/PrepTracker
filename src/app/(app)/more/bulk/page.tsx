import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { BulkManager, type BulkRow } from '@/components/more/bulk-manager';

export const metadata = { title: 'Buy in bulk' };
export const dynamic = 'force-dynamic';

export default async function BulkPage() {
  const user = await requireUser();

  const foods = await prisma.food.findMany({
    where: { userId: user.id, active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, category: true, bulkClass: true },
  });

  return (
    <>
      <PageHeader title="Buy in bulk" subtitle="What is worth stocking up on" backHref="/more" />
      <PageBody>
        <BulkManager foods={foods as unknown as BulkRow[]} />
      </PageBody>
    </>
  );
}
