/**
 * Committing a live Up draft, asserted against the database. The browser E2E
 * suite has no backend, so it can only see the commit request the wizard
 * builds; the ledger rows and the minted checkpoint are only observable here.
 *
 * The draft is staged through `syncUpAccount` against a fake `UpBankClient`,
 * the external boundary, so it is minted by the same `stageMappedRows` path a
 * real sync runs rather than inserted by hand.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import {
  accountCheckpoints,
  importBatches,
  transactions,
  transactionTagRules,
} from '../../db/schema.js';
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

const REPORTED_BALANCE_CENTS = 48_800;

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  // Staging classifies rows; an ambient env var must not turn that into a real AI call.
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

function fakeUp(rows: UpTransaction[], account: UpAccount): UpBankClient {
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

function requireDraft(draftId: string) {
  const draft = getImportDraft(financeDb.db, draftId);
  if (!draft) throw new Error(`expected import draft ${draftId} to exist`);
  return draft;
}

/**
 * Two rows dated apart, so a checkpoint anchored to the oldest row or to
 * insertion order cannot pass for one anchored to the newest.
 */
async function stageLiveDraft() {
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
    upAccount({
      balance: { currencyCode: 'AUD', value: '488.00', valueInBaseUnits: REPORTED_BALANCE_CENTS },
    })
  );

  const sync = await syncUpAccount(financeDb.db, makeContactsFake(), {
    accountId,
    client: upClient,
    from: '2026-09-01',
    to: '2026-09-05',
    syncedAt: new Date('2026-09-06T00:00:00.000Z'),
  });
  expect(sync.staged).toBe(2);
  if (sync.draftId === null) throw new Error('expected syncUpAccount to stage a live draft');

  return { accountId, draftId: sync.draftId };
}

function ledgerRowsFor(accountId: string) {
  return financeDb.db
    .select({ accountId: transactions.accountId, date: transactions.date, tags: transactions.tags })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .orderBy(asc(transactions.date))
    .all();
}

describe('committing a live Up import draft', () => {
  it('writes one ledger row per staged transaction and mints the reported-balance checkpoint', async () => {
    const { accountId, draftId } = await stageLiveDraft();

    const stagedDraft = requireDraft(draftId);
    expect(stagedDraft).toMatchObject({
      sourceKind: 'live',
      state: 'live',
      processSessionId: null,
      balanceReportedCents: REPORTED_BALANCE_CENTS,
    });
    const parsed = readLiveDraftPayload(stagedDraft).parsedTransactions;
    expect(parsed).toHaveLength(2);

    // The wizard resolves its staged rules client-side, so the row arrives
    // already tagged; the commit persists the rule, it does not re-apply it.
    const confirmed: ConfirmedTransaction[] = parsed.map((row) => ({
      ...row,
      tags: row.description === 'COLES' ? ['GroceriesRule'] : [],
    }));
    const commitKey = randomUUID();

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
      transactions: confirmed,
    });

    expect(commitRes.data).toMatchObject({
      transactionsImported: 2,
      transactionsFailed: 0,
      tagRulesApplied: 1,
    });

    expect(ledgerRowsFor(accountId)).toEqual([
      { accountId, date: '2026-09-02', tags: JSON.stringify(['GroceriesRule']) },
      { accountId, date: '2026-09-04', tags: JSON.stringify([]) },
    ]);

    expect(financeDb.db.select().from(transactionTagRules).all()).toEqual([
      expect.objectContaining({
        descriptionPattern: 'COLES',
        matchType: 'contains',
        tags: JSON.stringify(['GroceriesRule']),
      }),
    ]);

    expect(financeDb.db.select().from(accountCheckpoints).all()).toEqual([
      expect.objectContaining({
        accountId,
        balanceCents: REPORTED_BALANCE_CENTS,
        asOf: '2026-09-04',
        source: 'import',
        sourceRef: commitKey,
      }),
    ]);

    expect(financeDb.db.select().from(importBatches).all()).toEqual([
      expect.objectContaining({ accountId, sourceKind: 'api', sourceRef: 'up', commitKey }),
    ]);

    expect(getImportDraft(financeDb.db, draftId)).toBeUndefined();
  });

  it('keeps the draft when the commit is rejected before it writes anything', async () => {
    const { accountId, draftId } = await stageLiveDraft();
    const parsed = readLiveDraftPayload(requireDraft(draftId)).parsedTransactions;

    await expect(
      client().imports.commitImport({
        draftId,
        commitKey: randomUUID(),
        changeSets: [
          { ops: [{ op: 'edit', id: 'non-existent-rule-id', data: { confidence: 0.9 } }] },
        ],
        transactions: parsed.map((row) => ({ ...row, tags: [] })),
      })
    ).rejects.toMatchObject({ status: 404 });

    expect(requireDraft(draftId)).toMatchObject({ state: 'live' });
    expect(ledgerRowsFor(accountId)).toEqual([]);
  });

  // Discarding the draft is the commit transaction's last statement. Failing
  // it there, after the ledger rows, checkpoint and batch are all written, is
  // the only failure point that proves those writes share the draft's
  // transaction; an earlier failure would pass with the writes outside it.
  it('rolls back every write when discarding the draft fails', async () => {
    const { accountId, draftId } = await stageLiveDraft();
    const parsed = readLiveDraftPayload(requireDraft(draftId)).parsedTransactions;
    financeDb.raw.exec(`
      CREATE TRIGGER fail_draft_discard BEFORE DELETE ON import_drafts
      BEGIN SELECT RAISE(ABORT, 'draft discard refused'); END;
    `);

    await expect(
      client().imports.commitImport({
        draftId,
        commitKey: randomUUID(),
        transactions: parsed.map((row) => ({ ...row, tags: [] })),
      })
    ).rejects.toMatchObject({ status: 500 });

    expect(requireDraft(draftId)).toMatchObject({ state: 'live' });
    expect(ledgerRowsFor(accountId)).toEqual([]);
    expect(financeDb.db.select().from(accountCheckpoints).all()).toEqual([]);
    expect(financeDb.db.select().from(importBatches).all()).toEqual([]);
  });
});
