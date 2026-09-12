import { requireUser } from '@/lib/auth/guards';
import { getAllPlans } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { PlansManager } from '@/components/plan/plans-manager';

export const metadata = { title: 'Meal plans' };
export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const user = await requireUser();
  const plans = await getAllPlans(user.id);

  return (
    <>
      <PageHeader title="Meal plans" subtitle="One plan is active at a time" backHref="/plan" />
      <PageBody>
        <PlansManager
          plans={plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            isActive: plan.isActive,
            mealCount: plan._count.meals,
          }))}
        />
      </PageBody>
    </>
  );
}
