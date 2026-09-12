'use client';

import { useEffect } from 'react';

/**
 * Service worker lifecycle.
 *
 * In production: registers the worker after the page is interactive, and
 * activates a waiting update immediately so a deployed change is never one
 * refresh behind.
 *
 * In development: actively *unregisters* any worker and deletes its caches.
 * That matters because a service worker outlives the build that installed it.
 * If you have ever opened a production build on an origin — a LAN address, a
 * Tailscale name — and later serve a dev build from that same origin, the old
 * worker keeps handing the browser production assets. The symptom is baffling:
 * the page looks right but every form fails with "Failed to find Server
 * Action", because the cached bundle is calling into a build the server no
 * longer has.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void cleanUpInDevelopment();
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          // Take a waiting update straight away rather than waiting for every
          // tab to close.
          if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');

          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                installing.postMessage('SKIP_WAITING');
              }
            });
          });
        })
        .catch(() => {
          // A failed registration must never break the app; offline support is
          // simply unavailable in that session.
        });
    };

    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}

async function cleanUpInDevelopment() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) return;

    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('preptracker-')).map((key) => caches.delete(key)),
      );
    }

    console.info(
      '[PrepTracker] Removed a service worker left over from a production build on this origin. Reload once to finish clearing it.',
    );
  } catch {
    // Nothing to do: the worker will be replaced on the next production load.
  }
}
