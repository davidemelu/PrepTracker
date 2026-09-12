import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';

/**
 * Creates a dedicated test database and applies migrations to it once per run.
 *
 * Deliberately a separate database from development: integration tests truncate
 * every table between cases, and doing that to a database holding real meal
 * history would be unforgivable.
 */

for (const file of ['.env.test', '.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'Integration tests need TEST_DATABASE_URL or DATABASE_URL. Start the dev database with: docker compose -f docker-compose.dev.yml up -d',
    );
  }

  const url = new URL(base);
  url.pathname = '/preptracker_test';
  return url.toString();
}

export default async function globalSetup() {
  const url = testDatabaseUrl();
  process.env.TEST_DATABASE_URL = url;

  const parsed = new URL(url);
  const databaseName = parsed.pathname.replace(/^\//, '').split('?')[0]!;

  // Connect to the maintenance database to create the test database if needed.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Could not reach Postgres for integration tests (${adminUrl.host}). Start it with: docker compose -f docker-compose.dev.yml up -d\n${String(error)}`,
    );
  }

  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (existing.rowCount === 0) {
    // Identifier is derived from our own URL, never user input.
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  }
  await admin.end();

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: url },
  });
}
