/**
 * Federated search — the top bar against the orchestrator's REST surface.
 *
 * `useSearchInputData` (`libs/navigation`) posts to
 * `/orchestrator-api/search` and renders the `{ sections }` envelope it gets
 * back, dropping any section whose owning module this build did not mount.
 * The install-set half of that filter is asserted in the finance-only spec;
 * here the shell mounts everything, so what is under test is the round trip:
 * typing issues the POST, and the sections that come back become the panel.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  CROSS_MODULE_SEARCH_SECTIONS,
  SEARCH_QUERY,
  stubOrchestratorSearch,
  stubShellBoot,
} from './helpers/pillar-rest';

function searchBox(page: Page) {
  return page.getByRole('textbox', { name: 'Search POPS' });
}

test.describe('Shell — federated search', () => {
  test.beforeEach(async ({ page }) => {
    await stubShellBoot(page);
    await page.goto('/');
    await expect(searchBox(page)).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('typing posts the query to the orchestrator and renders its sections', async ({ page }) => {
    await stubOrchestratorSearch(page, CROSS_MODULE_SEARCH_SECTIONS);

    // Captured from the wire rather than asserted on the stub's arguments:
    // the point of the test is that the shell sends the orchestrator's
    // documented body, and only the real request can say whether it did.
    const posted = page.waitForRequest(
      (request) => request.url().includes('/orchestrator-api/search') && request.method() === 'POST'
    );

    await searchBox(page).fill(SEARCH_QUERY);

    const body: unknown = (await posted).postDataJSON();
    expect(body).toMatchObject({ query: { text: SEARCH_QUERY } });

    const panel = page.getByTestId('search-results-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('section-movies')).toBeVisible();
    await expect(panel.getByTestId('section-transactions')).toBeVisible();
    await expect(panel.getByText('The Matrix')).toBeVisible();
  });

  test('a section for an unmounted module is dropped', async ({ page }) => {
    await stubOrchestratorSearch(page, [
      ...CROSS_MODULE_SEARCH_SECTIONS,
      {
        domain: 'sightings',
        moduleId: 'not-a-pillar',
        hits: [{ uri: 'pops://ghost/sighting/1', data: { title: 'Ghost result' } }],
      },
    ]);

    await searchBox(page).fill(SEARCH_QUERY);

    const panel = page.getByTestId('search-results-panel');
    await expect(panel.getByTestId('section-movies')).toBeVisible();
    await expect(panel.getByTestId('section-sightings')).toHaveCount(0);
    await expect(panel.getByText('Ghost result')).toHaveCount(0);
  });

  test('an orchestrator outage leaves the shell usable', async ({ page }) => {
    await page.route(/\/orchestrator-api\/search$/, (route) => route.abort('failed'));

    await searchBox(page).fill(SEARCH_QUERY);

    await expect(searchBox(page)).toHaveValue(SEARCH_QUERY);
    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
  });
});
