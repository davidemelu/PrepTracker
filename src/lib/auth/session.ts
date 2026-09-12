import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Session handling.
 *
 * A signed JWT in an httpOnly cookie. No database round-trip to read a session,
 * no third-party identity provider, and nothing leaves the machine. The shape
 * is deliberately small so swapping in Auth.js later only means replacing this
 * file and `getCurrentUser`.
 */

export const SESSION_COOKIE = 'preptracker_session';
const SESSION_DAYS = 30;
const ISSUER = 'preptracker';

export interface SessionPayload {
  userId: string;
  username: string;
  /**
   * The `User.sessionVersion` the token was issued against. `getCurrentUser`
   * compares it with the row on every request, which is what makes a password
   * change able to end sessions it does not hold the cookie for.
   */
  sessionVersion: number;
}

/**
 * Secrets that ship in the repository and are therefore public. An install that
 * copied `.env.example` or inherited the Docker build argument would sign its
 * cookies with a key anyone can read, and the length check alone waves both
 * through: the example secret is 51 characters.
 */
const PLACEHOLDER_SECRETS = new Set([
  // .env.example
  'change-me-to-a-long-random-string-at-least-32-chars',
  // Dockerfile, builder stage
  'build-time-placeholder-secret-value-000000',
]);

const MIN_SECRET_LENGTH = 32;
const MIN_DISTINCT_CHARACTERS = 16;
const GENERATE_HINT = 'Generate one with: openssl rand -base64 32';

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters. ${GENERATE_HINT}`,
    );
  }
  if (PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error(
      `AUTH_SECRET is still the example value, which is published in this repository and so is known to everyone. ${GENERATE_HINT}`,
    );
  }
  // Counting distinct characters is a crude stand-in for entropy, but it is
  // enough to catch a repeated word or a row of zeroes typed to satisfy the
  // length check. A base64 secret of this length has far more than sixteen.
  if (new Set(secret).size < MIN_DISTINCT_CHARACTERS) {
    throw new Error(
      `AUTH_SECRET uses too few distinct characters to be random. ${GENERATE_HINT}`,
    );
  }

  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ username: payload.username, sessionVersion: payload.sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER });
    if (!payload.sub || typeof payload.username !== 'string') return null;

    // Tokens minted before the claim existed carry no `sessionVersion` at all.
    // Reading a missing claim as 0 — the default every existing row has — keeps
    // those sessions signed in across the deploy rather than logging the
    // household out; the first password change moves the row past 0 and the old
    // tokens stop verifying then.
    const sessionVersion =
      typeof payload.sessionVersion === 'number' && Number.isInteger(payload.sessionVersion)
        ? payload.sessionVersion
        : 0;

    return { userId: payload.sub, username: payload.username, sessionVersion };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Home-lab installs are routinely reached over plain HTTP on the LAN, so
    // the Secure flag follows an explicit setting rather than being forced.
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
