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
import { z } from 'zod';

import { expect, test } from './fixtures/pillar-rest-guard';
import { AccountsListResponseSchema } from './helpers/finance-accounts';
import { stubImportDrafts } from './helpers/finance-import-drafts';
import {
  CROSS_MODULE_SEARCH_SECTIONS,
  fulfilWith,
  SEARCH_QUERY,
  stubOrchestratorSearch,
  stubShellBoot,
} from './helpers/pillar-rest';

import type { Page } from '@playwright/test';

function searchBox(page: Page) {
  return page.getByRole('textbox', { name: 'Search POPS' });
}

/**
 * Every `/finance-api` read the Finance dashboard fires on mount, answered
 * empty. `/` lands there — Finance is the first installed pillar — and this
 * file's subject is the search bar in the top bar above it, not the
 * dashboard underneath, so an empty, valid response is all any of these
 * need to be.
 */
const PagedListResponseSchema = z
  .object({
    data: z.array(z.unknown()),
    pagination: z
      .object({ total: z.number(), limit: z.number(), offset: z.number(), hasMore: z.boolean() })
      .strict(),
  })
  .strict();

async function stubFinanceDashboardEmpty(page: Page): Promise<void> {
  const emptyPage = { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } };
  await stubImportDrafts(page, 'acc-unused');
  await page.route(
    /\/finance-api\/accounts\?/,
    fulfilWith(200, AccountsListResponseSchema, emptyPage, 'accounts.list')
  );
  await page.route(
    /\/finance-api\/transactions\?/,
    fulfilWith(200, PagedListResponseSchema, emptyPage, 'transactions.list')
  );
  await page.route(
    /\/finance-api\/budgets\?/,
    fulfilWith(200, PagedListResponseSchema, emptyPage, 'budgets.list')
  );
}

test.describe('Shell — federated search', () => {
  test.beforeEach(async ({ page }) => {
    await stubShellBoot(page);
    await stubFinanceDashboardEmpty(page);
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
