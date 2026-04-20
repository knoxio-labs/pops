/**
 * Smoke test — Finance budgets list (#2104)
 *
 * Tier 1 minimum: page loads, 8 seeded budgets are visible (7 monthly + 1 yearly),
 * and the Period filter correctly narrows to each group.
 *
 * Seeded budgets:
 *   Monthly: Groceries, Transport, Entertainment, Shopping, Home & Garden,
 *            Utilities, Subscriptions
 *   Yearly:  Holiday Fund
 *
 * Note: the issue specifies a spending progress bar per budget row. That
 * column is not yet implemented in BudgetsPage — amounts are shown but
 * there is no progress indicator against actual spending. This gap is
 * tracked in the issue and this test covers what is currently built.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Finance — budgets list smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
    await page.goto('/finance/budgets');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('renders seeded budgets', async ({ page }) => {
    // Monthly budgets
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('row').filter({ hasText: 'Transport' }).first()).toBeVisible();

    // Yearly budget
    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' }).first()).toBeVisible();
  });

  test('shows both Monthly and Yearly period badges', async ({ page }) => {
    await expect(page.getByText('Monthly').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Yearly').first()).toBeVisible();
  });

  test('Period filter narrows to Yearly budgets', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Period is the first filter select.
    await page.locator('select').nth(0).selectOption('Yearly');

    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' }).first()).toBeVisible();
    // Monthly budgets should no longer be visible.
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' })).not.toBeVisible();
  });

  test('Period filter narrows to Monthly budgets', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' }).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.locator('select').nth(0).selectOption('Monthly');

    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible();
    // Yearly budget should not be visible.
    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' })).not.toBeVisible();
  });

  test('clearing Period filter restores all budgets', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.locator('select').nth(0).selectOption('Yearly');
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' })).not.toBeVisible();

    await page.getByRole('button', { name: /clear all/i }).click();

    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' }).first()).toBeVisible();
  });
});
