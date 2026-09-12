'use client';

import { useEffect } from 'react';
import { ErrorScreen } from '@/components/layout/error-screen';

/**
 * The boundary for every signed-in route.
 *
 * Without one, any failure — a dropped connection during a server action, the
 * database refusing a connection, a render that throws — replaced the whole app
 * with the framework's default error page: no navigation, no way back, and no
 * hint that trying again might work. On a phone in a kitchen that is the worst
 * possible moment for a dead end.
 *
 * The message deliberately does not repeat the error. It is almost always the
 * home server being unreachable, and the details are on the server, where
 * `runAction` logs them.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[route]', {
      name: error.name,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <ErrorScreen
      title="This screen could not load"
      description="PrepTracker could not reach the server, or something went wrong while building the page. Nothing you had saved is affected."
      onRetry={reset}
      digest={error.digest}
    />
  );
}
