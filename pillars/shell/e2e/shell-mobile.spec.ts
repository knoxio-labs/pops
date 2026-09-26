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

  // The Language switcher is a kit DropdownMenu. Its trigger cancels the touch
  // pointerdown so Radix does not open on press, and opens on the click that
  // follows. These two tests run on real touch input, which is what the unit
  // tests' synthetic pointerdown + click cannot show: that cancelling a touch
  // pointerdown leaves the tap's click intact, and that a swipe fires none.
  test('a tap on a DropdownMenu trigger opens it', async ({ page }) => {
    await openLandingPage(page);
    await page.getByRole('button', { name: 'Language' }).tap();
    await expect(page.getByRole('menu')).toBeVisible();
  });

  test('a swipe that starts on a DropdownMenu trigger scrolls the page', async ({ page }) => {
    await openLandingPage(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);

    const box = await page.getByRole('button', { name: 'Language' }).boundingBox();
    if (box === null) throw new Error('Language trigger has no box');
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);

    // Raw touch input, finger dragged down from the trigger: the page should
    // scroll back up. `Input.synthesizeScrollGesture` does not scroll the
    // headless shell at all, so it cannot tell a working page from this bug.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + 30 * step }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(600);
    await expect(page.getByRole('menu')).toHaveCount(0);
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
