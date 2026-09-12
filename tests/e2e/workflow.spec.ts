import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERNAME } from './credentials';

/**
 * One journey through everything that matters, in the order a real week
 * happens:
 *
 *   sign in -> read today's plan -> log water, eat a meal, take a supplement
 *   -> generate a grocery list -> shop
 *   -> run a prep session and record a real cooking yield
 *   -> confirm the weekly tracker and history reflect all of it
 *
 * Runs against a production build at phone width, because that is how the app
 * is used.
 */

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(E2E_USERNAME);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/today');
}

test.describe.configure({ mode: 'serial' });

test('the full weekly workflow', async ({ page }) => {
  await signIn(page);

  await test.step('today is materialised from the seeded plan', async () => {
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

    // Each meal is a disclosure button rather than a heading: a heading inside a
    // button is not a valid content model, and the row is a control first.
    for (const name of ['Meal 1', 'Meal 2', 'Meal 3', 'Meal 4', 'Meal 5']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }

    // The seeded pattern makes Monday to Friday training days, so on a weekend
    // run this journey would otherwise be reading rest-day portions. Set it
    // rather than assume it: the rest of the step checks training quantities,
    // and this exercises the day-state control on the way through.
    const training = page
      .getByRole('radiogroup', { name: 'Day type' })
      .getByRole('radio', { name: 'Training' })
      .first();
    if ((await training.getAttribute('aria-checked')) !== 'true') {
      await training.click();
      // Reloaded rather than waited on: a server action's re-render arrives as
      // a transition, and React keeps the previous tree mounted while the new
      // one is prepared, so for a moment the page genuinely holds two of every
      // control. The rest of this journey asserts on exact names and would
      // match both.
      await page.waitForLoadState('networkidle');
      await page.reload();
    }

    // Training-day quantities, straight from the plan rows. Rows are collapsed
    // until opened, so open Meal 2 to see its plate. These are the assertion
    // that the day type took effect: the control itself is briefly rendered
    // twice while the updated page streams in, and its state is not the thing
    // worth pinning anyway.
    await page.getByRole('button', { name: /Meal 2/ }).first().click();
    await expect(page.getByText('225 g').first()).toBeVisible();
    await expect(page.getByText('175 g').first()).toBeVisible();

    // Macros are rolled up from the snapshot, not the live food rows.
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByText(/kcal ·/)).toBeVisible();
    await page.keyboard.press('Escape');

    // Which reminders appear depends on the time of day the suite runs, so the
    // ranking and the low-stock collapsing are asserted in the unit tests
    // instead. See tests/unit/domain-misc.test.ts.
  });

  await test.step('logging water updates the total immediately', async () => {
    await expect(page.getByText('0 mL', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '500 mL', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo 500 mL' })).toBeVisible();
  });

  await test.step('completing a meal records it', async () => {
    await page.getByRole('button', { name: 'Mark eaten' }).first().click();
    // The row now reads planned → eaten, e.g. "8:00 AM → 4:12 PM".
    await expect(page.getByText(/\d+:\d\d [AP]M → \d+:\d\d [AP]M/).first()).toBeVisible();
    await expect(page.getByText('1 / 5').first()).toBeVisible();
  });

  await test.step('ticking a supplement records it', async () => {
    const multivitamin = page.getByRole('checkbox', { name: /Multivitamin/ });
    await multivitamin.scrollIntoViewIfNeeded();
    await multivitamin.click();
    await expect(multivitamin).toBeChecked();
  });

  await test.step('the grocery list converts cooked weights to raw amounts', async () => {
    await page.getByRole('link', { name: 'Groceries' }).click();
    await page.waitForURL('**/groceries');

    // The specs share one database and another may have generated this week's
    // list already, in which case the landing page opens on it rather than on
    // the empty state.
    const generate = page.getByRole('button', { name: /New list|Generate this week/ });
    if (await generate.count()) {
      await generate.first().click();
      await expect(page.getByText('Days to shop for')).toBeVisible();
      await page.getByRole('button', { name: 'Generate' }).click();
      await page.waitForURL(/\/groceries\/[a-z0-9]+$/);
    } else {
      await page.getByRole('link', { name: 'Review list' }).click();
      await page.waitForURL(/\/groceries\/[a-z0-9]+$/);
    }

    // Meals 2 and 4 need 175 g cooked chicken twice a day for seven days:
    // 2450 g cooked, which at the seeded 75% yield is 3.27 kg raw to buy.
    await expect(page.getByText('3.27 kg')).toBeVisible();
    // The reasons live in the item's sheet.
    await page.getByRole('button', { name: /Chicken breast/ }).click();
    await expect(page.getByText('2.45 kg cooked')).toBeVisible();
    await expect(page.getByText('at 75% yield')).toBeVisible();
    await page.keyboard.press('Escape');

    // Meal 5 protein: 175 g cooked once a day for seven days.
    await page.getByRole('button', { name: /^Steak/ }).click();
    await expect(page.getByText('1.23 kg cooked')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  await test.step('shopping mode ticks items off', async () => {
    await page.getByRole('link', { name: 'Shop', exact: true }).click();
    await page.waitForURL(/\/shop$/);

    const counter = page.locator('p.tabular').first();
    const before = Number((await counter.innerText()).trim());
    expect(before).toBeGreaterThan(0);

    await page.getByRole('button', { name: /Chicken breast/ }).click();

    await expect(counter).toHaveText(String(before - 1));
  });

  await test.step('a prep session says how much to cook', async () => {
    await page.getByRole('link', { name: 'Prep' }).click();
    await page.waitForURL('**/prep');

    await page.getByRole('button', { name: /Plan a prep session/ }).click();
    await expect(page.getByText('Days of food to cook')).toBeVisible();
    await page.getByRole('button', { name: 'Create' }).click();

    await page.waitForURL(/\/prep\/[a-z0-9]+$/);
    await expect(page.getByRole('heading', { name: 'Chicken breast' })).toBeVisible();
    await expect(page.getByText(/Need 2\.45 kg cooked/)).toBeVisible();
  });

  await test.step('weighing the batch produces a real yield and a portion count', async () => {
    await page.getByLabel('Raw weight in grams for Chicken breast').fill('2000');
    await page.getByRole('button', { name: 'Next: cook it' }).click();
    await page.getByLabel('Cooked weight in grams for Chicken breast').fill('1400');

    // 1400 / 2000 = 70%, and 1400 g at 175 g a portion is exactly 8 portions.
    await expect(page.getByText('70%')).toBeVisible();
    await expect(page.getByText(/8\s*portions of/)).toBeVisible();

    await page.getByRole('button', { name: 'Save the Chicken breast batch' }).click();
    await expect(page.getByRole('button', { name: /Store 8 portions/ })).toBeVisible();
  });

  await test.step('the measured yield replaces the starting estimate', async () => {
    await page.goto('/prep/yields');
    // Chicken is now 70%; Steak still shows its 75% starting estimate.
    await expect(page.getByText('70% yield · 1 kg cooked needs 1.43 kg raw')).toBeVisible();
    await expect(page.getByText('1 measured batch')).toBeVisible();
  });

  await test.step('the weekly tracker reflects the day', async () => {
    await page.goto('/plan/week');
    await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
    await expect(page.getByText(/No finished days to score yet|of \d+ days? on plan/)).toBeVisible();
  });

  await test.step('history keeps a record of it', async () => {
    await page.goto('/more/history');
    await page.getByRole('tab', { name: 'Yields' }).click();
    await expect(page.getByText('Chicken breast')).toBeVisible();

    await page.getByRole('tab', { name: 'Prep' }).click();
    await expect(page.getByText(/70% yield/)).toBeVisible();
  });

  await test.step('a full backup contains the day just recorded', async () => {
    // Uses the page's request context so the session cookie comes along.
    const response = await page.request.get('/api/export/backup');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-disposition']).toMatch(
      /attachment; filename="preptracker-backup-\d{4}-\d{2}-\d{2}\.json"/,
    );

    const backup = await response.json();
    expect(backup.application).toBe('preptracker');
    expect(backup.data.user).toHaveLength(1);
    expect(backup.data.dailyMeal.length).toBeGreaterThan(0);
    expect(backup.data.waterEntry.length).toBeGreaterThan(0);
    expect(backup.data.cookingYield.some((y: { source: string }) => y.source === 'MEASURED')).toBe(true);
  });

  await test.step('a CSV extract downloads too', async () => {
    const response = await page.request.get('/api/export/meals');
    expect(response.ok()).toBe(true);
    const csv = await response.text();
    expect(csv.split('\r\n')[0]).toContain('date,dayType,meal');
  });
});

test('editing the plan does not rewrite a day already logged', async ({ page }) => {
  await signIn(page);

  // Today was generated with "White rice".
  await page.goto('/today');
  await expect(page.getByText('White rice').first()).toBeVisible();

  // Rename the food in the plan.
  await page.goto('/plan/foods');
  await page.getByRole('button', { name: /White rice/ }).click();
  await page.getByLabel('Name').fill('Basmati rice');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Basmati rice/ })).toBeVisible();

  // The stored day keeps the snapshot it was generated with.
  await page.goto('/today');
  await expect(page.getByText('White rice').first()).toBeVisible();
  await expect(page.getByText('Basmati rice')).toHaveCount(0);
});
