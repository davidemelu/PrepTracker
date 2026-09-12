import { redirect } from 'next/navigation';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { getSession } from './session';

/**
 * Server-side authorisation helpers.
 *
 * `requireUser` is the single gate every server action and page passes through.
 * It is memoised per request so a page with a dozen queries still only reads the
 * user once.
 */

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string | null;
  mustChangePassword: boolean;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, displayName: true, mustChangePassword: true },
  });

  return user;
});

/** Redirects to the login screen when there is no valid session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * For server actions: throws rather than redirecting, so the caller can return a
 * form error instead of a mid-action navigation.
 */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You are signed out. Sign in again to continue.');
  return user.id;
}
