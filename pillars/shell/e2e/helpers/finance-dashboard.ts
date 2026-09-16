/**
 * Every `/finance-api` read the Finance dashboard fires on mount, answered
 * empty.
 *
 * Any spec that lands on the Finance dashboard without being about it needs
 * these: `/` redirects there because Finance is the first installed pillar,
 * and `/finance` is the pillar's own base path. Both `global-search.spec.ts`
 * (whose subject is the top bar above the dashboard) and
 * `pops-apps-finance-only-install-set.spec.ts` (whose subject is the rail
 * beside it) mount it incidentally, so the stubs live here rather than in
 * either of them.
 *
 * Not in `pillar-rest.ts`: that module's contract is the surface the SHELL
 * itself talks to on every load, whichever pillar a spec is about. These are
 * one pillar's page-level reads.
 */
import { z } from 'zod';

import { AccountsListResponseSchema } from './finance-accounts';
import { stubImportDrafts } from './finance-import-drafts';
import { fulfilWith } from './pillar-rest';

import type { Page } from '@playwright/test';

const PagedListResponseSchema = z
  .object({
    data: z.array(z.unknown()),
    pagination: z
      .object({ total: z.number(), limit: z.number(), offset: z.number(), hasMore: z.boolean() })
      .strict(),
  })
  .strict();

/**
 * Stub the accounts, import-drafts, transactions and budgets reads the
 * dashboard mounts with, each returning a valid empty page.
 *
 * Register before the navigation that lands on the dashboard.
 */
export async function stubFinanceDashboardEmpty(page: Page): Promise<void> {
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
