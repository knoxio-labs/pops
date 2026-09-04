/**
 * Smoke test — Finance import wizard happy path
 *
 * Walks the full 8-step import wizard end-to-end with a
 * 2-transaction CSV where the backend is fully mocked via `page.route()`:
 *
 *   1. Upload CSV         → parsed client-side (no REST call)
 *   2. Map Columns        → auto-detected mapping, confirm via Next
 *   3. Processing         → polls GET /imports/progress until `completed`
 *   4. Review             → both transactions land in Matched tab
 *   5. Tag Review         → no edits, continue
 *   6. Create Rules       → skip (no patterns in mocked data)
 *   7. Final Review       → Approve & Commit All
 *   8. Summary            → "Import Complete" with 2 transactions imported
 *
 * Why mocked:
 *   The import wizard orchestrates many REST endpoints across the finance and
 *   core pillars. Exercising them against real pillar backends in CI would be
 *   slow and flaky (and the backends are not started for e2e); the Tier-1 goal
 *   here is the UI flow, not the backend plumbing. All endpoints are stubbed
 *   via `page.route()` — no DB writes.
 *
 * The wizard reads its data via the generated finance/contacts Hey API clients
 * (`@pops/app-finance`), which target the shell's `/finance-api` and
 * `/contacts-api` proxy paths (the prefix is stripped before forwarding). Each
 * route returns the plain REST body the Hey client unwraps — NOT a tRPC
 * `{ result: { data } }` envelope.
 *
 * Endpoints mocked (happy path):
 *   POST /finance-api/imports/process              → { sessionId }
 *   GET  /finance-api/imports/progress             → { status:'completed', result:{matched:[…2…]} }
 *   POST /finance-api/imports/commit               → { data:{ transactionsImported:2 … }, message }
 *   GET  /contacts-api/entities                    → { data:[], pagination }
 *   GET  /finance-api/transactions/available-tags  → { tags:[] }
 *   GET  /finance-api/accounts                     → { data:[…1 account…], pagination }
 *   GET  /finance-api/institutions                 → { data:[] }
 *
 * The last two are POPS-2840: the Upload step now opens on a real account
 * picker (`useAllAccounts`) before the file dropzone appears at all, so the
 * walk below picks the one mocked account before touching the file input.
 *
 * Crash detection is wired via beforeEach/afterEach so the test also
 * verifies the wizard doesn't throw uncaught errors during the full flow.
 */
import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { fulfilWith, stubShellBoot } from './helpers/pillar-rest';

import type { Page } from '@playwright/test';

const PROCESS_SESSION_ID = 'e2e-process-session';

/**
 * `/finance-api/imports/*` and `/finance-api/transactions/available-tags`
 * response shapes, hand-mirrored from the finance pillar's own zod schemas
 * (`src/contract/rest-imports-schemas.ts`: `SessionIdSchema`,
 * `ImportProgressSchema`, `CommitResultSchema`) rather than imported.
 * `shell-no-cross-internal` (`.dependency-cruiser.cjs`) lets the shell import
 * only another pillar's `@pops/app-<id>` UI package via its `index.ts`
 * entrypoint — not that pillar's own `@pops/<id>` contract package, so
 * `@pops/finance`'s exported types (`CommitResult`, `SessionId`, …) are not
 * reachable from here either. There is no generated-Hey-API-client shortcut
 * available for these types like `pillar-rest.ts` uses for the shell's own
 * `registry-api`, because that client lives in `@pops/app-finance`'s
 * `app/src`, past the entrypoint the same rule forbids.
 */
const ProcessSessionResponseSchema = z.object({ sessionId: z.string() }).strict();

const TRANSACTION_MATCH_TYPES = [
  'alias',
  'exact',
  'prefix',
  'contains',
  'ai',
  'learned',
  'manual',
  'none',
] as const;

