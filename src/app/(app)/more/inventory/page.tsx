import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { fromDbDate } from '@/lib/domain/dates';
import { getFoodPickerOptions } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { InventoryManager, type InventoryRow } from '@/components/more/inventory-manager';

export const metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const user = await requireUser();

  const [items, foods] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { userId: user.id }, orderBy: { name: 'asc' } }),
    getFoodPickerOptions(user.id),
  ]);

  const rows: InventoryRow[] = items.map((item) => ({
    id: item.id,
    foodId: item.foodId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    lowStockThreshold: item.lowStockThreshold,
    expiresOn: item.expiresOn ? fromDbDate(item.expiresOn) : null,
    notes: item.notes,
  }));

  return (
    <>
      <PageHeader title="Inventory" subtitle={`${rows.length} items`} backHref="/more" />
      <PageBody>
        <InventoryManager
          items={rows}
          foods={foods.map((f) => ({ id: f.id, name: f.name, defaultUnit: f.defaultUnit }))}
        />
      </PageBody>
    </>
  );
}
