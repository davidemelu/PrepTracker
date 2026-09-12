import { requireUser } from '@/lib/auth/guards';
import { getActivePlan, getSupplements } from '@/lib/queries/plan';
import type { SupplementTimingKey } from '@/lib/domain/materialise';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { SupplementsManager, type SupplementRow } from '@/components/plan/supplements-manager';

export const metadata = { title: 'Supplements' };
export const dynamic = 'force-dynamic';

export default async function SupplementsPage() {
  const user = await requireUser();
  const [supplements, plan] = await Promise.all([getSupplements(user.id), getActivePlan(user.id)]);

  const rows: SupplementRow[] = supplements.map((supplement) => {
    const schedule = supplement.schedules[0];
    return {
      id: supplement.id,
      name: supplement.name,
      dosageAmount: supplement.dosageAmount,
      dosageUnit: supplement.dosageUnit,
      countPerDose: supplement.countPerDose,
      form: supplement.form,
      notes: supplement.notes,
      active: supplement.active,
      timing: (schedule?.timing ?? 'ANYTIME') as SupplementTimingKey,
      applicability: schedule?.applicability ?? 'EVERY_DAY',
      mealId: schedule?.mealId ?? null,
      mealName: schedule?.meal?.name ?? null,
      timeOfDay: schedule?.timeOfDay ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Supplements"
        subtitle={`${rows.filter((r) => r.active).length} active`}
        backHref="/plan"
      />
      <PageBody>
        <SupplementsManager
          supplements={rows}
          meals={(plan?.meals ?? []).map((m) => ({ id: m.id, name: m.name }))}
        />
      </PageBody>
    </>
  );
}