const EntityMatchSchema = z
  .object({
    entityId: z.string().optional(),
    entityName: z.string().optional(),
    matchType: z.enum(TRANSACTION_MATCH_TYPES),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

const ParsedTransactionSchema = z
  .object({
    date: z.string(),
    description: z.string(),
    amount: z.number(),
    account: z.string(),
    location: z.string().optional(),
    rawRow: z.string(),
    checksum: z.string(),
  })
  .strict();

const TRANSACTION_TYPES = [
  'purchase',
  'transfer',
  'income',
  'refund',
  'reversal',
  'loan',
  'rebate',
  'tax',
  'fee',
] as const;

const ProcessedTransactionSchema = ParsedTransactionSchema.extend({
  entity: EntityMatchSchema,
  status: z.enum(['matched', 'uncertain', 'failed', 'skipped']),
  skipReason: z.string().optional(),
  error: z.string().optional(),
  transactionType: z.enum(TRANSACTION_TYPES).optional(),
  suggestedTags: z
    .array(
      z
        .object({
          tag: z.string(),
          source: z.enum(['ai', 'rule', 'entity']),
          pattern: z.string().optional(),
          isNew: z.boolean().optional(),
        })
        .strict()
    )
    .optional(),
  ruleProvenance: z
    .object({
      source: z.literal('correction'),
      ruleId: z.string().min(1),
      pattern: z.string().min(1),
      matchType: z.enum(['exact', 'contains', 'regex']),
      confidence: z.number().min(0).max(1),
    })
    .strict()
    .optional(),
  matchedRules: z
    .array(
      z
        .object({
          ruleId: z.string().min(1),
          pattern: z.string().min(1),
          matchType: z.enum(['exact', 'contains', 'regex']),
          confidence: z.number().min(0).max(1),
          priority: z.number(),
          entityId: z.string().nullable().optional(),
          entityName: z.string().nullable().optional(),
        })
        .strict()
    )
    .optional(),
}).strict();

const ProcessImportOutputSchema = z
  .object({
    matched: z.array(ProcessedTransactionSchema),
    uncertain: z.array(ProcessedTransactionSchema),
    failed: z.array(ProcessedTransactionSchema),
    skipped: z.array(ProcessedTransactionSchema),
    warnings: z
      .array(
        z
          .object({
            type: z.enum(['AI_CATEGORIZATION_UNAVAILABLE', 'AI_API_ERROR']),
            message: z.string(),
            affectedCount: z.number().optional(),
            details: z.string().optional(),
          })
          .strict()
      )
      .optional(),
    aiUsage: z
      .object({
        apiCalls: z.number(),
        cacheHits: z.number(),
        totalInputTokens: z.number(),
        totalOutputTokens: z.number(),
        totalCostUsd: z.number(),
        avgCostPerCall: z.number(),
      })
      .strict()
      .optional(),
  })
  .strict();

const ImportProgressResponseSchema = z
  .object({
    sessionId: z.string(),
    status: z.enum(['processing', 'completed', 'failed']),
    currentStep: z.enum(['deduplicating', 'matching']),
    totalTransactions: z.number(),
    processedCount: z.number(),
    currentBatch: z.array(
      z
        .object({
          description: z.string(),
          status: z.enum(['processing', 'success', 'failed']),
          error: z.string().optional(),
        })
        .strict()
    ),
    errors: z.array(z.object({ description: z.string(), error: z.string() }).strict()),
    startedAt: z.string(),
    result: ProcessImportOutputSchema.optional(),
  })
  .strict();

const CommitResponseSchema = z
  .object({
    data: z
      .object({
        entitiesCreated: z.number().int().nonnegative(),
        rulesApplied: z
          .object({
            add: z.number().int().nonnegative(),
            edit: z.number().int().nonnegative(),
            disable: z.number().int().nonnegative(),
            remove: z.number().int().nonnegative(),
          })
          .strict(),
        tagRulesApplied: z.number().int().nonnegative(),
        transactionsImported: z.number().int().nonnegative(),
        transactionsFailed: z.number().int().nonnegative(),
        failedDetails: z.array(
          z.object({ checksum: z.string().nullable(), error: z.string() }).strict()
        ),
        retroactiveReclassifications: z.number().int().nonnegative(),
      })
      .strict(),
    message: z.string(),
  })
  .strict();

/**
 * `GET /finance-api/transactions/available-tags` — the finance router
 * (`rest-transactions.ts`, `availableTags`) validates the same
 * `z.object({ tags: z.array(z.string()) })` inline; not a named export, so
 * hand-defined here rather than pinned to an imported type.
 */
const AvailableTagsResponseSchema = z.object({ tags: z.array(z.string()) }).strict();

/**
 * `GET /contacts-api/entities` — contacts is a separate (Rust) pillar with no
 * TS contract package; hand-defined from its committed OpenAPI
 * (`pillars/contacts/openapi/contacts.openapi.json`, `Entity` /
 * `PaginationMeta` schemas) rather than pinned to a generated type, the same
 * way `pillar-rest.ts` hand-defines `/pillars` and `/pillars/health`.
 */
const EntitiesListResponseSchema = z
  .object({
    data: z.array(z.record(z.string(), z.unknown())),
    pagination: z
      .object({
        total: z.number(),
        limit: z.number(),
        offset: z.number(),
        hasMore: z.boolean(),
      })
      .strict(),
  })
  .strict();

/**
 * `GET /finance-api/accounts` — hand-mirrored from `rest-accounts.ts`'s
 * `AccountSchema` / `financeAccountsContract.list` response, for the same
 * cross-pillar-import reason the other per-spec schemas above are hand-mirrored
 * rather than imported.
 */
const AccountsListResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          institutionId: z.string().nullable(),
          kind: z.string(),
          currency: z.string(),
          archivedAt: z.string().nullable(),
          displayOrder: z.number().int(),
          entityId: z.string().nullable(),
          entityDisplayName: z.string().nullable(),
          entityDisplayNameStale: z.boolean(),
          createdAt: z.string(),
          updatedAt: z.string(),
        })
        .strict()
    ),
    pagination: z
      .object({ total: z.number(), limit: z.number(), offset: z.number(), hasMore: z.boolean() })
      .strict(),
  })
  .strict();

