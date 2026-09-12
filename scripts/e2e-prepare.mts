/**
 * Prepares the end-to-end database: drop, create, migrate, seed.
 *
 * Run as part of Playwright's `webServer.command` rather than from
 * `globalSetup`, because Playwright starts the web server first — a server that
 * boots against a database that does not exist yet would never become healthy.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

export const E2E_USERNAME = 'admin';
export const E2E_PASSWORD = 'e2e-password';

export function e2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL or E2E_DATABASE_URL must be set to run E2E tests.');
  const url = new URL(base);
  url.pathname = '/preptracker_e2e';
  return url.toString();
}

async function main() {
  const url = e2eDatabaseUrl();
  const databaseName = new URL(url).pathname.replace(/^\//, '').split('?')[0]!;

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();

  // Recreate from scratch so every run starts from the same known state.
  await admin.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [databaseName],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();

  const env = {
    ...process.env,
    DATABASE_URL: url,
    ADMIN_USERNAME: E2E_USERNAME,
    ADMIN_PASSWORD: E2E_PASSWORD,
    AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-secret-value-that-is-long-enough-000',
  };
  const options = { stdio: 'inherit' as const, shell: process.platform === 'win32', env };

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], options);
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], options);

  assembleStandalone();

  console.log(`E2E database ready: ${databaseName}`);
}

/**
 * `next build` writes a standalone server but leaves static assets outside it,
 * exactly as the Dockerfile expects. Copying them in lets the E2E run exercise
 * the same server a deployed install runs, rather than `next start`, which does
 * not support standalone output.
 */
function assembleStandalone() {
  const standalone = path.join(process.cwd(), '.next', 'standalone');
  if (!existsSync(standalone)) {
    throw new Error('No standalone build found. Run `npm run build` before the E2E tests.');
  }

  cpSync(path.join(process.cwd(), '.next', 'static'), path.join(standalone, '.next', 'static'), {
    recursive: true,
  });
  cpSync(path.join(process.cwd(), 'public'), path.join(standalone, 'public'), { recursive: true });
}

main().catch((error) => {
  console.error('E2E preparation failed:', error);
  process.exit(1);
});
