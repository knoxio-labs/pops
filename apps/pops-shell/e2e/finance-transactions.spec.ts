/**
 * Smoke test — Finance transactions list (#2100)
 *
 * Tier 1 minimum: page loads, seeded rows render, a filter narrows the list,
 * and clearing the filter restores the full list.
 *
 * Notes:
 * - Real API against the seeded 'e2e' SQLite environment.
 * - Seeded accounts ("Bank Account", "Credit Card", "Debit Card") do not match
 *   the account filter's static options ("ANZ Everyday", "Amex", etc.), so the
 *   Type filter is used for the narrowing assertion — it reliably matches seeded
 *   types (Income / Expense / Transfer).
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Finance — transactions list smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
    await page.goto('/finance/transactions');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('renders seeded transactions', async ({ page }) => {
    // Two distinct seeded transactions that should both be visible.
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('row').filter({ hasText: 'Woolworths Metro' }).first()
    ).toBeVisible();
  });

  test('filter by Type narrows the list', async ({ page }) => {
    // Wait for data to load.
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // The Type select is the second filter (after Account).
    // Select "Income" — only Salary Payment rows remain.
    await page.locator('select').nth(1).selectOption('Income');

    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible();
    // Expense rows should no longer be visible.
    await expect(page.getByRole('row').filter({ hasText: 'Woolworths Metro' })).not.toBeVisible();
  });

  test('clearing the filter restores the full list', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Apply Income filter.
    await page.locator('select').nth(1).selectOption('Income');
    await expect(page.getByRole('row').filter({ hasText: 'Woolworths Metro' })).not.toBeVisible();

    // Clear all filters — button appears when any filter is active.
    await page.getByRole('button', { name: /clear all/i }).click();

    // Woolworths Metro should be visible again.
    await expect(
      page.getByRole('row').filter({ hasText: 'Woolworths Metro' }).first()
    ).toBeVisible();
  });
});
