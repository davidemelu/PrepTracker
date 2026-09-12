import { headers } from 'next/headers';

/**
 * Login throttling.
 *
 * scrypt is the only brake on guessing a password over the network, and one
 * attempt costs a fraction of a second, so a patient script gets thousands of
 * tries a day. This adds a growing delay after a handful of failures.
 *
 * The state is a plain map in the process. That is adequate for what this is —
 * one self-hosted container serving one household — and it is honest about its
 * limits: restarting the app forgets every counter, and a second instance would
 * keep its own. Anything stronger belongs in the database or a reverse proxy,
 * neither of which is worth the machinery here.
 */

/** Failures allowed before the delay starts. */
const FREE_ATTEMPTS = 5;
/** The delay after the first failure past the allowance; it doubles from here. */
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;
/** A key untouched for this long is forgotten, so an honest mistake is not held for ever. */
const FORGET_AFTER_MS = 60 * 60_000;
/**
 * The map is keyed by values a caller chooses — a username and a forwarded IP —
 * so it must not be allowed to grow with them. Well past the number of keys a
 * household produces, and small enough to be irrelevant to memory.
 */
const MAX_TRACKED_KEYS = 1_000;

/** Stands in for the client address when no proxy header is present. */
const UNKNOWN_IP = 'unknown';
/** An IPv6 address in full is 45 characters; anything longer is not an address. */
const MAX_IP_LENGTH = 45;

interface Attempt {
  failures: number;
  lastFailureAt: number;
}

const attempts = new Map<string, Attempt>();

function readEntry(key: string, now: number): Attempt | null {
  const entry = attempts.get(key);
  if (!entry) return null;
  if (now - entry.lastFailureAt > FORGET_AFTER_MS) {
    attempts.delete(key);
    return null;
  }
  return entry;
}

function remember(key: string, entry: Attempt, now: number): void {
  if (!attempts.has(key) && attempts.size >= MAX_TRACKED_KEYS) {
    for (const [candidate, tracked] of attempts) {
      if (now - tracked.lastFailureAt > FORGET_AFTER_MS) attempts.delete(candidate);
    }
    if (attempts.size >= MAX_TRACKED_KEYS) {
      // A Map iterates in insertion order and every write below re-inserts, so
      // the first key is the one touched longest ago.
      const oldest = attempts.keys().next();
      if (!oldest.done) attempts.delete(oldest.value);
    }
  }
  // Delete before setting so the key moves to the end and eviction stays
  // least-recently-used rather than first-seen.
  attempts.delete(key);
  attempts.set(key, entry);
}

function retryAfterFor(entry: Attempt, now: number): number {
  if (entry.failures < FREE_ATTEMPTS) return 0;
  const doublings = Math.min(entry.failures - FREE_ATTEMPTS, 30);
  const delay = Math.min(BASE_DELAY_MS * 2 ** doublings, MAX_DELAY_MS);
  return Math.max(0, entry.lastFailureAt + delay - now);
}

/**
 * The keys a sign-in attempt is counted against: the username, so guessing one
 * password against many accounts is slowed, and the client address, so guessing
 * many passwords from one machine is slowed too.
 *
 * The username is lower-cased because it is compared case-sensitively when
 * looking the account up, and an attacker should not get a fresh allowance by
 * changing the case.
 */
export async function loginThrottleKeys(username: string): Promise<string[]> {
  return [`user:${username.trim().toLowerCase()}`, `ip:${await clientIp()}`];
}

/**
 * The client address as the proxy in front of the app reports it.
 *
 * Both headers are set by whatever sits in front, so they are trustworthy only
 * as far as that proxy is: reached directly, a client can send anything and give
 * itself a fresh key every attempt. That is why the username key exists as well.
 */
async function clientIp(): Promise<string> {
  const list = await headers();

  const forwarded = list.get('x-forwarded-for');
  // A chain of proxies appends, so the client is the first entry.
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first.slice(0, MAX_IP_LENGTH);

  const real = list.get('x-real-ip')?.trim();
  if (real) return real.slice(0, MAX_IP_LENGTH);

  return UNKNOWN_IP;
}

/**
 * Milliseconds the caller must wait before this attempt is allowed, or 0 when it
 * may proceed. The longest wait across the keys wins.
 */
export function loginRetryAfterMs(keys: readonly string[]): number {
  const now = Date.now();
  let longest = 0;
  for (const key of keys) {
    const entry = readEntry(key, now);
    if (entry) longest = Math.max(longest, retryAfterFor(entry, now));
  }
  return longest;
}

/** Counts a failed sign-in against every key. */
export function recordLoginFailure(keys: readonly string[]): void {
  const now = Date.now();
  for (const key of keys) {
    const entry = readEntry(key, now);
    remember(key, { failures: (entry?.failures ?? 0) + 1, lastFailureAt: now }, now);
  }
}

/** Clears every key after a successful sign-in. */
export function clearLoginFailures(keys: readonly string[]): void {
  for (const key of keys) attempts.delete(key);
}

/** A wait in words, for the one message a throttled sign-in is allowed to show. */
export function formatRetryAfter(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 90) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
