/**
 * Smoke test — shell loads and app-rail navigation (#2099)
 *
 * Tier 1 minimum: shell root loads, each app-rail icon navigates to the
 * correct route, a page heading is visible, and no uncaught JS error occurs.
 *
 * Notes: no tRPC mocking. The API is started by Playwright's webServer config
 * and the initialized (empty-schema) database returns empty results that all
 * page components handle gracefully without crashing.
 */
import { expect, test } from '@playwright/test';

test.describe('Shell — app-rail navigation smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Root redirects to /finance — wait for navigation to settle.
    await expect(page).toHaveURL(/\/finance/);
    // App rail renders after the shell mounts — wait for Finance button.
    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
  });

  test('shell root redirects to /finance and shows a heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('Finance rail item is active on load', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('navigates to Media — updates URL, active indicator, and shows a heading', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.getByRole('button', { name: 'Media' }).click();
    await expect(page).toHaveURL(/\/media/);
    await expect(page.getByRole('button', { name: 'Media' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('button', { name: 'Finance' })).not.toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading').first()).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('navigates to Inventory — updates URL, active indicator, and shows a heading', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.getByRole('button', { name: 'Inventory' }).click();
    await expect(page).toHaveURL(/\/inventory/);
    await expect(page.getByRole('button', { name: 'Inventory' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('navigates to AI — updates URL, active indicator, and shows a heading', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.getByRole('button', { name: 'AI' }).click();
    await expect(page).toHaveURL(/\/ai/);
    await expect(page.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading').first()).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('navigating back to Finance restores its active indicator', async ({ page }) => {
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
});
