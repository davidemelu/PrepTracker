'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UpdatePrompt } from '@/components/pwa/update-prompt';

/** Inlined by next.config.ts; see the BUILD_ID comment there. */
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

/**
 * Service worker lifecycle.
 *
 * In production: registers the worker after the page is interactive, then
 * leaves a newly installed worker waiting and offers a reload instead of
 * letting it take over. A worker that claims a live page leaves that page
 * running the previous build's JavaScript, and the next tap fails with "Failed
 * to find Server Action" — the project's own troubleshooting entry. Waiting
 * costs one prompt; taking over costs the user their next action.
 *
 * The script is registered as /sw.js?v=<build id> so that a deployment changes
 * the script URL. That is what makes the browser install the new worker at all
 * (the file's bytes never change) and what gives the worker its cache
 * generation; see the comment above VERSION in public/sw.js.
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
  const [updateReady, setUpdateReady] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void cleanUpInDevelopment();
      return;
    }

    let cancelled = false;

    const offerUpdate = (worker: ServiceWorker | null) => {
      if (cancelled) return;
      waitingRef.current = worker;
      setUpdateReady(true);
    };

    /**
     * The controller only changes under this page when another tab accepted an
     * update, or when the reload below asked for one. Either way the page is
     * now out of step with the worker, so it reloads if it asked and offers to
     * reload if it did not.
     */
    const onControllerChange = () => {
      if (reloadingRef.current) {
        window.location.reload();
        return;
      }
      offerUpdate(null);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = () => {
      navigator.serviceWorker
        .register(`/sw.js?v=${BUILD_ID}`, { scope: '/' })
        .then((registration) => {
          if (cancelled) return;

          // A worker only waits when one is already in control, so this cannot
          // fire on a first visit.
          if (registration.waiting && navigator.serviceWorker.controller) {
            offerUpdate(registration.waiting);
          }

          const track = (worker: ServiceWorker) => {
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                offerUpdate(worker);
              }
            });
          };

          if (registration.installing) track(registration.installing);
          registration.addEventListener('updatefound', () => {
            if (registration.installing) track(registration.installing);
          });
        })
        .catch(() => {
          // A failed registration must never break the app; offline support is
          // simply unavailable in that session.
        });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('load', register);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    reloadingRef.current = true;
    const waiting = waitingRef.current;

    if (!waiting) {
      window.location.reload();
      return;
    }

    waiting.postMessage({ type: 'skip-waiting' });
    // controllerchange normally arrives within a few hundred milliseconds and
    // reloads for us. If the worker fails to activate, reloading anyway is
    // still the right answer: the user asked for fresh code.
    window.setTimeout(() => window.location.reload(), 2000);
  }, []);

  if (!updateReady) return null;
  return <UpdatePrompt onReload={applyUpdate} />;
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
