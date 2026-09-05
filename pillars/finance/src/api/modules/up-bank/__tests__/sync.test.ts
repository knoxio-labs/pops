/**
 * The Up sync against the migrated schema (POPS-30): rows land through the
 * commit pipeline, a batch and a checkpoint are recorded, a re-run is a
 * no-op, a held row settles as one row, and the plan writes nothing.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { accountCheckpoints, importBatches, transactions } from '../../../../db/schema.js';
import { insertCheckpoint } from '../../../../db/services/account-checkpoints.js';
import { upsertImportConfig } from '../../../../db/services/account-import-config.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import { planUpSync, UpSyncCurrencyMismatchError, UpSyncNotConfiguredError } from '../sync-plan.js';
import { syncUpAccount } from '../sync.js';
import { upAccount, upTransaction } from './fixtures.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { UpAccount, UpBankClient, UpTransaction, UpTransactionRange } from '../up-api.js';

let db: FinanceDb;
let accountId: string;

/** In-memory Up: one account, whatever rows the test seeds, and the ranges it was asked for. */
function fakeUp(rows: UpTransaction[], account: UpAccount = upAccount()) {
  const ranges: UpTransactionRange[] = [];
  const client: UpBankClient = {
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
    listTransactions: async (_id, range) => {
      ranges.push(range);
      return rows;
    },
  };
  return { client, ranges };
}

function configure(forAccount = accountId): void {
  upsertImportConfig(db, {
    accountId: forAccount,
    sourceKind: 'api',
    provider: 'up',
    externalAccountRef: 'up-acc-1',
    secretRef: 'UP_TOKEN',
  });
}

const RANGE = { from: '2026-09-01', to: '2026-09-05', asOf: '2026-09-06' };

function storedRows() {
  return db.select().from(transactions).where(eq(transactions.accountId, accountId)).all();
}

beforeEach(() => {
  ({ db } = freshMigratedFinanceDb());
  accountId = createAccount(db, { name: 'Up Everyday', kind: 'savings', currency: 'AUD' }).id;
});

