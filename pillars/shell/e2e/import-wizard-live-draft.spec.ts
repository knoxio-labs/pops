/**
 * Smoke test — Finance import wizard, a live Up draft (mocked)
 *
 * Walks the import wizard from a draft that was **already staged** against an
 * account, the way the Up webhook or a sync leaves one: no file, no dialect,
 * and no process session.
 *
 *   1. Review  → the wizard opens here; there is no Upload or Map step
 *   2. Review  → accept an AI suggestion, which opens the correction proposal
 *   3. Dialog  → `Apply ChangeSet` is ENABLED and applying stages the rule
 *   4. Tags    → no edits, continue
 *   5. Rules   → skip
 *   6. Commit  → Approve & Commit All, then confirm
 *   7. Summary → "Import Complete", and the commit carried the staged rule
 *
 * Why this spec exists (POPS-3361):
 *   Every other import spec opens with `setInputFiles`. A file is the one
 *   thing this path does not have, so the source-derived steps and the
 *   no-session shape they produce were unvisited by any automated test —
 *   which is how POPS-3358 shipped with `Apply ChangeSet` permanently
 *   disabled for every live import. The assertion at step 3 is that bug's
 *   regression test.
 *
 * Why the draft is seeded through the route stubs rather than created:
 *   `POST /import-drafts` cannot make a live draft. It hardcodes
 *   `sourceKind: 'file'` and requires a non-empty `fileNames`, because live
 *   drafts are minted server-side by the Up path and never created over REST.
 *   `stubLiveImportDraft` therefore answers the `GET` the wizard hydrates
 *   from, and the spec asserts no create was ever attempted — a POST to that
 *   route would mean the wizard had taken the file path after all.
 *
 * Why mocked:
 *   Same reason as `import-wizard-happy-path.spec.ts`: no pillar backend runs
 *   for e2e, so every endpoint is stubbed via `page.route()` and no DB is
 *   written. The ledger row and the minted checkpoint this commit would
 *   produce are therefore not observable from here; what is asserted instead
 *   is the commit *request* the wizard built, which is real client output.
 *   Asserting the rows themselves needs a backend tier (POPS-3366).
 *
 * Endpoints mocked:
 *   GET  /finance-api/import-drafts/:id             → the staged live draft
 *   POST /finance-api/corrections/analyze           → a rule from the signal
 *   POST /finance-api/corrections/propose-changeset → the proposed ChangeSet
 *   POST /finance-api/corrections/preview-changeset → its match impact
 *   GET  /finance-api/transactions/descriptions-preview → DB rows for preview
 *   GET  /finance-api/transactions/available-tags   → { tags: [] }
 *   POST /finance-api/imports/commit                → the commit result
 *   GET  /contacts-api/entities                     → the one known merchant
 *   GET  /finance-api/accounts                      → the one account
 */
import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { AccountsListResponseSchema } from './helpers/finance-accounts';
import {
  type DraftTraffic,
  LIVE_DRAFT_ID,
  type LiveDraftSeed,
  stubLiveImportDraft,
} from './helpers/finance-import-drafts';
import { fulfilWith, stubShellBoot } from './helpers/pillar-rest';

import type { Page } from '@playwright/test';

const ACCOUNT_ID = 'acc-up-everyday';

/**
 * `/finance-api/corrections/*` and `/finance-api/transactions/*` response
 * shapes, hand-mirrored from the finance pillar's own zod schemas
 * (`src/contract/rest-corrections-schemas.ts`,
 * `src/contract/rest-corrections-ai-schemas.ts`,
 * `src/contract/rest-transactions.ts`) rather than imported — the shell may
 * only reach another pillar through its `@pops/app-<id>` entrypoint, so
 * `@pops/finance`'s contract package is not resolvable here. See the same
 * note in `import-wizard-happy-path.spec.ts`.
 */
const MatchTypeSchema = z.enum(['exact', 'contains', 'regex']);

