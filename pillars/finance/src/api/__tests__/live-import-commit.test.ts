/**
 * POPS-3366: an API-tier integration test that committing a live (Up) import
 * draft writes the ledger rows and mints the reported-balance checkpoint —
 * split out of POPS-3361 because the browser E2E suite has no backend and
 * can only assert the commit *request* the wizard builds, never its DB
 * outcome (see `pillars/shell/e2e/import-wizard-live-draft.spec.ts`).
 *
 * The draft is minted the way production mints it — `syncUpAccount` against
 * a stubbed `UpBankClient` (the external boundary; nothing below it is
 * faked) — rather than inserted by hand, so this exercises the same
 * `stageMappedRows` path a real sync runs.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { upsertImportConfig } from '../../db/services/account-import-config.js';
import { getImportDraft } from '../../db/services/import-drafts.js';
import { createFinanceApiApp } from '../app.js';
import { readLiveDraftPayload } from '../modules/import-drafts/live-draft.js';
import { upAccount, upTransaction } from '../modules/up-bank/__tests__/fixtures.js';
import { syncUpAccount } from '../modules/up-bank/sync.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

import type { ConfirmedTransaction } from '../../contract/rest-imports-schemas.js';
import type {
  UpAccount,
  UpBankClient,
  UpTransaction,
  UpTransactionRange,
} from '../modules/up-bank/up-api.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  // Mirrors imports.test.ts: pin the categorizer off so `syncUpAccount`'s
  // classification pass (run while staging) never reaches out for a real
  // AI call off an ambient env var.
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-live-import-commit-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

/** In-memory Up: one account, whatever rows the test seeds. */
function fakeUp(rows: UpTransaction[], account: UpAccount = upAccount()): UpBankClient {
  return {
    ping: async () => ({ customerId: 'cust-1' }),
    listAccounts: async () => [account],
    getAccount: async (id) => {
      if (id !== account.id) throw new Error(`unknown Up account ${id}`);
      return account;
    },
    getTransaction: async (id) => {
      const found = rows.find((row) => row.id === id);
      if (!found) throw new Error(`unknown Up transaction ${id}`);
      return found;
    },
    listTransactions: async (_id: string, _range: UpTransactionRange) => rows,
  };
}

function transactionRows(accountId: string) {
  return financeDb.raw
    .prepare(
      'SELECT id, account_id AS accountId, date, tags FROM transactions WHERE account_id = ? ORDER BY date'
    )
    .all(accountId) as { id: string; accountId: string; date: string; tags: string }[];
}

function checkpointRows() {
  return financeDb.raw
    .prepare(
      'SELECT account_id AS accountId, balance_cents AS balanceCents, as_of AS asOf, source, source_ref AS sourceRef FROM account_checkpoints'
    )
    .all() as {
    accountId: string;
    balanceCents: number;
    asOf: string;
    source: string;
    sourceRef: string | null;
  }[];
}

function batchRows() {
  return financeDb.raw
    .prepare(
      'SELECT account_id AS accountId, source_kind AS sourceKind, source_ref AS sourceRef FROM import_batches'
    )
    .all() as { accountId: string; sourceKind: string; sourceRef: string | null }[];
}

