import { requireUser } from '@/lib/auth/guards';
import { BottomNav } from '@/components/layout/bottom-nav';

/**
 * Every authenticated route lives in this group. The guard runs once here and
 * again inside each action, so a page can never render for a signed-out user.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="min-h-dvh">
      {children}
      <BottomNav />
    </div>
  );
}
