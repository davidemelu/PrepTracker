import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Two projects, run separately or together:
 *   unit        — pure domain functions, no database, fast
 *   integration — real Postgres, exercises the service and query layer
 *
 * The integration project creates its own `preptracker_test` database so it can
 * truncate freely without touching development data.
 */

const root = import.meta.dirname;

const alias = {
  '@': path.resolve(root, 'src'),
  // `server-only` throws when resolved outside a React Server Component graph.
  // Under Vitest we are already running on the server, so it is a no-op.
  'server-only': path.resolve(root, 'tests/stubs/server-only.ts'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          // Integration tests share one database, so they must not interleave.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
