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
import { z } from 'zod';

import { expect, test } from './fixtures/pillar-rest-guard';
import { fulfilWith, stubShellBoot } from './helpers/pillar-rest';

/** Mirrors Cerebrum's `rest-schemas.ts` engram and `rest-engrams.ts` GET response. */
const EngramDetailResponseSchema = z
  .object({
    engram: z
      .object({
        id: z.string().min(1),
        type: z.string().min(1),
        scopes: z.array(z.string()),
        tags: z.array(z.string()),
        links: z.array(z.string()),
        created: z.string(),
        modified: z.string(),
        source: z.string(),
        status: z.enum(['active', 'archived', 'consolidated', 'stale']),
        template: z.string().nullable(),
        title: z.string(),
        filePath: z.string(),
        contentHash: z.string(),
        wordCount: z.number().int(),
        customFields: z.record(z.string(), z.unknown()),
      })
      .strict(),
    body: z.string(),
  })
  .strict();

const ENGRAM_DETAIL: z.infer<typeof EngramDetailResponseSchema> = {
  engram: {
    id: 'eng_20261024_0800_loader-smoke',
    type: 'note',
    scopes: ['work'],
    tags: [],
    links: [],
    created: '2026-10-24T08:00:00.000Z',
    modified: '2026-10-24T08:00:00.000Z',
    source: 'manual',
    status: 'active',
    template: null,
    title: 'Runtime loader fixture',
    filePath: 'notes/loader-smoke.md',
    contentHash: 'loader-smoke-fixture',
    wordCount: 4,
    customFields: {},
  },
  body: 'A fictional loader fixture.',
};

test.describe('cerebrum — mounted by the runtime loader', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await stubShellBoot(page);
  });

  test.afterEach(() => {
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
    const respond = fulfilWith(
      200,
      EngramDetailResponseSchema,
      ENGRAM_DETAIL,
      'cerebrum engram detail'
    );
    await page.route(/\/cerebrum-api\/engrams\/eng_20261024_0800_loader-smoke$/, (route) => {
      expect(route.request().method()).toBe('GET');
      return respond(route);
    });
    await page.goto(`/cerebrum/engrams/${ENGRAM_DETAIL.engram.id}`);

    await expect(page).toHaveURL(/\/cerebrum\/engrams\/eng_20261024_0800_loader-smoke$/);
    await expect(
      page.getByRole('heading', { level: 2, name: ENGRAM_DETAIL.engram.title })
    ).toBeVisible();
    await expect(page.getByText(ENGRAM_DETAIL.body, { exact: true })).toBeVisible();
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  /**
   * The overlay. Opened by the shell's global capture hotkey, resolved from
   * the pillar's bundle by the slot its manifest names — the path POPS-3266
   * added. Before it, the modal opened on its empty state for any pillar that
   * had left the static bundle map.
   */
  test.describe('open the overlay without stubbing its own dropdown data', () => {
    test.use({
      allowUnroutedPillarRest:
        'the ingest form fetches its own templates/scopes/tags for dropdown ' +
        'options on mount; the assertions below only check the dialog and a ' +
        'textbox rendered, not that those dropdowns have options, so this is ' +
        'the same "mounted, unstubbed API" shape as `ai-via-loader.spec.ts`',
    });

    test('the capture hotkey opens cerebrum’s overlay from the remote bundle', async ({ page }) => {
      await page.goto('/cerebrum');
      await expect(page.getByRole('button', { name: 'Cerebrum', exact: true })).toBeVisible();

      // `ControlOrMeta`, which Playwright resolves per platform, because the
      // manifest declares `mod+shift+k` and the matcher resolves `mod` the same
      // way. This pressed `Meta` for a while: `mod` was an alias for the Apple
      // key, so the chord was unreachable on the Linux runner and on every
      // Linux and Windows reader (POPS-3319). Pressing Meta here asserted a
      // shortcut half the clients could not use.
      await page.keyboard.press('ControlOrMeta+Shift+KeyK');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      // The overlay's own content, not merely a dialog frame: the empty state is
      // also a visible dialog, which is exactly what a missing slot produces.
      await expect(dialog.getByTestId('external-pillar-load-error')).toHaveCount(0);
      await expect(dialog.getByRole('textbox').first()).toBeVisible();
    });
  });
});
