/**
 * The inventory pillar, mounted through the shell's runtime loader (POPS-3223).
 *
 * These checks exercise the route table after the shell has loaded the remote
 * bundle. They cover the reports query tabs and the legacy redirects that are
 * easy to break when the page tree changes.
 */
import { expect, test } from './fixtures/pillar-rest-guard';
import { stubShellBoot } from './helpers/pillar-rest';

test.describe('inventory — mounted by the runtime loader', () => {
  test.use({
    allowUnroutedPillarRest:
      'every assertion here is about the route table surviving the wire — a ' +
      'URL, a redirect keeping its query string, the absence of a load error ' +
      '— and none reads a body. Each page that mounts fires its own ' +
      'inventory-api reads (items, items/stats/distinct-types, ' +
      'locations/tree, reports/dashboard, reports/insurance); stubbing them ' +
      "would assert the inventory app's own data flow, which is that " +
      "pillar's tests' job",
  });

  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await stubShellBoot(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(errors).toHaveLength(0);
  });

  test('the rail carries inventory and its overview page renders from the remote bundle', async ({
    page,
  }) => {
    await page.goto('/inventory');

    await expect(page.getByRole('button', { name: 'Inventory', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  test('the reports page mounts', async ({ page }) => {
    await page.goto('/inventory/reports');

    await expect(page).toHaveURL(/\/inventory\/reports$/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  test('the old insurance path redirects to the Insurance tab', async ({ page }) => {
    await page.goto('/inventory/reports/insurance?locationId=loc-123');

    await expect(page).toHaveURL(/\/inventory\/reports\?tab=insurance&locationId=loc-123/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  test('a legacy report bookmark still redirects, keeping its query string', async ({ page }) => {
    await page.goto('/inventory/report?year=2024');

    await expect(page).toHaveURL(/\/inventory\/reports\?year=2024/);
  });

  test('the legacy insurance bookmark redirects too', async ({ page }) => {
    await page.goto('/inventory/report/insurance');

    await expect(page).toHaveURL(/\/inventory\/reports\?tab=insurance/);
  });

  test('the old warranties path redirects to the Warranties tab', async ({ page }) => {
    await page.goto('/inventory/warranties?tab=old');

    await expect(page).toHaveURL(/\/inventory\/reports\?tab=warranties/);
  });
});
