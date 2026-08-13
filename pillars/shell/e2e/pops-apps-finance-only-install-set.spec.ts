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
 *     it back the moment the registry goes quiet;
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

import { failRegistry, stubOrchestratorSearch, stubPillarHealth } from './helpers/pillar-rest';

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

  test('the installed module still mounts and owns the rail', async ({ page }) => {
    await failRegistry(page);
    await stubPillarHealth(page, ['finance']);

    await page.goto('/finance');

    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('button', { name: 'Media' })).toHaveCount(0);
  });

  test('search drops results owned by an excluded module', async ({ page }) => {
    await failRegistry(page);
    await stubPillarHealth(page, ['finance']);
    await stubOrchestratorSearch(page, [
      {
        domain: 'movies',
        moduleId: 'media',
        hits: [{ uri: 'pops://media/movie/1', data: { title: 'The Matrix', year: 1999 } }],
      },
      {
        domain: 'transactions',
        moduleId: 'finance',
        hits: [
          {
            uri: 'pops://finance/transaction/1',
            data: {
              description: 'MATRIX CINEMA',
              amount: -24.5,
              date: '2026-02-13',
              entityName: 'Event Cinemas',
              type: 'purchase',
            },
          },
        ],
      },
    ]);

    await page.goto('/finance');
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });
    await expect(searchBox).toBeVisible();
    await searchBox.fill('matrix');

    const panel = page.getByTestId('search-results-panel');
    // The finance section arriving is what makes the media section's absence
    // meaningful — without it, an empty panel would pass this test too.
    await expect(panel.getByTestId('section-transactions')).toBeVisible();
    await expect(panel.getByTestId('section-movies')).toHaveCount(0);
    await expect(panel.getByText('The Matrix')).toHaveCount(0);
  });
});
