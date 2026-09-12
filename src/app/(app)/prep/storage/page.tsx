import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { fromDbDate, todayKey } from '@/lib/domain/dates';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { StorageManager, type PortionRow } from '@/components/prep/storage-manager';

export const metadata = { title: 'Storage' };
export const dynamic = 'force-dynamic';

export default async function StoragePage() {
  const user = await requireUser();
  const today = todayKey();

  const portions = await prisma.storagePortion.findMany({
    where: { userId: user.id, status: { notIn: ['CONSUMED', 'DISCARDED'] } },
    orderBy: { prepDate: 'asc' },
  });

  const rows: PortionRow[] = portions.map((p) => ({
    id: p.id,
    label: p.label,
    portions: p.portions,
    portionSizeG: p.portionSizeG,
    location: p.location,
    status: p.status,
    prepDate: fromDbDate(p.prepDate),
    thawOn: p.thawOn ? fromDbDate(p.thawOn) : null,
    useByDate: p.useByDate ? fromDbDate(p.useByDate) : null,
    notes: p.notes,
  }));

  return (
    <>
      <PageHeader title="Storage" subtitle="Fridge, freezer and thawing" backHref="/prep" />
      <PageBody>
        <StorageManager portions={rows} today={today} />
      </PageBody>
    </>
  );
}
