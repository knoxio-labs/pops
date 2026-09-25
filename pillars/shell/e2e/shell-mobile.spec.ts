/**
 * The shell chrome on a phone.
 *
 * Every other spec runs at a desktop viewport, where the rail and page nav
 * stand in for the mobile drawer, so the drawer's regressions reached a phone
 * unseen: it opened on every first load, and with every app's pages in one
 * fixed-height column most of them sat below the screen edge with no way to
 * scroll to them. This file is the phone's view of the same frame.
 */
import { devices } from '@playwright/test';

import { expect, test } from './fixtures/pillar-rest-guard';
import { stubShellBoot } from './helpers/pillar-rest';

import type { Page } from '@playwright/test';

const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['Pixel 7'];

test.use({
  viewport,
  deviceScaleFactor,
  isMobile,
  hasTouch,
  userAgent,
  allowUnroutedPillarRest:
    'these tests exercise the chrome around a page, not the page: each ' +
    "pillar's own data fetch is left unstubbed, as in shell-navigation.spec.ts",
});

/**
 * `/` redirects to the first app once boot resolves; the drawer tests start
 * from there so the link they tap is never the page already showing.
 */
async function openLandingPage(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/finance/);
}

test.describe('Shell — mobile chrome', () => {
  test.beforeEach(async ({ page }) => {
    await stubShellBoot(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('a first visit lands on the page, not on an open drawer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
  });

  test('a drawer left open by an older build does not reopen', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pops-ui-storage',
        JSON.stringify({ state: { sidebarOpen: true, railOpen: true }, version: 0 })
      );
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
  });

  test('every page in the drawer can be scrolled to and opened', async ({ page }) => {
    await openLandingPage(page);
    await page.getByRole('button', { name: 'Toggle sidebar' }).tap();
    const drawer = page.getByRole('dialog', { name: 'Main navigation' });
    await expect(drawer).toBeVisible();

    const box = await drawer.boundingBox();
    expect(box?.height).toBeLessThanOrEqual(viewport.height);

    const settings = drawer.getByRole('link', { name: 'Settings' });
    await expect(settings).toBeInViewport();

    const last = drawer.getByRole('navigation').getByRole('link').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    const href = await last.getAttribute('href');
    await last.tap();

    await expect(page).toHaveURL(new RegExp(`${href ?? ''}$`));
    await expect(drawer).toHaveCount(0);
  });

  test('the drawer closes on its scrim and releases the page scroll lock', async ({ page }) => {
    await openLandingPage(page);
    await page.getByRole('button', { name: 'Toggle sidebar' }).tap();
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

    await page.mouse.click(viewport.width - 10, viewport.height / 2);

    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });

  test('the page never scrolls sideways', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);
  });
});
