import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a production build on its own database
 * (`preptracker_e2e`), so they never touch development data and exercise the
 * same code path a self-hosted install runs.
 *
 * The viewport is a phone on purpose: this app is used on a phone, so that is
 * what gets tested.
 */

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://127.0.0.1:${PORT}`;

function e2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL or E2E_DATABASE_URL must be set to run E2E tests.');
  const url = new URL(base);
  url.pathname = '/preptracker_e2e';
  return url.toString();
}

const DATABASE_URL = e2eDatabaseUrl();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'phone',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    // The database is prepared here rather than in globalSetup, because
    // Playwright starts the web server before globalSetup runs.
    // Runs the same standalone server a deployed install runs.
    command: `npx tsx scripts/e2e-prepare.mts && node .next/standalone/server.js`,
    url: `${baseURL}/api/health`,
    // Always start fresh: reusing a server would skip the database reset.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-secret-value-that-is-long-enough-000',
      NODE_ENV: 'production',
      TZ: process.env.TZ ?? 'UTC',
      // Pinned, not inherited: these tests run over http://127.0.0.1, where a
      // Secure cookie would never be sent back.
      COOKIE_SECURE: 'false',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
    },
  },
});
