'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/**
 * Says so when the phone has no connection. Without it the service worker's
 * cached copy of a page is indistinguishable from a live one, and a "saved"
 * that never reached the server looks like a save.
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

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-40 flex items-center justify-center gap-2 border-t border-warning/40 bg-warning/12 px-4 py-2 text-sm font-medium text-warning backdrop-blur-sm"
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      Offline · showing your last synced plan. Changes will not save until you reconnect.
    </div>
  );
}
