'use client';

import { useEffect, useRef } from 'react';
import type { Reminder } from '@/lib/domain/reminders';

/**
 * Foreground browser notifications for reminders you are already opted into.
 *
 * Deliberately modest about what it can do: this only fires while a PrepTracker
 * tab is open. Real background reminders need Web Push, a VAPID key pair and a
 * server-side scheduler — which is why `lib/domain/reminders.ts` returns plain
 * descriptors rather than rendering anything. The same descriptors would drive
 * a push transport unchanged.
 *
 * Never asks for permission on its own; the switch in Settings does that.
 */
export function ReminderNotifier({
  reminders,
  enabled,
}: {
  reminders: Reminder[];
  enabled: boolean;
}) {
  // Notify once per reminder per page load, not on every re-render.
  const notified = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;

    // Only things that are actually late are worth interrupting for.
    const urgent = reminders.filter((r) => r.severity === 'overdue');

    for (const reminder of urgent) {
      if (notified.current.has(reminder.id)) continue;
      notified.current.add(reminder.id);

      try {
        new Notification(reminder.title, {
          body: reminder.body,
          tag: reminder.id,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        });
      } catch {
        // Some browsers only allow notifications from a service worker
        // registration. Falling back silently is fine: the in-app banner on the
        // Today screen has already shown the same reminder.
      }
    }
  }, [reminders, enabled]);

  return null;
}
