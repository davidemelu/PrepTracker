import { scryptSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AFTER_SIGN_IN, safeNextPath } from '@/lib/auth/redirect';
import { hashPassword, needsRehash, verifyPassword, TIMING_DUMMY_HASH } from '@/lib/auth/password';
import {
  clearLoginFailures,
  formatRetryAfter,
  loginRetryAfterMs,
  recordLoginFailure,
} from '@/lib/auth/throttle';

/** scrypt at the parameters used before they were raised, so old hashes can be proved to verify. */
function legacyHash(password: string): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = Buffer.from('legacy-salt-16by');
  const derived = scryptSync(password.normalize('NFKC'), salt, 64, {
    N,
    r,
    p,
    maxmem: 128 * N * r * 2,
  });
  return ['scrypt', N, r, p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

describe('safeNextPath', () => {
  it('keeps a path on this site', () => {
    expect(safeNextPath('/today')).toBe('/today');
    expect(safeNextPath('/plan?x=1')).toBe('/plan?x=1');
    expect(safeNextPath('/prep/week/2026-09-07')).toBe('/prep/week/2026-09-07');
  });

  it('refuses anything that leaves the site', () => {
    expect(safeNextPath('//evil.com')).toBe(DEFAULT_AFTER_SIGN_IN);
    // A browser normalises the backslash to a slash, which makes this
    // protocol-relative and therefore off-site.
    expect(safeNextPath('/\\evil.com')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('http://evil.com')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('https://evil.com/today')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('javascript:alert(1)')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses a loop back to the login screen', () => {
    expect(safeNextPath('/login')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('/login?next=/login')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('falls back when there is nothing to go back to', () => {
    expect(safeNextPath(undefined)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('today')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('drops the fragment, which never reaches the server anyway', () => {
    expect(safeNextPath('/today#meal-2')).toBe('/today');
  });
});

describe('password hashing', () => {
  it('round-trips a password', { timeout: 30_000 }, async () => {
    const stored = await hashPassword('a rather long passphrase');
    expect(stored.startsWith('scrypt$131072$8$1$')).toBe(true);
    expect(await verifyPassword('a rather long passphrase', stored)).toBe(true);
    expect(await verifyPassword('a rather long passphrasf', stored)).toBe(false);
  });

  it('normalises unicode, so the same typed password verifies either way', { timeout: 30_000 }, async () => {
    // U+00E9 and "e" + U+0301 look identical and can come from different keyboards.
    const stored = await hashPassword('café-password');
    expect(await verifyPassword('café-password', stored)).toBe(true);
  });

  it('verifies a hash written with the old parameters', { timeout: 30_000 }, async () => {
    const stored = legacyHash('the old password');
    expect(stored.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(await verifyPassword('the old password', stored)).toBe(true);
    expect(await verifyPassword('the wrong password', stored)).toBe(false);
  });

  it('rejects a hash it cannot read rather than throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$0$8$1$aaaa$bbbb')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$131072$8$1$aaaa$bbbb')).toBe(false);
  });

  it('knows which stored hashes are behind', { timeout: 30_000 }, async () => {
    expect(needsRehash(legacyHash('the old password'))).toBe(true);
    expect(needsRehash(await hashPassword('a current password'))).toBe(false);
    expect(needsRehash('not-a-hash')).toBe(true);
  });

  it('keeps the timing dummy parseable and at the current parameters', () => {
    // needsRehash returns true for anything it cannot parse, so false here is
    // also the proof that the dummy still reads as a hash: were it rejected,
    // an unknown username would return early and its timing would say so.
    expect(needsRehash(TIMING_DUMMY_HASH)).toBe(false);
  });
});

describe('login throttling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows a handful of mistakes, then backs off and doubles', () => {
    const keys = ['user:backoff'];

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      recordLoginFailure(keys);
      expect(loginRetryAfterMs(keys)).toBe(0);
    }

    recordLoginFailure(keys);
    expect(loginRetryAfterMs(keys)).toBe(30_000);

    vi.advanceTimersByTime(30_000);
    expect(loginRetryAfterMs(keys)).toBe(0);

    recordLoginFailure(keys);
    expect(loginRetryAfterMs(keys)).toBe(60_000);

    vi.advanceTimersByTime(60_000);
    recordLoginFailure(keys);
    expect(loginRetryAfterMs(keys)).toBe(120_000);
  });

  it('caps the wait at fifteen minutes', () => {
    const keys = ['user:capped'];
    for (let attempt = 1; attempt <= 20; attempt += 1) recordLoginFailure(keys);
    expect(loginRetryAfterMs(keys)).toBe(15 * 60_000);
  });

  it('takes the longest wait across the keys an attempt is counted against', () => {
    const username = 'user:pair';
    const ip = 'ip:198.51.100.4';

    for (let attempt = 1; attempt <= 5; attempt += 1) recordLoginFailure([username]);
    for (let attempt = 1; attempt <= 7; attempt += 1) recordLoginFailure([ip]);

    expect(loginRetryAfterMs([username])).toBe(30_000);
    expect(loginRetryAfterMs([username, ip])).toBe(120_000);
  });

  it('clears the count on a successful sign-in', () => {
    const keys = ['user:cleared'];
    for (let attempt = 1; attempt <= 6; attempt += 1) recordLoginFailure(keys);
    expect(loginRetryAfterMs(keys)).toBeGreaterThan(0);

    clearLoginFailures(keys);
    expect(loginRetryAfterMs(keys)).toBe(0);

    // And the allowance starts over rather than resuming where it stopped.
    recordLoginFailure(keys);
    expect(loginRetryAfterMs(keys)).toBe(0);
  });

  it('forgets a key nobody has touched for an hour', () => {
    const keys = ['user:forgotten'];
    for (let attempt = 1; attempt <= 5; attempt += 1) recordLoginFailure(keys);
    expect(loginRetryAfterMs(keys)).toBe(30_000);

    vi.advanceTimersByTime(61 * 60_000);
    expect(loginRetryAfterMs(keys)).toBe(0);
  });

  it('says the wait in words', () => {
    expect(formatRetryAfter(1_000)).toBe('1 second');
    expect(formatRetryAfter(30_000)).toBe('30 seconds');
    expect(formatRetryAfter(29_400)).toBe('30 seconds');
    expect(formatRetryAfter(120_000)).toBe('2 minutes');
    expect(formatRetryAfter(15 * 60_000)).toBe('15 minutes');
  });
});