/** `GET /finance-api/institutions` — mirrors `rest-institutions.ts`'s `InstitutionSchema`. */
const InstitutionsListResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          colour: z.string(),
          logoAssetId: z.string().nullable(),
          createdAt: z.string(),
          updatedAt: z.string(),
        })
        .strict()
    ),
  })
  .strict();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Two matched transactions so the Review step auto-lands on the Matched tab. */
const matchedTransactions = [
  {
    date: '2026-02-13',
    description: 'WOOLWORTHS 1234',
    amount: -125.5,
    account: 'Amex',
    rawRow: '{}',
    checksum: 'chk-woolworths-001',
    entity: {
      entityId: 'entity-woolworths',
      entityName: 'Woolworths',
      matchType: 'prefix' as const,
    },
    status: 'matched' as const,
  },
  {
    date: '2026-02-14',
    description: 'NETFLIX.COM',
    amount: -19.99,
    account: 'Amex',
    rawRow: '{}',
    checksum: 'chk-netflix-001',
    entity: {
      entityId: 'entity-netflix',
      entityName: 'Netflix',
      matchType: 'contains' as const,
    },
    status: 'matched' as const,
  },
];

const processedOutput = {
  matched: matchedTransactions,
  uncertain: [],
  failed: [],
  skipped: [],
  warnings: [],
};

function progressBody(result: z.infer<typeof ProcessImportOutputSchema>) {
  return {
    sessionId: PROCESS_SESSION_ID,
    status: 'completed' as const,
    startedAt: '2026-02-14T00:00:00.000Z',
    totalTransactions: 2,
    processedCount: 2,
    currentStep: 'matching' as const,
    currentBatch: [],
    errors: [],
    result,
  };
}

const commitBody = {
  data: {
    entitiesCreated: 0,
    rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
    tagRulesApplied: 0,
    transactionsImported: 2,
    transactionsFailed: 0,
    failedDetails: [],
    retroactiveReclassifications: 0,
  },
  message: 'Import committed',
};

const emptyEntitiesBody = {
  data: [],
  pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
};

