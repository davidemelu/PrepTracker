/**
 * PrepTracker service worker.
 *
 * Hand-written rather than generated, because the caching rules here are
 * specific and worth being able to read:
 *
 *   - Document navigations: network first, falling back to the last copy of
 *     that page, then to /offline. This is what keeps today's plan readable
 *     when the home server is unreachable.
 *   - Build assets (/_next/static/*): cache first. They are content-hashed, so
 *     a cached copy is never stale.
 *   - RSC flight payloads: never touched. See the note above isFlightRequest.
 *   - Everything that mutates (POST, server actions, /api/*): never cached and
 *     never served from cache. Marking a meal eaten must reach the database or
 *     visibly fail.
 *
 * Serving a stale page silently is the failure this file exists to avoid, so
 * every cache fallback is announced twice: the cached copy carries the header
 * named in CACHED_AT_HEADER, and the page is told over postMessage so the
 * banner can say which copy it is looking at.
 */

/*
 * The cache generation comes from the worker's own script URL, which the
 * registrar writes as /sw.js?v=<build id>. The file itself is static and is
 * copied byte-for-byte into the standalone output, so there is nothing in it a
 * build step could stamp; the query string is the one part of the script URL
 * that the client controls, and self.location on a worker is its script URL.
 * A new build therefore registers a new script URL, which both installs a new
 * worker and changes every cache name, so the activate purge below actually
 * deletes the previous generation instead of finding nothing to do.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE = `preptracker-shell-${VERSION}`;
const PAGE_CACHE = `preptracker-pages-${VERSION}`;
const ASSET_CACHE = `preptracker-assets-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, PAGE_CACHE, ASSET_CACHE];

const SHELL_URLS = [
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/** Pages whose last-seen copy is worth keeping for offline reading. */
const CACHEABLE_PATHS = ['/today', '/plan', '/prep', '/groceries', '/more'];

/**
 * How many page copies to keep. Each date, each week and each nested settings
 * screen is its own entry, so without a cap a few months of browsing would
 * leave hundreds of stale documents behind in every generation.
 */
const PAGE_CACHE_LIMIT = 30;

/** Stamped onto a page as it is cached, so the banner can say how old it is. */
const CACHED_AT_HEADER = 'X-PrepTracker-Cached-At';

/**
 * Synthetic cache entry recording the last fallback served. The worker is shut
 * down between events, so module state alone would be gone by the time the
 * restored page asks about it; this survives that.
 */
const FALLBACK_MARKER_URL = '/__preptracker-last-fallback';

/** Mirrors FALLBACK_MARKER_URL so the common case needs no cache read. */
let lastFallback = null;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      // Deliberately no skipWaiting here. A worker that takes over a live page
      // leaves that page running the previous build's JavaScript, and the next
      // tap fails with "Failed to find Server Action". The new worker waits
      // until the user accepts the reload prompt, which posts SKIP_WAITING.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('preptracker-') && !CURRENT_CACHES.includes(key))
          .map((key) => caches.delete(key)),
      );
      // Only reached once the user has accepted the update or every tab has
      // closed, so claiming here cannot strand a page on the old build.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;

  if (data === 'SKIP_WAITING' || (data && data.type === 'skip-waiting')) {
    self.skipWaiting();
    return;
  }

  // A page restored from cache starts running after the response that carried
  // it was already handed over, so it cannot have heard the broadcast below.
  // It asks instead, over a port it supplies.
  if (data && data.type === 'cache-state') {
    const port = event.ports[0];
    if (!port) return;
    event.waitUntil(
      (async () => {
        port.postMessage({ type: 'cache-state', fallback: await readFallbackMarker() });
      })(),
    );
  }
});

function isCacheablePage(url) {
  return CACHEABLE_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
}

/**
 * Next 16 asks for an RSC flight payload with the `rsc` request header and a
 * `_rsc` cache-busting query parameter. Those responses are never cached here,
 * for two reasons that outlive any one Next version.
 *
 * The first is correctness: a flight payload is not a document, and the page
 * fallback below matches on pathname alone, so a cached payload could be
 * handed to a document navigation. Next 16.3 does still send
 * `Vary: rsc, next-router-state-tree, …` (see setVaryHeader in
 * next/dist/server/base-server.js), which the Cache API would honour, but the
 * `_rsc` value is a hash of the router state rather than a stable key, so
 * correctness would rest entirely on that Vary matching being implemented the
 * same way in every browser we run on.
 *
 * The second is usefulness: a payload references the chunk names of the build
 * that produced it, so a stale one is worse than no answer. When the fetch
 * fails, Next's router falls back to a full document navigation, which lands
 * on the cached page below — the outcome we actually want.
 */
