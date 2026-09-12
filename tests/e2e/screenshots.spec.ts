import { test } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERNAME } from './credentials';

/**
 * Captures the main screens at phone size for a visual check.
 *
 * Not an assertion suite — it is tagged @visual and skipped by default so it
 * never fails a normal run. Take the pictures with:
 *   npx playwright test screenshots --grep @visual
 */

const SCREENS = [
  ['today', '/today'],
  ['plan', '/plan'],
  ['prep', '/prep'],
  ['groceries', '/groceries'],
  ['week', '/plan/week'],
  ['more', '/more'],
] as const;

test.skip(!process.env.VISUAL, 'Visual capture only; set VISUAL=1 to run.');

test('@visual capture the main screens', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(E2E_USERNAME);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/today');

  for (const [name, path] of SCREENS) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: false });
  }

  // The same day in dark mode.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/today');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/screens/today-dark.png' });
});
