/**
 * Where to send someone after they sign in.
 *
 * The login form carries the page the middleware bounced them from in a `next`
 * parameter, which is attacker-controllable: anyone can send a link to
 * `/login?next=…`. The guard lives in its own module, free of `next/headers`, so
 * it can be unit tested without a request context.
 */

/** Where sign-in lands when there is no usable `next`. */
export const DEFAULT_AFTER_SIGN_IN = '/today';

// Characters that URL parsing strips or rewrites, so a value containing them
// cannot be judged by what it parses to: the backslash browsers normalise to a
// forward slash, plus C0 controls and DEL.
const UNSAFE_CHARACTERS = /[\\\x00-\x1f\x7f]/;

/**
 * Returns `next` when it is a path on this site, and the default otherwise.
 *
 * Checking `startsWith('/')` is not enough. Browsers normalise a backslash to a
 * forward slash before they resolve a URL, so `/\evil.com` leaves the app for
 * `//evil.com`, which is protocol-relative and therefore off-site. Rather than
 * enumerate the shapes that survive normalisation, resolve the value against a
 * dummy origin and insist the origin did not move: anything absolute, scheme-
 * relative or exotic changes it. Paths under `/login` are refused separately,
 * because bouncing back to the login screen is a loop rather than a destination.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_AFTER_SIGN_IN;
  if (UNSAFE_CHARACTERS.test(next)) return DEFAULT_AFTER_SIGN_IN;
  if (!next.startsWith('/')) return DEFAULT_AFTER_SIGN_IN;

  const base = 'http://localhost';
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }

  if (url.origin !== base) return DEFAULT_AFTER_SIGN_IN;
  // No route other than the login screen itself begins with "/login".
  if (url.pathname.startsWith('/login')) return DEFAULT_AFTER_SIGN_IN;

  // The fragment never reaches the server, so dropping it loses nothing.
  return `${url.pathname}${url.search}`;
}
