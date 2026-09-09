/**
 * `POPS_APPS=finance,core` — what a restricted install set still gates.
 *
 * These run only against the `chromium-finance-only` project, whose shell is
 * built against a registry snapshot generated with that install set (see
 * `playwright.config.ts`). Two places still read the build-time set rather
 * than the live registry, and each is a different kind of leak if it breaks:
 *
 *   - `staticFloorEntries` filters the in-repo bundle map through
 *     `isInstalledModule`, so an operator who excluded a module does not get
 *     it back the moment the registry goes quiet. Only that direction is
 *     still testable here: finance is served by the runtime loader since
 *     POPS-3219, so no install set can put it on the rail with the registry
 *     down — the floor is the in-repo bundle map, which finance has left;
 *   - `isInstalledModule` in `libs/navigation` drops federated-search
 *     sections for modules this build did not ship, so results cannot link
 *     into a page that was never mounted.
 *
 * The registry is deliberately taken off the air in the first two tests. The
 * boundary they assert is the one the LIVE registry cannot restore, and a
 * snapshot answering normally would mount media through the bundle map and
 * hide it.
 */
import { expect, test } from '@playwright/test';

import {
  CROSS_MODULE_SEARCH_SECTIONS,
  failRegistry,
  SEARCH_QUERY,
  stubOrchestratorSearch,
  stubPillarHealth,
} from './helpers/pillar-rest';

test.describe('Shell — POPS_APPS=finance,core install set', () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('an excluded module is not-installed, not a 404', async ({ page }) => {
    await failRegistry(page);
    await stubPillarHealth(page, ['finance']);

    await page.goto('/media');

    // Both halves, because the two pages are the thing being told apart: a
    // 404 here would mean the router lost the module rather than gated it.
    await expect(page.getByRole('heading', { name: /module not installed/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  test('an excluded module stays off the rail when the registry is down', async ({ page }) => {
    await failRegistry(page);
    await stubPillarHealth(page, ['finance']);

    await page.goto('/finance');

    // Media is IN the bundle map and OUT of this install set, so it is the
    // one the floor would leak if `staticFloorEntries` stopped filtering.
    await expect(page.getByRole('button', { name: 'Media' })).toHaveCount(0);
    // And finance, being loader-served, cannot come off the floor at all —
    // an outage takes it with the registry rather than the install set
    // holding it up.
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveCount(0);
  });

  test('search drops results owned by an excluded module', async ({ page }) => {
    await failRegistry(page);
    await stubPillarHealth(page, ['finance']);
    // The same payload `global-search.spec.ts` asserts arrives whole against
    // the all-modules shell. Shared so that the two runs cannot drift apart:
    // this test's claim is the difference between them.
    await stubOrchestratorSearch(page, CROSS_MODULE_SEARCH_SECTIONS);

    await page.goto('/finance');
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });
    await expect(searchBox).toBeVisible();
    await searchBox.fill(SEARCH_QUERY);

    const panel = page.getByTestId('search-results-panel');
    // The finance section arriving is what makes the media section's absence
    // meaningful — without it, an empty panel would pass this test too.
    await expect(panel.getByTestId('section-transactions')).toBeVisible();
    await expect(panel.getByTestId('section-movies')).toHaveCount(0);
    await expect(panel.getByText('The Matrix')).toHaveCount(0);
  });
});
