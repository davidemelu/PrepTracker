'use client';

import { useEffect } from 'react';

/**
 * The last resort: a failure in the root layout itself, which replaces the whole
 * document and therefore cannot use any of the app's own chrome, providers or
 * styles. Everything here is inline on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global]', { name: error.name, digest: error.digest, stack: error.stack });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#fafcff',
          color: '#16181d',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>PrepTracker could not start</h1>
        <p style={{ margin: 0, maxWidth: '32rem', color: '#4b5158' }}>
          Something failed before the app could render. Your data is not affected. If reloading
          does not help, check that the server and database are running.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: '44px',
            padding: '0 1.25rem',
            borderRadius: '999px',
            border: 'none',
            background: '#3a5cd6',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