describe('syncUpAccount', () => {
  it('imports the range through the commit pipeline, records the batch and mints the balance checkpoint', async () => {
    configure();
    const { client, ranges } = fakeUp([
      upTransaction({ id: 'a', cents: -1_200, createdAt: '2026-09-02T09:00:00+10:00' }),
      upTransaction({
        id: 'b',
        cents: 50_000,
        description: 'Salary',
        transactionType: 'Direct Credit',
        createdAt: '2026-09-04T00:10:00+10:00',
      }),
    ]);

    const result = await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    expect(ranges).toEqual([{ since: '2026-08-31T00:00:00Z', until: '2026-09-07T00:00:00Z' }]);
    expect(result).toMatchObject({
      accountId,
      fetched: 2,
      imported: 2,
      failed: 0,
      settled: 0,
      alreadyHeld: 0,
      warnings: [],
      checkpoint: { balanceCents: 48_800, deltaCents: 0 },
    });

    const rows = storedRows().sort((x, y) => x.date.localeCompare(y.date));
    expect(rows.map((r) => [r.date, r.amountCents, r.type, r.pending, r.fxCaptureSource])).toEqual([
      ['2026-09-02', -1_200, 'purchase', false, 'up-api'],
      ['2026-09-04', 50_000, 'income', false, 'up-api'],
    ]);

    const batch = db.select().from(importBatches).get();
    expect(batch).toMatchObject({
      id: result.batchId,
      accountId,
      sourceKind: 'api',
      sourceRef: 'up',
      parserVersion: '1',
      commitKey: result.commitKey,
      rowCount: 2,
      dateFrom: '2026-09-02',
      dateTo: '2026-09-04',
      checkpointId: result.checkpoint?.id,
    });
    expect(rows.every((r) => r.importBatchId === batch?.id)).toBe(true);

    const checkpoint = db.select().from(accountCheckpoints).get();
    expect(checkpoint).toMatchObject({
      accountId,
      balanceCents: 48_800,
      asOf: '2026-09-06',
      source: 'import',
      sourceRef: result.commitKey,
    });
  });

  it('warns when the ledger disagrees with the API balance, and keeps the checkpoint', async () => {
    configure();
    insertCheckpoint(db, { accountId, balanceCents: 0, asOf: '2026-08-31', source: 'manual' });
    const { client } = fakeUp(
      [upTransaction({ id: 'a', cents: -1_200 })],
      upAccount({ balance: { currencyCode: 'AUD', value: '10.00', valueInBaseUnits: 1_000 } })
    );

    const result = await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    expect(result.checkpoint).toMatchObject({ balanceCents: 1_000, deltaCents: 2_200 });
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'CHECKPOINT_MISMATCH', affectedCount: 1 }),
    ]);
  });

  it('re-running the same range inserts nothing, writes an empty batch and skips the same-day checkpoint', async () => {
    configure();
    const { client } = fakeUp([upTransaction({ id: 'a' }), upTransaction({ id: 'b', cents: -5 })]);
    const first = await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    const again = await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    expect(again).toMatchObject({ fetched: 2, imported: 0, settled: 0, checkpoint: null });
    expect(storedRows()).toHaveLength(2);
    const batches = db.select().from(importBatches).all();
    expect(batches).toHaveLength(2);
    expect(batches.find((b) => b.id === again.batchId)).toMatchObject({
      rowCount: 0,
      dateFrom: null,
      dateTo: null,
      checkpointId: null,
      commitKey: again.commitKey,
    });
    expect(db.select().from(accountCheckpoints).all()).toHaveLength(1);
    expect(first.checkpoint).not.toBeNull();
  });

  it('settles a held row in place: one row, new date and amount, flag cleared, edits untouched', async () => {
    configure();
    const held = upTransaction({
      id: 'h',
      status: 'HELD',
      cents: -10_000,
      createdAt: '2026-09-01T18:00:00+10:00',
    });
    const first = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client: fakeUp([held]).client,
      ...RANGE,
    });
    expect(first).toMatchObject({ imported: 1, alreadyHeld: 0 });
    const [stored] = storedRows();
    expect(stored).toMatchObject({ pending: true, date: '2026-09-01', amountCents: -10_000 });
    db.update(transactions)
      .set({ notes: 'fuel, keep' })
      .where(eq(transactions.id, stored?.id ?? ''))
      .run();

    const stillHeld = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client: fakeUp([held]).client,
      ...RANGE,
      asOf: '2026-09-07',
    });
    expect(stillHeld).toMatchObject({ imported: 0, settled: 0, alreadyHeld: 1 });

    const settled = upTransaction({
      id: 'h',
      status: 'SETTLED',
      cents: -10_250,
      createdAt: '2026-09-01T18:00:00+10:00',
      settledAt: '2026-09-03T03:00:00+10:00',
    });
    const result = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client: fakeUp([settled]).client,
      ...RANGE,
      asOf: '2026-09-08',
    });

    expect(result).toMatchObject({ imported: 0, settled: 1, alreadyHeld: 0 });
    const rows = storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: stored?.id,
      pending: false,
      date: '2026-09-03',
      amountCents: -10_250,
      notes: 'fuel, keep',
    });
    expect(JSON.parse(rows[0]?.rawRow ?? '{}')).toMatchObject({ status: 'SETTLED' });
  });

  it('keeps rows outside the requested calendar range, even though the fetch is wider', async () => {
    configure();
    const { client } = fakeUp([
      upTransaction({ id: 'before', createdAt: '2026-08-31T23:00:00+10:00' }),
      upTransaction({ id: 'in', createdAt: '2026-09-05T23:00:00+10:00' }),
      upTransaction({ id: 'after', createdAt: '2026-09-06T00:30:00+10:00' }),
    ]);

    const result = await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    expect(result).toMatchObject({ fetched: 3, imported: 1 });
    expect(storedRows().map((r) => r.date)).toEqual(['2026-09-05']);
  });

  it("asserts the mapper's transfer type over the ladder's guess", async () => {
    configure();
    const { client } = fakeUp([
      upTransaction({ id: 't', cents: -20_000, transferAccountId: 'up-acc-2' }),
    ]);

    await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    expect(storedRows()[0]?.type).toBe('transfer');
  });

  it('refuses an account with no Up config, and one whose Up account holds another currency', async () => {
    const { client } = fakeUp([]);
    await expect(
      syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE })
    ).rejects.toBeInstanceOf(UpSyncNotConfiguredError);

    upsertImportConfig(db, { accountId, sourceKind: 'csv-dialect', dialectId: 'ING' });
    await expect(
      syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE })
    ).rejects.toMatchObject({ name: 'UpSyncNotConfiguredError', reason: 'provider is none' });

    configure();
    const usd = fakeUp(
      [],
      upAccount({ balance: { currencyCode: 'USD', value: '1.00', valueInBaseUnits: 100 } })
    );
    await expect(
      syncUpAccount(db, makeContactsFake(), { accountId, client: usd.client, ...RANGE })
    ).rejects.toBeInstanceOf(UpSyncCurrencyMismatchError);
    expect(db.select().from(importBatches).all()).toEqual([]);
  });

  it('needs the token only when no client is injected', async () => {
    upsertImportConfig(db, {
      accountId,
      sourceKind: 'api',
      provider: 'up',
      externalAccountRef: 'up-acc-1',
    });
    await expect(planUpSync(db, { accountId, ...RANGE })).rejects.toMatchObject({
      name: 'UpSyncNotConfiguredError',
      reason: 'no secret name',
    });
  });
});

describe('planUpSync', () => {
  it('reports what a sync would do without writing a row, a batch or a checkpoint', async () => {
    configure();
    const { client } = fakeUp([upTransaction({ id: 'a' }), upTransaction({ id: 'b', cents: 7 })]);

    const plan = await planUpSync(db, { accountId, client, ...RANGE });

    expect(plan.newRows.map((r) => r.parsed.checksum)).toHaveLength(2);
    expect(plan).toMatchObject({ fetched: 2, settleable: [], alreadyHeld: 0 });
    expect(plan.account).toMatchObject({ id: accountId, kind: 'savings', currency: 'AUD' });
    expect(storedRows()).toEqual([]);
    expect(db.select().from(importBatches).all()).toEqual([]);
    expect(db.select().from(accountCheckpoints).all()).toEqual([]);
  });
});
