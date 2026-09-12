'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkPasswordStrength, hashPassword, verifyPassword } from '@/lib/auth/password';
import { clearSessionCookie, setSessionCookie } from '@/lib/auth/session';
import { getCurrentUser } from '@/lib/auth/guards';
import { fail, ok, runAction, type ActionResult } from './result';

const signInSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username.').max(64),
  password: z.string().min(1, 'Enter your password.').max(200),
  next: z.string().trim().optional(),
});

export async function signIn(_prev: unknown, formData: FormData): Promise<ActionResult<{ next: string }>> {
  return runAction(signInSchema, Object.fromEntries(formData), async (input) => {
    const user = await prisma.user.findUnique({ where: { username: input.username } });

    // Same message and a comparable amount of work either way, so a wrong
    // username cannot be told apart from a wrong password.
    if (!user) {
      await verifyPassword(input.password, 'scrypt$16384$8$1$aaaa$bbbb');
      return fail('Username or password is incorrect.');
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) return fail('Username or password is incorrect.');

    await setSessionCookie({ userId: user.id, username: user.username });

    // Only allow same-origin paths back, never an absolute URL.
    const next = input.next && input.next.startsWith('/') && !input.next.startsWith('//') ? input.next : '/today';
    return ok({ next });
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

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
    });

    return ok(undefined, 'Password updated.');
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
