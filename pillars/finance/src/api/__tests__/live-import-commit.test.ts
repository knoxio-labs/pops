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

import { openFinanceDb, sumThrough, type OpenedFinanceDb } from '../../db/index.js';
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
        // Read 2026-09-06 10:00 local; the 5th is the last day it closes.
        balanceCents: REPORTED_BALANCE_CENTS,
        asOf: '2026-09-05',
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

/**
 * The 2026-09-15 case: Up was read at 16:40 local, after the salary landed
 * and before two card payments the same afternoon. Dating that reading to
 * the salary's day recorded 4,537.67 as the 15th's close, and every
 * checkpoint after it disagreed with the ledger by the 2,000 that followed.
 */
describe("dating a live draft's reported balance", () => {
  async function upAccountId() {
    const account = await client().accounts.create({
      name: 'Up Spending',
      kind: 'checking',
      currency: 'AUD',
    });
    upsertImportConfig(financeDb.db, {
      accountId: account.data.id,
      sourceKind: 'api',
      provider: 'up',
      externalAccountRef: 'up-acc-1',
      secretRef: 'UP_TOKEN',
    });
    return account.data.id;
  }

  async function syncAndCommit(
    accountId: string,
    rows: UpTransaction[],
    balanceCents: number,
    syncedAt: string
  ) {
    const upClient = fakeUp(
      rows,
      upAccount({
        balance: {
          currencyCode: 'AUD',
          value: (balanceCents / 100).toFixed(2),
          valueInBaseUnits: balanceCents,
        },
      })
    );
    const sync = await syncUpAccount(financeDb.db, makeContactsFake(), {
      accountId,
      client: upClient,
      from: '2026-09-01',
      to: '2026-11-30',
      syncedAt: new Date(syncedAt),
    });
    if (sync.draftId === null) throw new Error('expected syncUpAccount to stage a live draft');
    const parsed = readLiveDraftPayload(requireDraft(sync.draftId)).parsedTransactions;
    const result = await client().imports.commitImport({
      draftId: sync.draftId,
      commitKey: randomUUID(),
      // A credit needs a type to commit; the review step would ask for one.
      transactions: parsed.map((row) => ({
        ...row,
        tags: [],
        ...(row.amount > 0 ? { transactionType: 'income' as const } : {}),
      })),
    });
    expect(result.data.transactionsFailed).toBe(0);
  }

  function checkpointsFor(accountId: string) {
    return financeDb.db
      .select({ asOf: accountCheckpoints.asOf, balanceCents: accountCheckpoints.balanceCents })
      .from(accountCheckpoints)
      .where(eq(accountCheckpoints.accountId, accountId))
      .orderBy(asc(accountCheckpoints.asOf))
      .all();
  }

  const salary = upTransaction({
    id: 'salary',
    description: 'Karbon',
    cents: 453_767,
    createdAt: '2026-09-15T09:00:00+10:00',
  });
  const amex = upTransaction({
    id: 'amex',
    description: 'Amex Credit Card',
    cents: -150_000,
    createdAt: '2026-09-15T18:00:00+10:00',
  });
  const anz = upTransaction({
    id: 'anz',
    description: 'ANZ Credit Card',
    cents: -50_000,
    createdAt: '2026-09-15T18:05:00+10:00',
  });

  it('dates a same-day reading to the day before, net of that day', async () => {
    const accountId = await upAccountId();

    await syncAndCommit(accountId, [salary], 453_767, '2026-09-15T06:40:00.000Z');

    expect(checkpointsFor(accountId)).toEqual([{ asOf: '2026-09-14', balanceCents: 0 }]);
  });

  it('leaves every checkpoint agreeing with the ledger once the later rows arrive', async () => {
    const accountId = await upAccountId();

    await syncAndCommit(accountId, [salary], 453_767, '2026-09-15T06:40:00.000Z');
    await syncAndCommit(accountId, [salary, amex, anz], 253_767, '2026-11-08T05:00:00.000Z');

    const checkpoints = checkpointsFor(accountId);
    expect(checkpoints).toEqual([
      { asOf: '2026-09-14', balanceCents: 0 },
      { asOf: '2026-11-07', balanceCents: 253_767 },
    ]);
    for (const checkpoint of checkpoints) {
      expect(sumThrough(financeDb.db, accountId, checkpoint.asOf)).toBe(checkpoint.balanceCents);
    }
  });

  it.each([
    ['00:20 local', '2026-09-15T14:20:00.000Z'],
    ['23:40 local', '2026-09-16T13:40:00.000Z'],
  ])(
    'mints nothing for a reading at %s, where a stale offset could change the day',
    async (_label, syncedAt) => {
      const accountId = await upAccountId();

      await syncAndCommit(accountId, [salary], 453_767, syncedAt);

      expect(checkpointsFor(accountId)).toEqual([]);
    }
  );

  it('mints at 01:00 local, the edge of that window', async () => {
    const accountId = await upAccountId();

    await syncAndCommit(accountId, [salary], 453_767, '2026-09-15T15:00:00.000Z');

    expect(checkpointsFor(accountId)).toEqual([{ asOf: '2026-09-15', balanceCents: 453_767 }]);
  });

  it('mints nothing for a draft staged before readings carried a time', async () => {
    const { draftId } = await stageLiveDraft();
    financeDb.raw
      .prepare('UPDATE import_drafts SET balance_reported_at = NULL WHERE id = ?')
      .run(draftId);
    const parsed = readLiveDraftPayload(requireDraft(draftId)).parsedTransactions;

    await client().imports.commitImport({
      draftId,
      commitKey: randomUUID(),
      transactions: parsed.map((row) => ({ ...row, tags: [] })),
    });

    expect(financeDb.db.select().from(accountCheckpoints).all()).toEqual([]);
  });

  it('mints nothing when the ledger already holds a row dated after the reading', async () => {
    const accountId = await upAccountId();
    await syncAndCommit(
      accountId,
      [
        upTransaction({
          id: 'later',
          description: 'COLES',
          cents: -1_000,
          createdAt: '2026-09-20T09:00:00+10:00',
        }),
      ],
      -1_000,
      '2026-09-21T00:00:00.000Z'
    );
    const before = checkpointsFor(accountId);

    await syncAndCommit(accountId, [salary], 453_767, '2026-09-15T06:40:00.000Z');

    expect(checkpointsFor(accountId)).toEqual(before);
  });
});
