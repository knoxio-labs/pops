/**
 * What a trusted Up webhook event does to the ledger (POPS-2920): a created
 * row lands as a batch of one, a second delivery writes nothing, a settled
 * event settles a held row in place, a later batch sync sees the webhook's
 * row as already there, an unmapped Up account is reported and not written,
 * a deletion is left to the sync, and the token to fetch with is found by
 * trying each configured secret until one knows the transaction.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { importBatches, transactions } from '../../../../db/schema.js';
import { upsertImportConfig } from '../../../../db/services/account-import-config.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import { syncUpAccount } from '../sync.js';
import { UpBankApiError, type UpBankClient, type UpTransaction } from '../up-api.js';
import { makeUpWebhookIngest, type UpWebhookIngest } from '../webhook-ingest.js';
import { upAccount, upTransaction } from './fixtures.js';

import type { FinanceDb } from '../../../../db/services/internal.js';

let db: FinanceDb;
let accountId: string;

/** An Up customer: the rows its token can see, keyed by id, and the accounts behind them. */
function customer(rows: UpTransaction[]): { client: UpBankClient; asked: string[] } {
  const asked: string[] = [];
  const account = upAccount();
  return {
    asked,
    client: {
      ping: async () => ({ customerId: 'cust-1' }),
      listAccounts: async () => [account],
      getAccount: async () => account,
      getTransaction: async (id) => {
        asked.push(id);
        const found = rows.find((row) => row.id === id);
        if (!found) throw new UpBankApiError(404, `/transactions/${id}`);
        return found;
      },
      listTransactions: async () => rows,
    },
  };
}

function configure(
  forAccount: string,
  externalAccountRef = 'up-acc-1',
  secretRef = 'UP_TOKEN'
): void {
  upsertImportConfig(db, {
    accountId: forAccount,
    sourceKind: 'api',
    provider: 'up',
    externalAccountRef,
    secretRef,
  });
}

function ingestWith(clients: Record<string, UpBankClient>): UpWebhookIngest {
  return makeUpWebhookIngest(db, makeContactsFake(), {
    clientFor: (secretRef) => {
      const client = clients[secretRef];
      if (!client) throw new Error(`no client for ${secretRef}`);
      return client;
    },
  });
}

function storedRows() {
  return db.select().from(transactions).where(eq(transactions.accountId, accountId)).all();
}

function batches() {
  return db.select().from(importBatches).all();
}

const created = { eventType: 'TRANSACTION_CREATED', transactionId: 'txn-1' };

beforeEach(() => {
  ({ db } = freshMigratedFinanceDb());
  accountId = createAccount(db, { name: 'Up Everyday', kind: 'savings', currency: 'AUD' }).id;
});

