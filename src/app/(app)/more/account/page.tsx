import { requireUser } from '@/lib/auth/guards';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { AccountManager } from '@/components/more/account-manager';

export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Account" subtitle={user.username} backHref="/more" />
      <PageBody>
        <AccountManager
          username={user.username}
          displayName={user.displayName}
          mustChangePassword={user.mustChangePassword}
        />
      </PageBody>
    </>
  );
}
