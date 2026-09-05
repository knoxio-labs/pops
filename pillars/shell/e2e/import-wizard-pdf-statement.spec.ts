/**
 * Finance import wizard — the PDF statement path, in a real browser
 * (POPS-2539).
 *
 * `extractPdfText` has a thorough unit suite, and every case in it runs
 * pdf.js on the main thread: under Node and jsdom pdf.js sets `workerSrc`
 * itself and never constructs a `Worker`. In a browser the same call takes a
 * different path — `new Worker(url, { type: 'module' })` against a bundled
 * asset URL — and nothing else exercises it. The asset was once served with
 * the wrong MIME type by the production image (POPS-2501 / POPS-2538) and no
 * test could have said so.
 *
 * This spec drives the wizard against the shell with a synthetic one-page
 * statement, and holds three things that the unit suite structurally cannot:
 *
 *   1. the worker asset is actually fetched — pdf.js reached the worker path;
 *   2. no console error, and no worker warning, was logged — pdf.js falls
 *      back to a "fake worker" on the main thread when the real one fails
 *      to start, so a run that only checked the transactions appeared would
 *      pass with the worker dead;
 *   3. the findings panel reports what the statement said.
 *
 * The web server behind this project is Vite in dev mode, so what this
 * proves is the worker path in the bundle: the asset resolves, parses as a
 * module and does the work. The production image's MIME configuration is a
 * different layer (POPS-2538).
 *
 * Endpoints mocked:
 *   GET /finance-api/accounts            → one ANZ credit card (POPS-2840)
 *   GET /finance-api/institutions        → ANZ
 *   GET /finance-api/accounts/:id        → its import status, whose `span`
 *                                          is what the overlap check reads
 *                                          (POPS-2504)
 */
import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { AccountSchema, stubFinanceAccount } from './helpers/finance-accounts';
import { fulfilWith, stubShellBoot } from './helpers/pillar-rest';
import { statementPdf, type StatementRow } from './helpers/synthetic-pdf';

import type { Page } from '@playwright/test';

const account = {
  id: 'acc-anz-cc',
  name: 'ANZ Frequent Flyer Black',
  institutionId: 'inst-anz',
  kind: 'credit-card',
  currency: 'AUD',
  archivedAt: null,
  displayOrder: 0,
  entityId: null,
  entityDisplayName: null,
  entityDisplayNameStale: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const institution = {
  id: 'inst-anz',
  name: 'ANZ',
  colour: '#0b5fff',
  logoAssetId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * `GET /finance-api/accounts/:id` — `AccountSchema` plus the `importStatus`
 * the wizard's overlap check reads (`rest-account-imports-schemas.ts`,
 * `ImportStatusSchema`). Only the fields this spec drives are pinned.
 */
const AccountGetResponseSchema = z
  .object({
    data: AccountSchema.extend({
      importStatus: z
        .object({
          lastImportAt: z.string().nullable(),
          lastBatchId: z.string().nullable(),
          newestTransactionDate: z.string().nullable(),
          span: z.object({ from: z.string(), to: z.string() }).strict().nullable(),
          cadenceDays: z.number().int().nonnegative().nullable(),
          source: z.null(),
        })
        .strict(),
    }).strict(),
  })
  .strict();

/** The account already holds February; the March row is what is left to import. */
const accountGetBody = {
  data: {
    ...account,
    importStatus: {
      lastImportAt: '2026-03-01T00:00:00.000Z',
      lastBatchId: 'batch-feb',
      newestTransactionDate: '2024-02-29',
      span: { from: '2024-02-01', to: '2024-02-29' },
      cadenceDays: null,
      source: null,
    },
  },
};

const FEBRUARY_GROCER: StatementRow = {
  processed: '01/03/2024',
  transacted: '28/02/2024',
  merchant: 'ALDI STORES - MARRICKV',
  detail: 'MARRICKVILLE',
  amount: '42.10',
  balance: '1,234.56',
};

const MARCH_COFFEE: StatementRow = {
  processed: '07/03/2024',
  transacted: '05/03/2024',
  merchant: 'COFFEE SUPPLY CO',
  detail: 'NEWTOWN',
  amount: '8.50',
  balance: '1,243.06',
};

async function setupMocks(page: Page): Promise<void> {
  await stubFinanceAccount(page, account, institution);
  await page.route(
    `**/finance-api/accounts/${account.id}`,
    fulfilWith(200, AccountGetResponseSchema, accountGetBody, 'accounts.get')
  );
}

test.describe('Finance — import wizard PDF statement path (mocked)', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];
  let workerWarnings: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    workerWarnings = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
      // pdf.js reports a worker that failed to start as a warning and carries
      // on without it; that is the quiet failure this spec exists to catch.
      if (msg.type() === 'warning' && /worker/i.test(msg.text())) workerWarnings.push(msg.text());
    });
    await setupMocks(page);
    await stubShellBoot(page);
    await page.goto('/finance/import');
    await page.getByRole('combobox', { name: 'Account to import into' }).click();
    await page.getByText(account.name).click();
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
    expect(workerWarnings).toHaveLength(0);
  });

  test('reads a statement through the pdf.js worker and reports its findings', async ({ page }) => {
    const workerFetched = page.waitForRequest((request) => /pdf\.worker/.test(request.url()));

    await page.locator('input[type="file"]').setInputFiles({
      name: 'anz-statement-march-2024.pdf',
      mimeType: 'application/pdf',
      buffer: statementPdf([FEBRUARY_GROCER, MARCH_COFFEE]),
    });
    await expect(page.getByText('anz-statement-march-2024.pdf')).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();

    await workerFetched;

    await expect(page.getByText('Read 1 transaction from 1 page across 1 file.')).toBeVisible();
    await expect(page.getByText('1 transaction withheld as already imported')).toBeVisible();
    await expect(page.getByLabel('Withheld transactions')).toContainText('ALDI STORES - MARRICKV');
    await expect(
      page.getByText('Overlap with existing transactions was not checked')
    ).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 1 transaction' })).toBeVisible();
  });
});