describe('makeUpWebhookIngest', () => {
  it('imports a created transaction as a batch of one, and a second delivery writes nothing', async () => {
    configure(accountId);
    const { client } = customer([
      upTransaction({ id: 'txn-1', cents: -1_250, createdAt: '2026-09-05T09:00:00+10:00' }),
    ]);
    const ingest = ingestWith({ UP_TOKEN: client });

    const first = await ingest(created);
    expect(first).toMatchObject({ kind: 'imported', accountId, failed: 0 });
    expect(storedRows().map((r) => [r.date, r.amountCents, r.pending])).toEqual([
      ['2026-09-05', -1_250, false],
    ]);
    expect(batches()).toMatchObject([
      { accountId, sourceKind: 'api', sourceRef: 'up', rowCount: 1, dateFrom: '2026-09-05' },
    ]);
    expect(first.kind === 'imported' && first.batchId).toBe(batches()[0]?.id);

    const second = await ingest(created);
    expect(second).toEqual({ kind: 'duplicate', accountId });
    expect(storedRows()).toHaveLength(1);
    expect(batches()).toHaveLength(1);
  });

  it('two deliveries in flight together for one transaction land one row', async () => {
    configure(accountId);
    const { client } = customer([
      upTransaction({ id: 'txn-1', cents: -1_250, createdAt: '2026-09-05T09:00:00+10:00' }),
    ]);
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: UpBankClient = {
      ...client,
      getTransaction: async (id) => {
        await gate;
        return client.getTransaction(id);
      },
    };
    const ingest = ingestWith({ UP_TOKEN: slow });

    const first = ingest(created);
    const second = ingest({ eventType: 'TRANSACTION_SETTLED', transactionId: 'txn-1' });
    release();

    expect((await first).kind).toBe('imported');
    expect((await second).kind).toBe('duplicate');
    expect(storedRows()).toHaveLength(1);
    expect(batches()).toHaveLength(1);
  });

  it('a failed delivery does not block the next one for the same transaction', async () => {
    configure(accountId);
    const { client } = customer([
      upTransaction({ id: 'txn-1', cents: -1_250, createdAt: '2026-09-05T09:00:00+10:00' }),
    ]);
    let calls = 0;
    const flaky: UpBankClient = {
      ...client,
      getTransaction: async (id) => {
        calls += 1;
        if (calls === 1) throw new UpBankApiError(500, `/transactions/${id}`);
        return client.getTransaction(id);
      },
    };
    const ingest = ingestWith({ UP_TOKEN: flaky });

    const first = ingest(created);
    const second = ingest(created);
    await expect(first).rejects.toBeInstanceOf(UpBankApiError);
    expect((await second).kind).toBe('imported');
    expect(storedRows()).toHaveLength(1);
  });

  it('settles a held row in place on TRANSACTION_SETTLED, once', async () => {
    configure(accountId);
    const held = upTransaction({
      id: 'txn-1',
      status: 'HELD',
      cents: -1_000,
      createdAt: '2026-09-05T09:00:00+10:00',
    });
    const heldCustomer = customer([held]);
    await ingestWith({ UP_TOKEN: heldCustomer.client })(created);
    expect(storedRows().map((r) => r.pending)).toEqual([true]);

    const settled = upTransaction({
      id: 'txn-1',
      status: 'SETTLED',
      cents: -1_050,
      createdAt: '2026-09-05T09:00:00+10:00',
      settledAt: '2026-09-07T02:00:00+10:00',
    });
    const ingest = ingestWith({ UP_TOKEN: customer([settled]).client });
    const outcome = await ingest({ eventType: 'TRANSACTION_SETTLED', transactionId: 'txn-1' });
    const [row] = storedRows();
    expect(outcome).toEqual({ kind: 'settled', accountId, transactionId: row?.id });
    expect(row).toMatchObject({ pending: false, amountCents: -1_050, date: '2026-09-07' });
    expect(batches()).toHaveLength(1);

    await expect(
      ingest({ eventType: 'TRANSACTION_SETTLED', transactionId: 'txn-1' })
    ).resolves.toEqual({ kind: 'duplicate', accountId });
  });

  it('is one row with the batch sync, whichever fetches it first', async () => {
    configure(accountId);
    const { client } = customer([
      upTransaction({ id: 'txn-1', cents: -900, createdAt: '2026-09-03T09:00:00+10:00' }),
    ]);
    await ingestWith({ UP_TOKEN: client })(created);

    const sync = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client,
      from: '2026-09-01',
      to: '2026-09-05',
      asOf: '2026-09-06',
    });
    expect(sync).toMatchObject({ fetched: 1, imported: 0, settled: 0 });
    expect(storedRows()).toHaveLength(1);
  });

  it('reports an Up account nobody has mapped and writes nothing', async () => {
    const other = createAccount(db, { name: 'Up Saver', kind: 'savings', currency: 'AUD' }).id;
    configure(other, 'up-acc-2');
    const { client } = customer([upTransaction({ id: 'txn-1' })]);

    await expect(ingestWith({ UP_TOKEN: client })(created)).resolves.toEqual({
      kind: 'unmapped',
      upAccountId: 'up-acc-1',
      transactionId: 'txn-1',
    });
    expect(db.select().from(transactions).all()).toHaveLength(0);
    expect(batches()).toHaveLength(0);
  });

  it('leaves a deletion to the next sync', async () => {
    configure(accountId);
    const { client, asked } = customer([upTransaction({ id: 'txn-1' })]);
    await ingestWith({ UP_TOKEN: client })(created);

    await expect(
      ingestWith({ UP_TOKEN: client })({ eventType: 'TRANSACTION_DELETED', transactionId: 'txn-1' })
    ).resolves.toEqual({ kind: 'deleted', transactionId: 'txn-1' });
    expect(storedRows()).toHaveLength(1);
    expect(asked).toEqual(['txn-1']);
  });

  it('ignores events it does not ingest, events without a transaction, and a ledger with no Up secret', async () => {
    const { client } = customer([upTransaction({ id: 'txn-1' })]);
    const ingest = ingestWith({ UP_TOKEN: client });

    await expect(ingest({ eventType: 'PING', transactionId: undefined })).resolves.toMatchObject({
      kind: 'ignored',
      reason: 'no transaction id',
    });
    await expect(ingest({ eventType: 'PING', transactionId: 'x' })).resolves.toMatchObject({
      kind: 'ignored',
      reason: 'event PING is not ingested',
    });
    await expect(ingest(created)).resolves.toMatchObject({
      kind: 'ignored',
      reason: 'no account fed by Up names a secret',
    });
  });

  it('tries each configured secret until one knows the transaction, and gives up when none does', async () => {
    const other = createAccount(db, {
      name: 'Up Other Customer',
      kind: 'savings',
      currency: 'AUD',
    }).id;
    configure(other, 'up-acc-other', 'UP_TOKEN_A');
    configure(accountId, 'up-acc-1', 'UP_TOKEN_B');
    const a = customer([]);
    const b = customer([upTransaction({ id: 'txn-1', cents: -300 })]);
    const ingest = ingestWith({ UP_TOKEN_A: a.client, UP_TOKEN_B: b.client });

    await expect(ingest(created)).resolves.toMatchObject({ kind: 'imported', accountId });
    expect(b.asked).toEqual(['txn-1']);

    await expect(ingest({ ...created, transactionId: 'txn-nobody' })).resolves.toEqual({
      kind: 'ignored',
      reason: 'transaction txn-nobody not found under any token',
    });
    expect(a.asked).toContain('txn-nobody');
    expect(b.asked).toContain('txn-nobody');
  });

  it('surfaces an Up error other than 404 instead of treating it as not found', async () => {
    configure(accountId);
    const { client } = customer([]);
    client.getTransaction = async () => {
      throw new UpBankApiError(500, '/transactions/txn-1');
    };
    await expect(ingestWith({ UP_TOKEN: client })(created)).rejects.toBeInstanceOf(UpBankApiError);
  });
});
