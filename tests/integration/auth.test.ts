import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, resetDatabase, testPrisma, type Fixture } from './helpers';

/**
 * Session revocation.
 *
 * A signed token is valid until it expires, so the only way to end a session
 * that someone else is holding is to make the server stop accepting it.
 * `User.sessionVersion` is that mechanism: a password change moves the row on,
 * and every token signed against the previous value stops resolving to a user.
 *
 * The cookie store is faked because these run under Vitest rather than a
 * request, but the token is really signed and really verified.
 */

const session = vi.hoisted(() => ({ userId: '' }));
const cookieStore = vi.hoisted(() => ({ value: null as string | null }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'preptracker_session' && cookieStore.value
        ? { name, value: cookieStore.value }
        : undefined,
    set: (name: string, value: string) => {
      if (name === 'preptracker_session') cookieStore.value = value;
    },
    delete: () => {
      cookieStore.value = null;
    },
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

vi.mock('@/lib/auth/guards', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/guards')>('@/lib/auth/guards');
  return {
    ...actual,
    getCurrentUser: async () => ({
      id: session.userId,
      username: 'tester',
      displayName: null,
      mustChangePassword: false,
    }),
  };
});

let fixture: Fixture;
let auth: typeof import('@/lib/actions/auth');
let sessions: typeof import('@/lib/auth/session');

beforeAll(async () => {
  auth = await import('@/lib/actions/auth');
  sessions = await import('@/lib/auth/session');
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
  session.userId = fixture.userId;
  cookieStore.value = null;
});

describe('changePassword', () => {
  it('moves the account past every token signed before it', async () => {
    const prisma = testPrisma();

    const before = await prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    expect(before.sessionVersion).toBe(0);

    // The token a second device is holding.
    const oldToken = await sessions.createSessionToken({
      userId: fixture.userId,
      username: before.username,
      sessionVersion: before.sessionVersion,
    });
    const oldPayload = await sessions.verifySessionToken(oldToken);
    expect(oldPayload?.sessionVersion).toBe(0);

    const result = await auth.changePassword(null, formOf({
      currentPassword: 'test-password',
      newPassword: 'a-much-longer-password',
      confirmPassword: 'a-much-longer-password',
    }));
    expect(result.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    expect(after.sessionVersion).toBe(1);

    // The old token still verifies cryptographically — nothing can un-sign it —
    // but it no longer matches the row, which is what getCurrentUser compares.
    const stillValid = await sessions.verifySessionToken(oldToken);
    expect(stillValid).not.toBeNull();
    expect(stillValid!.sessionVersion).not.toBe(after.sessionVersion);

    // The browser that made the change was handed a cookie at the new version,
    // so it stays signed in.
    const reissued = await sessions.verifySessionToken(cookieStore.value!);
    expect(reissued?.sessionVersion).toBe(after.sessionVersion);
  });

  it('refuses a wrong current password and leaves the version alone', async () => {
    const result = await auth.changePassword(null, formOf({
      currentPassword: 'not-the-password',
      newPassword: 'a-much-longer-password',
      confirmPassword: 'a-much-longer-password',
    }));

    expect(result.ok).toBe(false);
    const after = await testPrisma().user.findUniqueOrThrow({ where: { id: fixture.userId } });
    expect(after.sessionVersion).toBe(0);
  });
});

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}
