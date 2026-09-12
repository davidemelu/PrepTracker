import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

/**
 * A cheap presence check only: the cookie's signature is verified server-side by
 * `requireUser` on every page and action, which is also where a session revoked
 * by a password change is caught. This exists so a signed-out phone lands on the
 * login screen instead of a flash of empty dashboard.
 *
 * Next 16 renamed this file convention from `middleware` to `proxy`; the
 * behaviour is unchanged.
 */
const PUBLIC_PATHS = ['/login', '/api/health', '/manifest.webmanifest', '/sw.js', '/offline'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    '/((?!_next/static|_next/image|icons/|favicon.ico|apple-touch-icon.png|robots.txt).*)',
  ],
};