/** The one account the Upload step's account picker offers. */
const accountsBody = {
  data: [
    {
      id: 'acc-amex',
      name: 'Amex Everyday',
      institutionId: null,
      kind: 'credit-card',
      currency: 'AUD',
      archivedAt: null,
      displayOrder: 0,
      entityId: null,
      entityDisplayName: null,
      entityDisplayNameStale: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
};

const institutionsBody = { data: [] };

async function setupMocks(page: Page): Promise<void> {
  await page.route(
    '**/finance-api/imports/process',
    fulfilWith(
      200,
      ProcessSessionResponseSchema,
      { sessionId: PROCESS_SESSION_ID },
      'imports.process'
    )
  );
  await page.route(
    '**/finance-api/imports/progress?**',
    fulfilWith(200, ImportProgressResponseSchema, progressBody(processedOutput), 'imports.progress')
  );
  await page.route(
    '**/finance-api/imports/commit',
    fulfilWith(200, CommitResponseSchema, commitBody, 'imports.commit')
  );
  await page.route(
    '**/contacts-api/entities?**',
    fulfilWith(200, EntitiesListResponseSchema, emptyEntitiesBody, 'contacts.entities')
  );
  await page.route(
    '**/finance-api/transactions/available-tags',
    fulfilWith(200, AvailableTagsResponseSchema, { tags: [] }, 'transactions.availableTags')
  );
  await page.route(
    '**/finance-api/accounts?**',
    fulfilWith(200, AccountsListResponseSchema, accountsBody, 'accounts.list')
  );
  await page.route(
    '**/finance-api/institutions',
    fulfilWith(200, InstitutionsListResponseSchema, institutionsBody, 'institutions.list')
  );
}

/** Picks the one mocked account so the Upload step's file dropzone appears. */
async function pickAccount(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Account to import into' }).click();
  await page.getByText('Amex Everyday').click();
}

const csvContent = `Date,Description,Amount
13/02/2026,WOOLWORTHS 1234,125.50
14/02/2026,NETFLIX.COM,19.99`;

test.describe('Finance — import wizard happy path (mocked)', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    // Register listeners before navigation so first-load errors are captured.
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await setupMocks(page);
    await stubShellBoot(page);
    await page.goto('/finance/import');
    await expect(page.getByRole('heading', { name: 'Upload CSV' })).toBeVisible();
    await pickAccount(page);
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
  });

  test('walks upload → map → process → review → tags → commit → summary', async ({ page }) => {
    // Step 1: Upload CSV — the <input type="file"> sits inside the drop zone.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'amex-feb-2026.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });
    // The selected-file card shows the filename once accepted.
    await expect(page.getByText('amex-feb-2026.csv')).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();

    // Step 2: Map Columns — autoDetectColumns maps Date/Description/Amount.
    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible();
    await expect(page.locator('select[name="date"]')).toHaveValue('Date');
    await expect(page.locator('select[name="description"]')).toHaveValue('Description');
    await expect(page.locator('select[name="amount"]')).toHaveValue('Amount');
    await page.getByRole('button', { name: /^next$/i }).click();

    // Step 3: Processing — polls progress until status=completed, then auto-advances.
    // Wait for the Review heading to confirm polling worked.
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();

    // Step 4: Review — both transactions land in Matched (2).
    // TabsTrigger labels render as "Matched (2)", etc.
    await expect(page.getByRole('tab', { name: /matched.*\(2\)/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /uncertain.*\(0\)/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /failed.*\(0\)/i })).toBeVisible();

    // Both matched transactions are visible in the Matched tabpanel.
    const matchedPanel = page.getByRole('tabpanel');
    await expect(matchedPanel.getByText('WOOLWORTHS 1234').first()).toBeVisible();
    await expect(matchedPanel.getByText('NETFLIX.COM').first()).toBeVisible();

    // Continue to Tag Review — button label is "Continue to Tag Review (2)".
    await page.getByRole('button', { name: /continue to tag review/i }).click();

    // Step 5: Tag Review — no changes, continue.
    await expect(page.getByRole('heading', { name: 'Tag Review' })).toBeVisible();
    await page.getByRole('button', { name: /continue to final review/i }).click();

    // Step 6: Create Rules — no patterns in mocked test, skip.
    await page.getByRole('button', { name: /^skip$/i }).click();

    // Step 7: Final Review — approve, then confirm. The wizard puts an
    // irreversible write behind a confirmation whose button carries the same
    // label as the one that opened it, so the second click is scoped to the
    // dialog rather than matched by name alone.
    await expect(page.getByRole('heading', { name: 'Final Review' })).toBeVisible();
    await page.getByRole('button', { name: /approve & commit all/i }).click();
    const commitConfirm = page.getByRole('alertdialog', { name: /commit this import/i });
    await commitConfirm.getByRole('button', { name: /approve & commit all/i }).click();

    // Step 8: Summary — wizard auto-advances on commit success, no Continue click.
    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible();
    await expect(page.getByText('Transactions Imported')).toBeVisible();
    // The SummaryCard for imported transactions shows the value "2".
    await expect(page.getByRole('button', { name: /new import/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /view transactions/i })).toBeVisible();
  });

  // Regression test for #3621: a manual column-mapping override used to be
  // silently wiped when the user clicked Back then Next without reselecting
  // the file, because UploadStep re-parses the CSV into a fresh array on
  // every Next click and ColumnMapStep's auto-detect effect re-ran on that
  // remount, clobbering the override with the auto-detected default.
  test('keeps a manual column-mapping override after Back then Next without reselecting the file', async ({
    page,
  }) => {
    const ambiguousDateCsv = `Date,Description,Amount,Value Date
13/02/2026,WOOLWORTHS 1234,125.50,14/02/2026`;

    await page.locator('input[type="file"]').setInputFiles({
      name: 'ambiguous-date.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(ambiguousDateCsv),
    });
    await expect(page.getByText('ambiguous-date.csv')).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();

    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible();
    // Auto-detect picks the first date-ish header.
    await expect(page.locator('select[name="date"]')).toHaveValue('Date');

    // The user overrides it to the other date column.
    await page.locator('select[name="date"]').selectOption('Value Date');
    await expect(page.locator('select[name="date"]')).toHaveValue('Value Date');

    // Back to Upload (file stays selected — no reselect) then Next again,
    // re-parsing the same CSV and remounting Map Columns.
    await page.getByRole('button', { name: /^back$/i }).click();
    await expect(page.getByText('ambiguous-date.csv')).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();

    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible();
    await expect(page.locator('select[name="date"]')).toHaveValue('Value Date');
  });
});