describe('committing a live Up import draft (POPS-3366)', () => {
  it('writes one ledger row per staged transaction and mints the reported-balance checkpoint', async () => {
    const account = await client().accounts.create({
      name: 'Up Everyday',
      kind: 'savings',
      currency: 'AUD',
    });
    const accountId = account.data.id;
    upsertImportConfig(financeDb.db, {
      accountId,
      sourceKind: 'api',
      provider: 'up',
      externalAccountRef: 'up-acc-1',
      secretRef: 'UP_TOKEN',
    });

    const upClient = fakeUp(
      [
        upTransaction({
          id: 'a',
          description: 'COLES',
          cents: -1_200,
          createdAt: '2026-09-02T09:00:00+10:00',
        }),
        upTransaction({
          id: 'b',
          description: 'BUNNINGS',
          cents: -3_400,
          createdAt: '2026-09-04T09:00:00+10:00',
        }),
      ],
      upAccount({ balance: { currencyCode: 'AUD', value: '488.00', valueInBaseUnits: 48_800 } })
    );

    const sync = await syncUpAccount(financeDb.db, makeContactsFake(), {
      accountId,
      client: upClient,
      from: '2026-09-01',
      to: '2026-09-05',
      syncedAt: new Date('2026-09-06T00:00:00.000Z'),
    });
    expect(sync.staged).toBe(2);
    const draftId = sync.draftId;
    if (draftId === null) throw new Error('expected syncUpAccount to stage a live draft');

    // 2. The draft was minted the way production mints it, not inserted by
    // hand: `sourceKind`/`state` say it is the account's live collecting
    // draft, `processSessionId` is unset (nobody has opened the wizard on
    // it yet), and it carries the balance Up reported alongside the rows.
    const stagedDraft = getImportDraft(financeDb.db, draftId);
    expect(stagedDraft).toMatchObject({
      sourceKind: 'live',
      state: 'live',
      processSessionId: null,
      balanceReportedCents: 48_800,
    });

    const parsed = readLiveDraftPayload(stagedDraft!).parsedTransactions;
    expect(parsed).toHaveLength(2);

    // 3. Commit it through `commitImport` with a tag-rule ChangeSet staged,
    // the way the wizard does: the rule is staged alongside the commit and
    // the affected row already carries the tag the rule resolved to (the
    // wizard applies its own rules client-side before Approve & Commit).
    const commitKey = randomUUID();
    const transactions: ConfirmedTransaction[] = parsed.map((row) => ({
      ...row,
      tags: row.description === 'COLES' ? ['GroceriesRule'] : [],
    }));

    const commitRes = await client().imports.commitImport({
      draftId,
      commitKey,
      tagRuleChangeSets: [
        {
          changeSet: {
            source: 'unit-test',
            ops: [
              {
                op: 'add',
                data: {
                  descriptionPattern: 'COLES',
                  matchType: 'contains',
                  tags: ['GroceriesRule'],
                },
              },
            ],
          },
          acceptedNewTags: ['GroceriesRule'],
        },
      ],
      transactions,
    });

    expect(commitRes.data.transactionsImported).toBe(2);
    expect(commitRes.data.transactionsFailed).toBe(0);
    expect(commitRes.data.tagRulesApplied).toBe(1);

    // 4a. One `transactions` row per staged transaction, on the right account,
    // carrying the staged ChangeSet's effect (the COLES row's tag).
    const ledgerRows = transactionRows(accountId);
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows.map((r) => r.accountId)).toEqual([accountId, accountId]);
    expect(ledgerRows.map((r) => r.date)).toEqual(['2026-09-02', '2026-09-04']);
    expect(JSON.parse(ledgerRows[0]!.tags)).toEqual(['GroceriesRule']);
    expect(JSON.parse(ledgerRows[1]!.tags)).toEqual([]);

    // 4b. Exactly one `account_checkpoints` row: `import`-sourced, the
    // draft's reported balance, dated to the NEWEST inserted row (not the
    // oldest, and not insertion order — the two staged rows above are
    // deliberately dated apart so a wrong-anchor mint fails this), and
    // `sourceRef` naming the commit key.
    const checkpoints = checkpointRows();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({
      accountId,
      balanceCents: 48_800,
      asOf: '2026-09-04',
      source: 'import',
      sourceRef: commitKey,
    });

    // 4c. The `import_batches` row's source recorded as `{ kind: 'api',
    // provider: 'up' }`.
    const batches = batchRows();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ accountId, sourceKind: 'api', sourceRef: 'up' });

    // 4d. The draft is gone — deleted in the same transaction as the write.
    expect(getImportDraft(financeDb.db, draftId)).toBeUndefined();
  });
});