const CorrectionAnalysisResponseSchema = z
  .object({
    data: z
      .object({
        matchType: MatchTypeSchema,
        pattern: z.string(),
        confidence: z.number(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const ClassificationOutcomeSchema = z
  .object({
    ruleId: z.string().nullable(),
    entityId: z.string().nullable(),
    entityName: z.string().nullable(),
    location: z.string().nullable(),
    tags: z.array(z.string()),
    transactionType: z.string().nullable(),
  })
  .strict();

const ChangeSetProposalResponseSchema = z
  .object({
    changeSet: z
      .object({
        source: z.string().optional(),
        reason: z.string().optional(),
        ops: z
          .array(
            z
              .object({
                op: z.literal('add'),
                data: z.record(z.string(), z.unknown()),
              })
              .strict()
          )
          .min(1),
      })
      .strict(),
    rationale: z.string(),
    preview: z
      .object({
        counts: z
          .object({
            affected: z.number().int().nonnegative(),
            entityChanges: z.number().int().nonnegative(),
            locationChanges: z.number().int().nonnegative(),
            tagChanges: z.number().int().nonnegative(),
            typeChanges: z.number().int().nonnegative(),
          })
          .strict(),
        affected: z.array(
          z
            .object({
              transactionId: z.string(),
              description: z.string(),
              before: ClassificationOutcomeSchema,
              after: ClassificationOutcomeSchema,
            })
            .strict()
        ),
      })
      .strict(),
    targetRules: z.record(z.string(), z.unknown()),
  })
  .strict();

const PreviewChangeSetResponseSchema = z
  .object({
    diffs: z.array(
      z
        .object({
          checksum: z.string().optional(),
          description: z.string(),
          before: z
            .object({
              matched: z.boolean(),
              status: z.enum(['matched', 'uncertain']).nullable(),
              ruleId: z.string().nullable(),
              confidence: z.number().nullable(),
            })
            .strict(),
          after: z
            .object({
              matched: z.boolean(),
              status: z.enum(['matched', 'uncertain']).nullable(),
              ruleId: z.string().nullable(),
              confidence: z.number().nullable(),
            })
            .strict(),
          changed: z.boolean(),
        })
        .strict()
    ),
    summary: z
      .object({
        total: z.number().int().nonnegative(),
        newMatches: z.number().int().nonnegative(),
        removedMatches: z.number().int().nonnegative(),
        statusChanges: z.number().int().nonnegative(),
        netMatchedDelta: z.number().int(),
      })
      .strict(),
  })
  .strict();

const DescriptionsPreviewResponseSchema = z
  .object({
    data: z.array(z.object({ description: z.string(), checksum: z.string().nullable() }).strict()),
    total: z.number(),
    truncated: z.boolean(),
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
        checkpoints: z.array(z.record(z.string(), z.unknown())).optional(),
      })
      .strict(),
    message: z.string(),
  })
  .strict();

const AvailableTagsResponseSchema = z.object({ tags: z.array(z.string()) }).strict();

/**
 * `POST /contacts-api/entities/lookup` — the whole contact set's match columns
 * in one round-trip. Review verifies every AI suggestion against it, and an
 * unanswered lookup leaves the accept button saying it cannot verify the
 * merchant rather than offering to assign it.
 */
const EntityLookupResponseSchema = z
  .object({
    entities: z.array(
      z.object({ id: z.string(), name: z.string(), aliases: z.array(z.string()) }).strict()
    ),
    fetchedAt: z.string(),
  })
  .strict();

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

// ---------------------------------------------------------------------------
// Fixtures — the rows as the Up mapper staged them
// ---------------------------------------------------------------------------

/**
 * Both rows carry `dialectAccountLabel`, not a file dialect: a live draft is
 * mapped by the Up mapper on arrival, so there is nothing for the wizard to
 * parse or map. Amounts are debits so no row trips the forced-type prompt a
 * credit with no `transactionType` would raise.
 */
const woolworths = {
  date: '2026-09-08',
  description: 'WOOLWORTHS 1234 SYDNEY',
  amount: -125.5,
  dialectAccountLabel: 'Up',
  accountId: ACCOUNT_ID,
  rawRow: '{}',
  checksum: 'chk-live-woolworths',
};

const coles = {
  date: '2026-09-09',
  description: 'COLES 9999 NEWTOWN',
  amount: -42.5,
  dialectAccountLabel: 'Up',
  accountId: ACCOUNT_ID,
  rawRow: '{}',
  checksum: 'chk-live-coles',
};

/**
 * One row the arrival-time classification matched outright, one it was only
 * able to guess at. The guess is what puts an AI suggestion on the card, and
 * accepting it is what opens the correction proposal.
 */
const liveSeed: LiveDraftSeed = {
  accountId: ACCOUNT_ID,
  accountName: 'Up Everyday',
  parsedTransactions: [woolworths, coles],
  processedTransactions: {
    matched: [
      {
        ...woolworths,
        entity: {
          entityId: 'entity-woolworths',
          entityName: 'Woolworths',
          matchType: 'prefix' as const,
        },
        status: 'matched' as const,
        transactionType: 'purchase' as const,
      },
    ],
    uncertain: [
      {
        ...coles,
        entity: {
          entityId: 'entity-coles',
          entityName: 'Coles',
          matchType: 'ai' as const,
          confidence: 0.62,
        },
        status: 'uncertain' as const,
        transactionType: 'purchase' as const,
      },
    ],
    failed: [],
    skipped: [],
  },
  balanceReportedCents: 128_45,
};

/** The rule the proposal offers for the accepted suggestion. */
const proposedChangeSet = {
  source: 'correction-proposal',
  reason: 'Assign COLES rows to Coles',
  ops: [
    {
      op: 'add' as const,
      data: {
        descriptionPattern: 'COLES',
        matchType: 'contains' as const,
        entityId: 'entity-coles',
        entityName: 'Coles',
        tags: [],
      },
    },
  ],
};

const proposalBody = {
  changeSet: proposedChangeSet,
  rationale: 'Every COLES row in this import belongs to Coles.',
  preview: {
    counts: { affected: 1, entityChanges: 1, locationChanges: 0, tagChanges: 0, typeChanges: 0 },
    affected: [
      {
        transactionId: coles.checksum,
        description: coles.description,
        before: {
          ruleId: null,
          entityId: null,
          entityName: null,
          location: null,
          tags: [],
          transactionType: null,
        },
        after: {
          ruleId: 'temp:rule:1',
          entityId: 'entity-coles',
          entityName: 'Coles',
          location: null,
          tags: [],
          transactionType: null,
        },
      },
    ],
  },
  targetRules: {},
};

const previewBody = {
  diffs: [
    {
      checksum: coles.checksum,
      description: coles.description,
      before: { matched: false, status: 'uncertain' as const, ruleId: null, confidence: null },
      after: { matched: true, status: 'matched' as const, ruleId: 'temp:rule:1', confidence: 1 },
      changed: true,
    },
  ],
  summary: { total: 1, newMatches: 1, removedMatches: 0, statusChanges: 1, netMatchedDelta: 1 },
};

const commitBody = {
  data: {
    entitiesCreated: 0,
    rulesApplied: { add: 1, edit: 0, disable: 0, remove: 0 },
    tagRulesApplied: 0,
    transactionsImported: 2,
    transactionsFailed: 0,
    failedDetails: [],
    retroactiveReclassifications: 0,
    checkpoints: [
      {
        accountId: ACCOUNT_ID,
        balanceCents: liveSeed.balanceReportedCents,
        asOf: coles.date,
        source: 'import',
      },
    ],
  },
  message: 'Import committed',
};

/** The merchant the AI suggested already exists, so the accept button assigns rather than creates. */
const knownEntities = [
  { id: 'entity-woolworths', name: 'Woolworths', aliases: [] },
  { id: 'entity-coles', name: 'Coles', aliases: [] },
];

const entitiesBody = {
  data: knownEntities,
  pagination: { total: knownEntities.length, limit: 50, offset: 0, hasMore: false },
};

const accountsBody = {
  data: [
    {
      id: ACCOUNT_ID,
      name: 'Up Everyday',
      kind: 'transaction',
      currency: 'AUD',
      archivedAt: null,
      displayOrder: 0,
      entityId: 'ent-up',
      entityDisplayName: 'Up',
      entityDisplayNameStale: false,
      entityColour: '#f97316',
      entityAvatarAssetId: null,
      resolvedEntityId: 'ent-up',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
};

interface CommitRequestBody {
  draftId?: string;
  changeSets?: Array<{ ops: Array<{ op: string; data?: { descriptionPattern?: string } }> }>;
  transactions?: Array<{ checksum: string; entityName?: string }>;
  commitKey?: string;
}

let draftTraffic: DraftTraffic;
let commitRequest: CommitRequestBody | null;

async function setupMocks(page: Page): Promise<void> {
  commitRequest = null;
  draftTraffic = await stubLiveImportDraft(page, liveSeed);

  await page.route(
    '**/finance-api/corrections/analyze',
    fulfilWith(
      200,
      CorrectionAnalysisResponseSchema,
      { data: { matchType: 'contains', pattern: 'COLES', confidence: 0.9 } },
      'corrections.analyze'
    )
  );
  await page.route(
    '**/finance-api/corrections/propose-changeset',
    fulfilWith(200, ChangeSetProposalResponseSchema, proposalBody, 'corrections.proposeChangeSet')
  );
  await page.route(
    '**/finance-api/corrections/preview-changeset',
    fulfilWith(200, PreviewChangeSetResponseSchema, previewBody, 'corrections.previewChangeSet')
  );
  await page.route(
    '**/finance-api/transactions/descriptions-preview**',
    fulfilWith(
      200,
      DescriptionsPreviewResponseSchema,
      { data: [], total: 0, truncated: false },
      'transactions.descriptionsPreview'
    )
  );
  await page.route(
    '**/finance-api/transactions/available-tags',
    fulfilWith(200, AvailableTagsResponseSchema, { tags: [] }, 'transactions.availableTags')
  );
  await page.route('**/finance-api/imports/commit', (route) => {
    commitRequest = route.request().postDataJSON() as CommitRequestBody;
    return fulfilWith(200, CommitResponseSchema, commitBody, 'imports.commit')(route);
  });
  await page.route(
    '**/contacts-api/entities?**',
    fulfilWith(200, EntitiesListResponseSchema, entitiesBody, 'contacts.entities')
  );
  await page.route(
    '**/contacts-api/entities/lookup',
    fulfilWith(
      200,
      EntityLookupResponseSchema,
      { entities: knownEntities, fetchedAt: '2026-09-10T00:00:00.000Z' },
      'contacts.entitiesLookup'
    )
  );
  await page.route(
    '**/finance-api/accounts?**',
    fulfilWith(200, AccountsListResponseSchema, accountsBody, 'accounts.list')
  );
}

test.describe('Finance — import wizard from a staged live draft (mocked)', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await setupMocks(page);
    await stubShellBoot(page);
    await page.goto(`/finance/import?draft=${LIVE_DRAFT_ID}`);
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource') &&
        // Two React warnings this flow really does produce, named one by one
        // rather than filtered by a pattern so that anything else still fails
        // the spec. They are POPS-3367; when it lands, both entries here are
        // dead and go with it.
        !e.includes('while rendering a different component') &&
        !e.includes('Each child in a list should have a unique "key" prop')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('opens on review, applies a correction rule with no process session, and commits', async ({
    page,
  }) => {
    // Step 1: the wizard hydrates the staged draft and opens on Review. A file
    // import would be on Upload here; this run has no file to upload and no
    // columns to map, so `firstImportStep` floors it past both.
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Upload CSV' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Map Columns' })).toHaveCount(0);

    // The arrival-time classification put one row in each bucket.
    await expect(page.getByRole('tab', { name: /matched.*\(1\)/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /uncertain.*\(1\)/i })).toBeVisible();

    // Step 2: accept the AI suggestion on the uncertain row. Both merchants
    // are in contacts, so the button assigns rather than creates.
    await page.getByRole('tab', { name: /uncertain.*\(1\)/i }).click();
    const uncertainPanel = page.getByRole('tabpanel');
    await uncertainPanel.getByRole('button', { name: 'Expand' }).click();
    await expect(uncertainPanel.getByText('AI suggestion: Coles')).toBeVisible();
    await uncertainPanel.getByRole('button', { name: 'Assign to "Coles"' }).click();

    // Step 3: the correction proposal opens, seeds its ops from the proposed
    // ChangeSet, and previews their impact.
    const proposal = page.getByRole('dialog', { name: 'Correction proposal' });
    await expect(proposal).toBeVisible();

    // THE assertion this spec exists for (POPS-3358). This draft has no
    // process session and never will: its rows arrived pre-mapped and skipped
    // the Process step. `Apply ChangeSet` must still be pressable — gating it
    // on a session made every live import unable to apply a single rule.
    const apply = proposal.getByRole('button', { name: 'Apply ChangeSet' });
    await expect(apply).toBeEnabled();
    await apply.click();

    // Applying is local: the ChangeSet is staged in the import store and no
    // request is made, which is why it never needed a session.
    await expect(proposal).toBeHidden();
    const appliedToast = page.getByText('Rules applied locally');
    await expect(appliedToast).toBeVisible();
    // The toast sits over the wizard's own footer controls until it dismisses
    // itself, so wait it out rather than forcing a click through it. The
    // pointer is left where the Apply click put it, which can be inside the
    // toaster — and sonner holds a toast open while it is hovered — so move
    // it away first.
    await page.mouse.move(0, 0);
    await expect(appliedToast).toBeHidden({ timeout: 15_000 });

    // Accepting the suggestion moved the row into matched, so both rows carry
    // forward.
    await page.getByRole('button', { name: /continue to tag review/i }).click();

    // Step 4: Tag Review — nothing to change.
    await expect(page.getByRole('heading', { name: 'Tag Review' })).toBeVisible();
    await page.getByRole('button', { name: /continue to final review/i }).click();

    // Step 5: Create Rules — the tag-rule step has no patterns to offer.
    await page.getByRole('button', { name: /^skip$/i }).click();

    // Step 6: Final Review — approve, then confirm in the dialog, whose button
    // carries the same label as the one that opened it.
    await expect(page.getByRole('heading', { name: 'Final Review' })).toBeVisible();
    await page.getByRole('button', { name: /approve & commit all/i }).click();
    const commitConfirm = page.getByRole('alertdialog', { name: /commit this import/i });
    await commitConfirm.getByRole('button', { name: /approve & commit all/i }).click();

    // Step 7: Summary.
    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible();
    await expect(page.getByText('Transactions Imported')).toBeVisible();

    // The run never created a draft: it resumed the one the Up path staged. A
    // POST to `/import-drafts` here would mean the wizard had gone down the
    // file path after all, which is the thing this spec rules out.
    expect(draftTraffic.created).toBe(0);
    expect(page.url()).toContain(`draft=${LIVE_DRAFT_ID}`);

    // What the browser tier can assert about the commit is the request the
    // wizard built — the ledger row and the checkpoint it mints are not
    // observable without a backend (POPS-3366).
    expect(commitRequest).not.toBeNull();
    expect(commitRequest?.draftId).toBe(LIVE_DRAFT_ID);
    // The rule applied in review reached the commit, which is the whole point
    // of being able to press the button.
    expect(commitRequest?.changeSets).toHaveLength(1);
    expect(commitRequest?.changeSets?.[0]?.ops?.[0]?.data?.descriptionPattern).toBe('COLES');
    expect(commitRequest?.transactions?.map((t) => t.checksum).toSorted()).toEqual([
      coles.checksum,
      woolworths.checksum,
    ]);
  });
});