function isFlightRequest(request, url) {
  return request.headers.has('rsc') || url.searchParams.has('_rsc');
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

  if (isFlightRequest(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, request, url));
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

/*
 * Reached the proxy but not the application. A reverse proxy in front of the
 * container answers one of these when the container is down, which is the same
 * outage as a refused connection and has to be treated the same way. The list is
 * deliberately narrow: Next renders its own error page with a 500, and
 * swallowing that would hide a real fault behind a stale copy of the day.
 */
const GATEWAY_STATUSES = [502, 503, 504];

async function networkFirst(event, request, url) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);

    // A session that expired mid-navigation answers 200 from /login after a
    // redirect the browser has already followed. Caching that would pin the
    // login page under /today, and returning a redirected response from a
    // fetch handler is itself a TypeError, so the flag has to be tested and
    // not merely mentioned.
    if (response.ok && response.type === 'basic' && !response.redirected && isCacheablePage(url)) {
      event.waitUntil(storePage(cache, request, response.clone()));
    }

    if (GATEWAY_STATUSES.includes(response.status)) {
      const cached = await matchCachedPage(cache, request, url);
      if (cached) {
        event.waitUntil(announceFallback(url, cached));
        return cached;
      }
    }

    if (response.ok) event.waitUntil(clearFallbackMarker());
    return response;
  } catch {
    const cached = await matchCachedPage(cache, request, url);

    if (cached) {
      event.waitUntil(announceFallback(url, cached));
      return cached;
    }

    const shell = await caches.open(SHELL_CACHE);
    const offline = await shell.match('/offline');
    if (offline) return offline;

    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title><body style="font-family:system-ui;padding:2rem">PrepTracker is offline and this page has not been loaded before.</body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function matchCachedPage(cache, request, url) {
  const exact = await cache.match(request);
  if (exact) return exact;

  // Safe now that only document navigations reach this cache: a request for
  // /today?date=2026-09-12 falls back to the last copy of /today rather than to
  // nothing.
  return cache.match(url.pathname, { ignoreSearch: true });
}

/**
 * Stores a page with the time it was taken. The `date` header would nearly do,
 * but it is the server's clock and is missing altogether behind some proxies,
 * and the banner has to be able to say "as it was at 14:02" in the phone's own
 * terms.
 */
async function storePage(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, new Date().toISOString());
  const body = await response.blob();
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
  await trimCache(cache, PAGE_CACHE_LIMIT);
}

/**
 * Drops the oldest entries once the cache is over its limit. Cache.put keeps a
 * replaced entry in its original position, so this is insertion order rather
 * than true least-recently-used; for a cap measured in dozens of pages the
 * difference is not worth a second store to track reads in.
 */
async function trimCache(cache, limit) {
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function announceFallback(url, cached) {
  const fallback = {
    url: url.href,
    path: url.pathname,
    cachedAt: cached.headers.get(CACHED_AT_HEADER) ?? cached.headers.get('date'),
  };

  lastFallback = fallback;
  await writeFallbackMarker(fallback);

  // includeUncontrolled so the page this response is about is reached even
  // before it becomes controlled.
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'served-from-cache', ...fallback });
  }
}

async function writeFallbackMarker(fallback) {
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(
    FALLBACK_MARKER_URL,
    new Response(JSON.stringify(fallback), { headers: { 'Content-Type': 'application/json' } }),
  );
}

async function readFallbackMarker() {
  if (lastFallback) return lastFallback;
  try {
    const cache = await caches.open(SHELL_CACHE);
    const stored = await cache.match(FALLBACK_MARKER_URL);
    if (!stored) return null;
    lastFallback = await stored.json();
    return lastFallback;
  } catch {
    return null;
  }
}

async function clearFallbackMarker() {
  lastFallback = null;
  const cache = await caches.open(SHELL_CACHE);
  await cache.delete(FALLBACK_MARKER_URL);
}
