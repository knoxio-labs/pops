/**
 * The cerebrum pillar, mounted through the shell's runtime loader (POPS-3225).
 *
 * cerebrum is the only pillar that contributes a capture overlay, and that is
 * the surface worth a browser: it is not a route, so losing it 404s nothing —
 * the modal simply opens empty and the global hotkey appears to do nothing.
 * Its component also used to be assembled in the shell's own bundle map, out
 * of two exports of this app; it now ships inside the pillar's bundle and is
 * resolved by slot.
 */
import { expect, test } from '@playwright/test';

import { stubShellBoot } from './helpers/pillar-rest';

test.describe('cerebrum — mounted by the runtime loader', () => {
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

  test('the rail carries cerebrum and its ingest page renders from the remote bundle', async ({
    page,
  }) => {
    await page.goto('/cerebrum');

    await expect(page.getByRole('button', { name: 'Cerebrum', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  // A detail route, two segments deep and reachable only from a list — the
  // kind most easily dropped from the page list, and the kind whose absence
  // shows up as a 404 rather than as anything visibly broken.
  test('an engram detail deep link mounts', async ({ page }) => {
    await page.goto('/cerebrum/engrams/some-engram-id');

    await expect(page).toHaveURL(/\/cerebrum\/engrams\/some-engram-id/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  /**
   * The overlay. Opened by the shell's global capture hotkey, resolved from
   * the pillar's bundle by the slot its manifest names — the path POPS-3266
   * added. Before it, the modal opened on its empty state for any pillar that
   * had left the static bundle map.
   */
  test('the capture hotkey opens cerebrum’s overlay from the remote bundle', async ({ page }) => {
    await page.goto('/cerebrum');
    await expect(page.getByRole('button', { name: 'Cerebrum', exact: true })).toBeVisible();

    // Meta, not `ControlOrMeta`: the manifest declares `cmd+shift+k`, and the
    // matcher reads `cmd` as the Apple key alone. On Linux `ControlOrMeta`
    // presses Control, which that chord cannot match — so pressing it here
    // would assert a shortcut no reader of this pillar on Linux can use.
    // POPS-3319 covers making the wire token platform-relative.
    await page.keyboard.press('Meta+Shift+KeyK');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The overlay's own content, not merely a dialog frame: the empty state is
    // also a visible dialog, which is exactly what a missing slot produces.
    await expect(dialog.getByTestId('external-pillar-load-error')).toHaveCount(0);
    await expect(dialog.getByRole('textbox').first()).toBeVisible();
  });
});
