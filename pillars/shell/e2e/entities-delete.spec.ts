/**
 * E2E test — Finance entities delete (CF069/#3649)
 *
 * Tier 2 coverage: navigate to /finance/entities, create a throwaway entity,
 * delete it via the row Actions → Delete menu + confirmation dialog, and
 * confirm the row is gone both immediately and after a reload against the
 * real seeded SQLite `e2e` env.
 *
 * Mirrors `entities-create-alias.spec.ts`'s locator strategy and idempotency
 * approach (a Date.now()-suffixed name avoids colliding with the unique-name
 * constraint the entities router enforces).
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Finance — entities delete', () => {
  test.describe.configure({ mode: 'serial' });

  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  const entityName = `E2E Delete Entity ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    await useRealApi(page);
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/finance/entities');
    await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('creates then deletes an entity, removing the row immediately and after reload', async ({
    page,
  }) => {
    // --- Step 1: create a throwaway entity to delete ----------------------
    await page.getByRole('button', { name: /add entity/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('New Entity')).toBeVisible();

    await dialog.getByPlaceholder('e.g. Woolworths, Netflix').fill(entityName);
    await dialog
      .locator('select')
      .filter({ has: page.locator('option[value="company"]') })
      .selectOption('company');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByRole('row').filter({ hasText: entityName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // --- Step 2: delete via Actions → Delete + confirm ---------------------
    await row.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: /delete/i }).click();

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog.getByText('Are you absolutely sure?')).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Delete' }).click();
    await expect(confirmDialog).toBeHidden();

    // Row disappears immediately.
    await expect(page.getByRole('row').filter({ hasText: entityName })).toHaveCount(0, {
      timeout: 10_000,
    });

    // --- Step 3: reload and assert the deletion persisted -------------------
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('row').filter({ hasText: entityName })).toHaveCount(0);
  });
});
