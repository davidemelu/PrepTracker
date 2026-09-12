'use client';

import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorScreenProps {
  title: string;
  description: string;
  /** Next's reset function, when this is rendered by an error boundary. */
  onRetry?: () => void;
  /** Shown in small print so a report can name the failure. */
  digest?: string;
}

/**
 * What a failed screen looks like.
 *
 * Shared by the route error boundaries and the not-found pages so that a
 * failure still looks like the app, keeps a way out, and never leaves a phone
 * in the kitchen with a blank screen and no navigation.
 */
export function ErrorScreen({ title, description, onRetry, digest }: ErrorScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 pb-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-warning/15">
        <AlertTriangle className="size-7 text-warning" aria-hidden />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        {onRetry ? (
          <Button onClick={onRetry} size="block">
            <RotateCw className="size-4" aria-hidden />
            Try again
          </Button>
        ) : null}
        <Button asChild variant={onRetry ? 'outline' : 'default'} size="block">
          <Link href="/today">Back to today</Link>
        </Button>
      </div>

      {digest ? (
        <p className="text-xs text-muted-foreground">
          Reference <code className="font-mono">{digest}</code>
        </p>
      ) : null}
    </div>
  );
}
