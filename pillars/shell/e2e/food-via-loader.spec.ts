/**
 * The food pillar, mounted through the shell's runtime loader (POPS-3222).
 *
 * food is the first pillar whose route table nests: eight `data` tabs beneath
 * a layout whose element renders the tab chrome around an `<Outlet/>`. That
 * shape is what POPS-3256 taught the wire to carry, and this is the only tier
 * that can show it survived the round trip — a flattened tree still renders a
 * tab, it just rebuilds the chrome underneath it every time.
 */
import { expect, test } from '@playwright/test';

import { stubShellBoot } from './helpers/pillar-rest';

test.describe('food — mounted by the runtime loader', () => {
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

  test('the rail carries food and its landing page renders from the remote bundle', async ({
    page,
  }) => {
    await page.goto('/food');

    await expect(page.getByRole('button', { name: 'Food', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('navigation', { name: 'Food pages' })).toBeVisible();
  });

  /**
   * The nesting claim. `/food/data` has no page of its own — the layout's
   * index child redirects to the first tab — so landing on the ingredients
   * tab is only possible if the child mounted beneath the layout rather than
   * beside it.
   */
  test('the data layout mounts its index child, landing on the first tab', async ({ page }) => {
    await page.goto('/food/data');

    await expect(page).toHaveURL(/\/food\/data\/ingredients/);
  });

  test('a named data tab mounts under the same layout', async ({ page }) => {
    await page.goto('/food/data/conversions');

    await expect(page).toHaveURL(/\/food\/data\/conversions/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  /**
   * A route two levels deep and reachable from nothing on the rail — the kind
   * most easily dropped from the page list, and the kind whose absence shows
   * up as a 404 rather than as anything visibly broken.
   */
  test('the substitutions graph subroute mounts', async ({ page }) => {
    await page.goto('/food/data/substitutions/graph');

    await expect(page).toHaveURL(/\/food\/data\/substitutions\/graph/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });
});
