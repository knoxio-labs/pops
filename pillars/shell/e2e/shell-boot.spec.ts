/**
 * Boot install-set resolution — the registry snapshot decides what mounts.
 *
 * `src/app/boot-snapshot.ts` blocks first render on
 * `GET /registry-api/registry/pillars` and resolves the rail and the router
 * from it, falling back to the static bundle-map floor when the registry says
 * nothing usable. Both halves of that contract are unit-tested; what only a
 * browser can show is that the resolved set is what actually reaches the DOM,
 * and that the fallback is a working shell rather than an app-less one.
 */
import { expect, test } from '@playwright/test';

import {
  failRegistry,
  IN_REPO_PILLARS,
  json,
  stubPillarHealth,
  stubRegistry,
} from './helpers/pillar-rest';

test.describe('Shell — boot install set', () => {
  let errors: string[] = [];

  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(errors).toHaveLength(0);
  });

  test('mounts exactly the pillars the registry lists', async ({ page }) => {
    await stubRegistry(page, ['finance', 'media']);
    await stubPillarHealth(page, ['finance', 'media']);

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Media' })).toBeVisible();

    // The negative half is the point: a rail built from the static floor would
    // carry these too, so their absence is what proves the snapshot drove it.
    await expect(page.getByRole('button', { name: 'Inventory' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lists' })).toHaveCount(0);
  });

  test('an empty snapshot falls back to the in-repo floor rather than an empty rail', async ({
    page,
  }) => {
    await stubRegistry(page, []);
    await stubPillarHealth(page, IN_REPO_PILLARS);

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inventory' })).toBeVisible();
  });

  test('an unreachable registry still boots the shell', async ({ page }) => {
    await failRegistry(page);
    await stubPillarHealth(page, IN_REPO_PILLARS);

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('a registry answering with garbage is treated as no answer', async ({ page }) => {
    await page.route(/\/registry-api\/registry\/pillars$/, (route) =>
      json(route, 200, { pillars: 'not-a-list' })
    );
    await stubPillarHealth(page, IN_REPO_PILLARS);

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inventory' })).toBeVisible();
  });
});
