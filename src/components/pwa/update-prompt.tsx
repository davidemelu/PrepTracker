'use client';

import { RefreshCw } from 'lucide-react';

/**
 * Offers a reload when a new build has been installed in the background.
 *
 * It asks rather than acting because the page it is sitting on may have a half
 * written note or an open sheet, and because a reload is the only safe way to
 * take an update: a page whose JavaScript came from the previous build cannot
 * call the new build's server actions.
 *
 * It shares the strip above the bottom navigation with the offline banner. The
 * two cannot honestly appear together — a new worker can only have been
 * installed by a server that was reachable a moment ago.
 */
export function UpdatePrompt({ onReload }: { onReload: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 z-40 flex items-center justify-center gap-3 border-t border-border bg-card/95 px-4 py-1.5 text-sm backdrop-blur-sm"
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
    >
      <span className="font-medium">A new version is ready</span>
      <button
        type="button"
        onClick={onReload}
        className="flex h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RefreshCw className="size-4" aria-hidden />
        Reload
      </button>
    </div>
  );
}
