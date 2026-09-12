import { redirect } from 'next/navigation';
import { UtensilsCrossed } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/guards';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/today');

  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">PrepTracker</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Meals, prep, supplements and groceries in one place.
            </p>
          </div>
        </div>

        <LoginForm next={next} />
      </div>
    </div>
  );
}
