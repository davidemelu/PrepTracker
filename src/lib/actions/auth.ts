'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  checkPasswordStrength,
  hashPassword,
  needsRehash,
  verifyPassword,
  TIMING_DUMMY_HASH,
} from '@/lib/auth/password';
import { clearSessionCookie, setSessionCookie } from '@/lib/auth/session';
import { getCurrentUser } from '@/lib/auth/guards';
import { safeNextPath } from '@/lib/auth/redirect';
import {
  clearLoginFailures,
  formatRetryAfter,
  loginRetryAfterMs,
  loginThrottleKeys,
  recordLoginFailure,
} from '@/lib/auth/throttle';
import { fail, ok, runAction, type ActionResult } from './result';

const signInSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username.').max(64),
  password: z.string().min(1, 'Enter your password.').max(200),
  next: z.string().trim().optional(),
});

/** One sentence for both halves of a wrong credential, so neither can be probed. */
const INCORRECT_CREDENTIALS = 'Username or password is incorrect.';

export async function signIn(_prev: unknown, formData: FormData): Promise<ActionResult<{ next: string }>> {
  return runAction(signInSchema, Object.fromEntries(formData), async (input) => {
    const throttleKeys = await loginThrottleKeys(input.username);

    // Refused before the account is looked up, so the answer is the same whether
    // or not the username exists.
    const retryAfter = loginRetryAfterMs(throttleKeys);
    if (retryAfter > 0) {
      return fail(`Too many sign-in attempts. Try again in ${formatRetryAfter(retryAfter)}.`);
    }

    const user = await prisma.user.findUnique({ where: { username: input.username } });

    // Same message and a comparable amount of work either way, so a wrong
    // username cannot be told apart from a wrong password.
    if (!user) {
      await verifyPassword(input.password, TIMING_DUMMY_HASH);
      recordLoginFailure(throttleKeys);
      return fail(INCORRECT_CREDENTIALS);
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      recordLoginFailure(throttleKeys);
      return fail(INCORRECT_CREDENTIALS);
    }

    clearLoginFailures(throttleKeys);

    if (needsRehash(user.passwordHash)) {
      // Signing in is the only moment the plaintext exists, so a hash written
      // with weaker parameters is replaced here rather than left until the owner
      // happens to change their password. The upgrade must never keep a correct
      // password out, so a failure is logged and the sign-in continues.
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(input.password) },
        });
      } catch (error) {
        console.error('[auth] could not upgrade the stored password hash', {
          name: error instanceof Error ? error.name : typeof error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    await setSessionCookie({
      userId: user.id,
      username: user.username,
      sessionVersion: user.sessionVersion,
    });

    return ok({ next: safeNextPath(input.next) });
  });
}

export async function signOut(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(1, 'Enter a new password.'),
    confirmPassword: z.string().min(1, 'Confirm the new password.'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The two new passwords do not match.',
    path: ['confirmPassword'],
  });

export async function changePassword(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return runAction(changePasswordSchema, Object.fromEntries(formData), async (input) => {
    const current = await getCurrentUser();
    if (!current) return fail('You are signed out. Sign in again to continue.');

    const user = await prisma.user.findUnique({ where: { id: current.id } });
    if (!user) return fail('Account not found.');

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) return fail('Your current password is incorrect.');

    const strength = checkPasswordStrength(input.newPassword);
    if (!strength.ok) return fail(strength.message ?? 'That password is not strong enough.');

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        mustChangePassword: false,
        // The new hash and the bump are one write, so there is no moment where
        // the password has changed and the old sessions are still good. Every
        // token signed against the previous version now fails the comparison in
        // getCurrentUser: the phone left at a friend's house is signed out.
        sessionVersion: { increment: 1 },
      },
      select: { id: true, username: true, sessionVersion: true },
    });

    // The browser doing the changing keeps its session. Re-issuing the cookie at
    // the new version is the difference between "every other session ended" and
    // "you have been signed out of the screen you are standing on".
    await setSessionCookie({
      userId: updated.id,
      username: updated.username,
      sessionVersion: updated.sessionVersion,
    });

    return ok(undefined, 'Password updated. Any other signed-in device will need the new password.');
  });
}

const profileSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
});

export async function updateProfile(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return runAction(profileSchema, Object.fromEntries(formData), async (input) => {
    const current = await getCurrentUser();
    if (!current) return fail('You are signed out. Sign in again to continue.');

    await prisma.user.update({
      where: { id: current.id },
      data: { displayName: input.displayName || null },
    });
    return ok(undefined, 'Profile updated.');
  });
}
