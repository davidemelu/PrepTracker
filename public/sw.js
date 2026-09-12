/**
 * PrepTracker service worker.
 *
 * Hand-written rather than generated, because the caching rules here are
 * specific and worth being able to read:
 *
 *   - Navigations: network first, falling back to the last copy of that page,
 *     then to /offline. This is what keeps today's plan readable when the home
 *     server is unreachable.
 *   - Build assets (/_next/static/*): cache first. They are content-hashed, so
 *     a cached copy is never stale.
 *   - Everything that mutates (POST, server actions, /api/*): never cached and
 *     never served from cache. Marking a meal eaten must reach the database or
 *     visibly fail.
 */

const VERSION = 'v1';
const SHELL_CACHE = `preptracker-shell-${VERSION}`;
const PAGE_CACHE = `preptracker-pages-${VERSION}`;
const ASSET_CACHE = `preptracker-assets-${VERSION}`;

const SHELL_URLS = [
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/** Pages whose last-seen copy is worth keeping for offline reading. */
const CACHEABLE_PATHS = ['/today', '/plan', '/prep', '/groceries', '/more'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('preptracker-') && !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isCacheablePage(url) {
  return CACHEABLE_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GETs. Everything else, including every mutation,
  // goes straight to the network.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Content-hashed build output: safe to serve from cache forever.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Next's RSC payload requests carry this header; treat them like navigations
  // so a client-side route change also works from cache.
  const isNavigation = request.mode === 'navigate' || request.headers.has('RSC');

  if (isNavigation) {
    event.respondWith(networkFirst(request, url));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

async function networkFirst(request, url) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);

    // Never cache a redirect to the login page as if it were the page itself.
    if (response.ok && response.type === 'basic' && isCacheablePage(url)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Fall back to any cached variant of the same path before giving up.
    const samePath = await cache.match(url.pathname, { ignoreSearch: true });
    if (samePath) return samePath;

    const shell = await caches.open(SHELL_CACHE);
    const offline = await shell.match('/offline');
    if (offline) return offline;

    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title><body style="font-family:system-ui;padding:2rem">PrepTracker is offline and this page has not been loaded before.</body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}
