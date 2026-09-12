import { requireUser } from '@/lib/auth/guards';
import { getFoods } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { FoodsManager } from '@/components/plan/foods-manager';

export const metadata = { title: 'Foods' };
export const dynamic = 'force-dynamic';

export default async function FoodsPage() {
  const user = await requireUser();
  const foods = await getFoods(user.id);

  return (
    <>
      <PageHeader
        title="Foods & nutrition"
        subtitle={`${foods.length} foods`}
        backHref="/plan"
      />
      <PageBody>
        <FoodsManager foods={foods} />
      </PageBody>
    </>
  );
}
