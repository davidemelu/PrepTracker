import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { YieldsManager, type YieldRow } from '@/components/prep/yields-manager';

export const metadata = { title: 'Cooking yields' };
export const dynamic = 'force-dynamic';

export default async function YieldsPage() {
  const user = await requireUser();

  const foods = await prisma.food.findMany({
    where: { userId: user.id, tracksYield: true },
    orderBy: { name: 'asc' },
    include: { cookingYields: { orderBy: { recordedAt: 'desc' }, take: 20 } },
  });

  const rows: YieldRow[] = foods.map((food) => ({
    foodId: food.id,
    name: food.name,
    currentYieldPct: food.cookingYieldPct,
    measurements: food.cookingYields.map((y) => ({
      id: y.id,
      yieldPct: y.yieldPct,
      source: y.source,
      rawWeightG: y.rawWeightG,
      cookedWeightG: y.cookedWeightG,
      recordedAt: y.recordedAt.toISOString().slice(0, 10),
    })),
  }));

  return (
    <>
      <PageHeader title="Cooking yields" subtitle="Raw to cooked conversion" backHref="/prep" />
      <PageBody>
        <YieldsManager rows={rows} />
      </PageBody>
    </>
  );
}
