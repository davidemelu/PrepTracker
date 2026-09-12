import { redirect } from 'next/navigation';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { UserFacingError } from '@/lib/errors';
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
  /**
   * Advisory only: it puts a prompt on the More screen and nothing refuses to
   * work while it is true. The account it applies to is the one the seed
   * created with a known password, and the owner of the machine is the only
   * person who can reach it, so nagging is the whole intent. Treat it as a
   * reminder, not an authorisation decision.
   */
  mustChangePassword: boolean;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      mustChangePassword: true,
      sessionVersion: true,
    },
  });
  if (!user) return null;

  // A password change bumps the row, so every token signed before it — on a
  // phone that has since been lost, or in a browser left signed in somewhere —
  // stops resolving to a user here. This is the whole revocation mechanism:
  // the token itself stays cryptographically valid until it expires.
  if (user.sessionVersion !== session.sessionVersion) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    mustChangePassword: user.mustChangePassword,
  };
});

/** Redirects to the login screen when there is no valid session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * For server actions: throws rather than redirecting, so the caller can return a
 * form error instead of a mid-action navigation. The sentence is written for the
 * user, so it is a `UserFacingError` and `runAction` passes it through.
 */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UserFacingError('You are signed out. Sign in again to continue.');
  return user.id;
}
