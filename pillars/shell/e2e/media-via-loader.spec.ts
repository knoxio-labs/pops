/**
 * The media pillar, mounted through the shell's runtime loader (POPS-3226).
 *
 * media is the last pillar to leave the shell's static bundle map, and the one
 * whose published page list was furthest from its route table: eight entries
 * for twenty routes. The twelve missing ones are detail pages, the whole
 * rotation surface and four legacy redirects — none of which has a nav item,
 * so losing them would 404 silently.
 */
import { expect, test } from '@playwright/test';

import { stubShellBoot } from './helpers/pillar-rest';

test.describe('media — mounted by the runtime loader', () => {
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

  test('the rail carries media and its library renders from the remote bundle', async ({
    page,
  }) => {
    await page.goto('/media');

    await expect(page.getByRole('button', { name: 'Media', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  });

  // Several of the twelve the old page list would have dropped. All are deep
  // links off a list or an old bookmark, so a 404 here is invisible from the
  // rail.
  test('a movie detail deep link mounts', async ({ page }) => {
    await page.goto('/media/movies/123');

    await expect(page).toHaveURL(/\/media\/movies\/123/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  test('a season detail, three segments deep, mounts', async ({ page }) => {
    await page.goto('/media/tv/456/season/2');

    await expect(page).toHaveURL(/\/media\/tv\/456\/season\/2/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  test('the rotation surface mounts, which the old page list omitted entirely', async ({
    page,
  }) => {
    await page.goto('/media/rotation/candidates');

    await expect(page).toHaveURL(/\/media\/rotation\/candidates/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  test('a legacy settings redirect still lands on the settings page', async ({ page }) => {
    await page.goto('/media/plex');

    await expect(page).toHaveURL(/\/settings#media\.plex/);
  });
});
