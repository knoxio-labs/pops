/**
 * App-rail navigation smoke test.
 *
 * Every pillar route is lazy-loaded and mounted by a router the shell builds
 * at boot, so a broken bundle map, a missing route, or a page that throws on
 * an empty pillar shows up here and nowhere else. Each test asserts the URL,
 * the active indicator, and the heading that page in particular owns — and the
 * `pageerror` listener makes "rendered without crashing" a claim of every test
 * in the file, not just the ones that mention it.
 *
 * The pillars answer nothing here beyond the registry: a page that cannot
 * survive its own pillar returning nothing is a page that cannot survive a
 * cold deploy either.
 */
import { expect, test } from '@playwright/test';

import { stubShellBoot } from './helpers/pillar-rest';

/**
 * Rail label -> the path clicking it must land on, and the `<h1>` that page
 * owns. The heading is named rather than taken positionally because the shell
 * chrome renders an `<h1>POPS</h1>` of its own on every route: a positional
 * match is satisfied by the frame alone, so it holds just as well when the
 * pillar page underneath it renders nothing but an error card.
 */
const RAIL_TARGETS = [
  { label: 'Media', path: /\/media/, heading: 'Library' },
  { label: 'Inventory', path: /\/inventory/, heading: 'Inventory' },
  { label: 'Lists', path: /\/lists/, heading: 'Lists' },
  { label: 'Purchases', path: /\/purchases/, heading: 'Reconcile' },
] as const;

/** The `<h1>` `/` lands on once it has redirected to the first app. */
const FINANCE_HEADING = 'Dashboard';

test.describe('Shell — app-rail navigation', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await stubShellBoot(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(errors).toHaveLength(0);
  });

  test('/ lands on the first registered app and marks it active', async ({ page }) => {
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading', { level: 1, name: FINANCE_HEADING })).toBeVisible();
  });

  for (const target of RAIL_TARGETS) {
    test(`clicking ${target.label} navigates and moves the active indicator`, async ({ page }) => {
      await page.getByRole('button', { name: target.label }).click();

      await expect(page).toHaveURL(target.path);
      await expect(page.getByRole('button', { name: target.label })).toHaveAttribute(
        'aria-current',
        'page'
      );
      await expect(page.getByRole('button', { name: 'Finance' })).not.toHaveAttribute(
        'aria-current',
        'page'
      );
      await expect(page.getByRole('heading', { level: 1, name: target.heading })).toBeVisible();
    });
  }

  test('navigating away and back restores the Finance indicator', async ({ page }) => {
    await page.getByRole('button', { name: 'Media' }).click();
    await expect(page).toHaveURL(/\/media/);

    await page.getByRole('button', { name: 'Finance' }).click();

    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('button', { name: 'Media' })).not.toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('an unknown route renders the not-found page, not a blank frame', async ({ page }) => {
    await page.goto('/definitely-not-a-pillar');

    await expect(page.getByRole('heading', { name: /not found|404/i })).toBeVisible();
  });
});
