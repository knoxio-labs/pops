/**
 * Smoke test — Inventory items list (#2102)
 *
 * Tier 1 minimum: page loads, seeded items are visible, and the replacement
 * value total is displayed in the summary bar.
 *
 * Seeded items include:
 *   MacBook Pro 16-inch (replacement: $5,499), Sony WH-1000XM5 Headphones,
 *   Samsung 65" TV, Dyson V15, Breville Barista Express.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Inventory — items list smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
    await page.goto('/inventory');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('renders seeded inventory items', async ({ page }) => {
    // MacBook Pro is the first seeded item and a reliable anchor.
    await expect(page.getByText(/MacBook Pro/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('displays the replacement value total in the summary bar', async ({ page }) => {
    // SummaryAndView renders: "N items — $X replacement"
    await expect(page.getByText(/replacement/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('page does not crash (no uncaught errors)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Re-navigate inside the test to capture any errors after the hook's goto.
    await page.goto('/inventory');
    await expect(page.getByText(/MacBook Pro/i).first()).toBeVisible({ timeout: 10_000 });

    expect(errors).toHaveLength(0);
  });
});
