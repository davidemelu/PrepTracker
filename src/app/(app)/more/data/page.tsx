import { requireUser } from '@/lib/auth/guards';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { DataManager } from '@/components/more/data-manager';

export const metadata = { title: 'Backup & export' };

export default async function DataPage() {
  await requireUser();

  return (
    <>
      <PageHeader title="Backup & export" subtitle="Your data, in formats you own" backHref="/more" />
      <PageBody>
        <DataManager />
      </PageBody>
    </>
  );
}
