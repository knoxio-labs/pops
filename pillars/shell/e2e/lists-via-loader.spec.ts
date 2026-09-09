/**
 * The lists pillar, mounted through the shell's runtime loader (POPS-3224).
 *
 * lists has the smallest surface of any pillar migrated so far — an index and
 * a detail page — and the detail page is the interesting one: it is a deep
 * link with no sidebar entry, so if it were left off the page list nothing on
 * the rail would look wrong and every link into a list would 404.
 */
import { expect, test } from '@playwright/test';

import { stubShellBoot } from './helpers/pillar-rest';

test.describe('lists — mounted by the runtime loader', () => {
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

  test('the rail carries lists and its index renders from the remote bundle', async ({ page }) => {
    await page.goto('/lists');

    await expect(page.getByRole('button', { name: 'Lists', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  test('the detail deep link mounts rather than 404ing', async ({ page }) => {
    await page.goto('/lists/some-list-id');

    await expect(page).toHaveURL(/\/lists\/some-list-id/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
    // The router's own not-found page, which is what a missing page descriptor
    // would produce here.
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });
});
