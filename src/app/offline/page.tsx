import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Offline' };

/**
 * Shown by the service worker when a page has never been loaded and the server
 * cannot be reached. Deliberately static so it works with no network at all.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <WifiOff className="size-7 text-muted-foreground" />
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">PrepTracker is offline</h1>
        <p className="text-sm text-muted-foreground">
          Your phone cannot reach the server. Pages you have already opened are still readable, but
          anything you change now will not be saved until you reconnect.
        </p>
      </div>

      <Button asChild>
        <Link href="/today">Try today again</Link>
      </Button>
    </div>
  );
}
