/**
 * The inventory pillar, mounted through the shell's runtime loader (POPS-3223).
 *
 * Two things here only a browser can settle. The `reports` group is a route
 * with children and no element of its own in the app — the wire needs a slot
 * per node, so the app names a passthrough rendering the `<Outlet/>` that
 * react-router would render implicitly, and this is where that is shown to
 * behave the same. And the two `report/*` redirects were missing from the
 * page list this replaces: harmless while the bundle map mounted the whole
 * route table, a 404 on an old bookmark the moment it did not.
 */
import { expect, test } from '@playwright/test';

import { stubShellBoot } from './helpers/pillar-rest';

test.describe('inventory — mounted by the runtime loader', () => {
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

  test('the rail carries inventory and its items page renders from the remote bundle', async ({
    page,
  }) => {
    await page.goto('/inventory');

    await expect(page.getByRole('button', { name: 'Inventory', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  // The group's index child. Reaching the dashboard at `/inventory/reports`
  // is only possible if the child mounted beneath the passthrough.
  test('the reports group mounts its index child', async ({ page }) => {
    await page.goto('/inventory/reports');

    await expect(page).toHaveURL(/\/inventory\/reports$/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  test('a named child mounts under the reports group', async ({ page }) => {
    await page.goto('/inventory/reports/insurance');

    await expect(page).toHaveURL(/\/inventory\/reports\/insurance/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  /**
   * The redirects the old page list had dropped. They also carry the query
   * string across, which is the whole reason they are components rather than
   * a plain `<Navigate>` — an old bookmark keeps its filters.
   */
  test('a legacy report bookmark still redirects, keeping its query string', async ({ page }) => {
    await page.goto('/inventory/report?year=2024');

    await expect(page).toHaveURL(/\/inventory\/reports\?year=2024/);
  });

  test('the legacy insurance bookmark redirects too', async ({ page }) => {
    await page.goto('/inventory/report/insurance');

    await expect(page).toHaveURL(/\/inventory\/reports\/insurance/);
  });
});
