import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERNAME } from './credentials';

/**
 * What happens when things go wrong, and what the narrowest phone sees.
 *
 * Both of these were audit findings rather than hypotheticals. A server action
 * whose request never arrived used to reject inside a transition, which React
 * sent to the nearest error boundary — and there were none, so the route was
 * replaced by the framework's error page. And the Shopping Mode counter was
 * squeezed into a sixteen-pixel column at 320 px, which is not overflow and so
 * passed the overflow check.
 */

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(E2E_USERNAME);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/today');
}

test.describe.configure({ mode: 'serial' });

test('a failed save says so and leaves the screen standing', async ({ page }) => {
  await signIn(page);

  const hero = page.getByRole('button', { name: /Mark eaten/i }).first();
  await expect(hero).toBeVisible();

  // Everything from here on fails to reach the server, which is what a dropped
  // connection or a stopped container looks like from the phone.
  await page.route('**/today**', (route) => route.abort('failed'));

  await hero.click();

  await expect(page.getByText(/Could not reach the server/i)).toBeVisible({ timeout: 15_000 });

  // The page is still the page: not the framework's error screen, and not blank.
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(hero).toBeVisible();
  await expect(page.getByText(/Application error/i)).toHaveCount(0);

  await page.unroute('**/today**');
});

test('the shopping counter stays readable at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page);

  await page.goto('/groceries');

  // Shop is a link styled as a button. Generate a list first if this run has
  // not already produced one; the specs share one database.
  const shop = page.getByRole('link', { name: /^Shop$/ });
  if ((await shop.count()) === 0) {
    await page.getByRole('button', { name: /New list|Generate this week/i }).first().click();
    await page.getByRole('button', { name: /^Generate$/ }).click();
    await expect(shop.first()).toBeVisible({ timeout: 30_000 });
  }

  await shop.first().click();
  await page.waitForURL('**/shop');

  const counter = page.getByText(/items? remaining/i).first();
  await expect(counter).toBeVisible();

  const box = await counter.boundingBox();
  expect(box).not.toBeNull();

  // The old layout put 272 px of fixed-width controls in a 288 px content box,
  // so the counter wrapped one word per line into whatever was left. Its own
  // height gives that away without needing to read the pixels.
  expect(box!.width).toBeGreaterThan(120);
  expect(box!.height).toBeLessThan(90);

  // And the page itself still does not scroll sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
