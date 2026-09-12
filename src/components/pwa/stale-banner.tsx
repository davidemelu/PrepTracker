'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { CloudOff, RotateCw } from 'lucide-react';

/** What the service worker tells us about a page it restored from its cache. */
interface CacheFallback {
  path: string;
  /** ISO timestamp taken when the copy was stored, or null if it is unknown. */
  cachedAt: string | null;
}

/**
 * The strip above the bottom navigation, shared by every connection message.
 *
 * It is fixed rather than in flow so no screen has to leave room for it, and it
 * clears the home indicator by sitting on top of the navigation's own height.
 */
export function BannerBar({
  icon: Icon,
  tone = 'warning',
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: 'warning' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={
        tone === 'warning'
          ? 'fixed inset-x-0 z-40 flex items-center justify-center gap-2 border-t border-warning/40 bg-warning/12 px-4 py-1.5 text-sm font-medium text-warning backdrop-blur-sm'
          : 'fixed inset-x-0 z-40 flex items-center justify-center gap-2 border-t border-border bg-card/95 px-4 py-1.5 text-sm font-medium backdrop-blur-sm'
      }
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </div>
  );
}

/** Reads well in a sentence: "showing Today as it was at 14:02". */
const PAGE_NAMES: Record<string, string> = {
  '/today': 'Today',
  '/plan': 'your plan',
  '/prep': 'Prep',
  '/groceries': 'your groceries',
  '/more': 'More',
};

function pageName(path: string): string {
  for (const [prefix, name] of Object.entries(PAGE_NAMES)) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return name;
  }
  return 'this page';
}

function isCacheFallback(value: unknown): value is CacheFallback {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === 'string' &&
    (candidate.cachedAt === null || typeof candidate.cachedAt === 'string')
  );
}

/**
 * Says so when the page on screen came out of the service worker's cache
 * because the server could not be reached.
 *
 * This is the failure that matters for a self-hosted app: the phone has signal,
 * so nothing in the browser looks wrong, but the home server is down and the
 * worker has quietly served yesterday's Today. Without this the only clue is
 * that nothing ever changes.
 *
 * Retry is not a convenience. globals.css disables pull-to-refresh
 * (overscroll-behavior-y), and in standalone mode there is no address bar, so
 * this button is the only way to ask for a fresh copy.
 */
export function StaleBanner() {
  const [fallback, setFallback] = useState<CacheFallback | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    const accept = (value: unknown) => {
      if (cancelled || !isCacheFallback(value)) return;
      if (value.path !== window.location.pathname) return;
      setFallback(value);
    };

    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null) return;
      if ((data as { type?: unknown }).type !== 'served-from-cache') return;
      accept(data);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);

    /*
     * A page that was itself restored from cache started running after the
     * worker had already broadcast, so it has to ask. The reply comes back over
     * a private port rather than the shared channel so that other tabs, which
     * may be showing a different page, are not woken for it.
     */
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent) => {
        const data: unknown = event.data;
        if (typeof data !== 'object' || data === null) return;
        accept((data as { fallback?: unknown }).fallback);
      };
      controller.postMessage({ type: 'cache-state' }, [channel.port2]);
    }

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  if (!fallback) return null;

  const stamp = fallback.cachedAt ? new Date(fallback.cachedAt) : null;
  const at =
    stamp && !Number.isNaN(stamp.getTime())
      ? ` as it was at ${stamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
      : ' from an earlier visit';

  return (
    <BannerBar icon={CloudOff}>
      <span className="min-w-0 truncate">
        Server unreachable · showing {pageName(fallback.path)}
        {at}
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="-my-1.5 flex h-11 shrink-0 items-center gap-1.5 px-2 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RotateCw className="size-4" aria-hidden />
        Retry
      </button>
    </BannerBar>
  );
}
