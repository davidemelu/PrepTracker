import path from 'node:path';
import { beforeAll } from 'vitest';

/**
 * Points the application's Prisma client at the test database before any
 * application module is imported. `src/lib/db.ts` reads DATABASE_URL when it
 * first creates the client, so this must run first — which is why it is a
 * setupFile rather than an import inside a test.
 */

for (const file of ['.env.test', '.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

if (!process.env.TEST_DATABASE_URL && process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/preptracker_test';
  process.env.TEST_DATABASE_URL = url.toString();
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.AUTH_SECRET ??= 'integration-tests-secret-value-0123456789';
// NODE_ENV is set by Vitest itself; assigning it here is both unnecessary and
// disallowed by the Node type definitions.

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set; integration tests cannot run.');
  }
});
