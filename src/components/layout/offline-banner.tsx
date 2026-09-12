'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { BannerBar, StaleBanner } from '@/components/pwa/stale-banner';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/**
 * Says so when the app is not showing live data.
 *
 * There are two ways for that to happen and they need different words.
 * `navigator.onLine` covers the obvious one, the phone with no connection. The
 * one that actually bites a self-hosted app is the other: full signal, but the
 * home server is down, so the service worker hands over its last copy and a
 * stale Today looks exactly like a current one. StaleBanner handles that case
 * and carries the Retry control.
 *
 * Sits just above the bottom navigation so it is visible on every screen
 * without any header arithmetic.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (!online) {
    return (
      <BannerBar icon={WifiOff}>
        Offline · showing your last synced plan. Changes will not save until you reconnect.
      </BannerBar>
    );
  }

  return <StaleBanner />;
}
