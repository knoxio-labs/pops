/**
 * Invariant tests for the import-batch service against the migrated schema
 * (POPS-2916, ADR-052): the transaction stamp, newest-first paging, the
 * checkpoint link's `SET NULL`, and the account cascade.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { accounts, transactions } from '../schema.js';
import { insertCheckpoint } from '../services/account-checkpoints.js';
import { createAccount } from '../services/accounts.js';
import {
  getBatch,
  insertBatch,
  latestBatchForAccount,
  listBatchesForAccount,
} from '../services/import-batches.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type Database from 'better-sqlite3';

import type { FinanceDb } from '../services/internal.js';

let db: FinanceDb;
let raw: Database.Database;
let accountId: string;

beforeEach(() => {
  ({ db, raw } = freshMigratedFinanceDb());
  accountId = createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' }).id;
});

function seedTransaction(date: string): string {
  const id = crypto.randomUUID();
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account_id, amount_cents, date, type, last_edited_time)
       VALUES (?, 'row', ?, -100, ?, 'purchase', '2026-09-06T00:00:00.000Z')`
    )
    .run(id, accountId, date);
  return id;
}

function insertAt(createdAt: string, overrides: { commitKey?: string } = {}): string {
  const row = insertBatch(
    db,
    { accountId, sourceKind: 'csv-dialect', rowCount: 0, ...overrides },
    []
  );
  raw.prepare('UPDATE import_batches SET created_at = ? WHERE id = ?').run(createdAt, row.id);
  return row.id;
}

describe('insertBatch', () => {
  it('stamps import_batch_id on exactly the ids it was given', () => {
    const stamped = seedTransaction('2026-07-01');
    const untouched = seedTransaction('2026-07-02');

    const batch = insertBatch(
      db,
      {
        accountId,
        sourceKind: 'csv-dialect',
        sourceRef: 'Amex',
        rowCount: 1,
        dateFrom: '2026-07-01',
        dateTo: '2026-07-01',
      },
      [stamped]
    );

    const rows = db.select().from(transactions).all();
    expect(rows.find((r) => r.id === stamped)?.importBatchId).toBe(batch.id);
    expect(rows.find((r) => r.id === untouched)?.importBatchId).toBeNull();
  });

  it('stores every optional field as null, and a zero-row batch with no span', () => {
    const batch = insertBatch(db, { accountId, sourceKind: 'api', rowCount: 0 }, []);
    expect(batch).toMatchObject({
      sourceRef: null,
      parserVersion: null,
      commitKey: null,
      rowCount: 0,
      dateFrom: null,
      dateTo: null,
      checkpointId: null,
    });
    expect(getBatch(db, batch.id)).toEqual(batch);
  });

  it('accepts two batches under one commit key for one account', () => {
    // A commit that spanned two accounts later merged into one leaves the
    // survivor two batches under that key; the schema must admit it.
    insertBatch(db, { accountId, sourceKind: 'csv-dialect', rowCount: 1, commitKey: 'k' }, []);
    expect(() =>
      insertBatch(db, { accountId, sourceKind: 'csv-dialect', rowCount: 1, commitKey: 'k' }, [])
    ).not.toThrow();
  });

  it('refuses a batch for an account that does not exist', () => {
    expect(() =>
      insertBatch(db, { accountId: 'nope', sourceKind: 'csv-dialect', rowCount: 0 }, [])
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('listBatchesForAccount', () => {
  it('pages newest first on created_at and hands back the cursor for the next page', () => {
    const oldest = insertAt('2026-09-01T00:00:00.000Z');
    const middle = insertAt('2026-09-02T00:00:00.000Z');
    const newest = insertAt('2026-09-03T00:00:00.000Z');

    const first = listBatchesForAccount(db, accountId, { limit: 2 });
    expect(first.items.map((b) => b.id)).toEqual([newest, middle]);
    expect(first.nextBefore).toBe('2026-09-02T00:00:00.000Z');

    const second = listBatchesForAccount(db, accountId, {
      limit: 2,
      before: first.nextBefore,
    });
    expect(second.items.map((b) => b.id)).toEqual([oldest]);
    expect(second.nextBefore).toBeUndefined();
  });

  it('does not report a next page when the account has exactly `limit` batches', () => {
    insertAt('2026-09-01T00:00:00.000Z');
    insertAt('2026-09-02T00:00:00.000Z');
    const page = listBatchesForAccount(db, accountId, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextBefore).toBeUndefined();
  });

  it("does not list another account's batches", () => {
    const other = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' }).id;
    insertBatch(db, { accountId: other, sourceKind: 'csv-dialect', rowCount: 0 }, []);
    expect(listBatchesForAccount(db, accountId, { limit: 10 }).items).toEqual([]);
  });
});

describe('latestBatchForAccount', () => {
  it('is undefined for an account never fed through a batch', () => {
    expect(latestBatchForAccount(db, accountId)).toBeUndefined();
  });

  it('returns the newest by created_at, not the last inserted', () => {
    const newest = insertAt('2026-09-05T00:00:00.000Z');
    insertAt('2026-09-01T00:00:00.000Z');
    expect(latestBatchForAccount(db, accountId)?.id).toBe(newest);
  });
});

describe('foreign keys', () => {
  it('cascades away with its account', () => {
    insertBatch(db, { accountId, sourceKind: 'csv-dialect', rowCount: 0 }, []);
    db.delete(accounts).where(eq(accounts.id, accountId)).run();
    expect(listBatchesForAccount(db, accountId, { limit: 10 }).items).toEqual([]);
  });

  it('keeps the batch and nulls the link when its checkpoint is deleted', () => {
    const checkpoint = insertCheckpoint(db, {
      accountId,
      balanceCents: 100,
      asOf: '2026-09-01',
      source: 'manual',
    });
    const batch = insertBatch(
      db,
      { accountId, sourceKind: 'pdf-statement', rowCount: 0, checkpointId: checkpoint.id },
      []
    );
    raw.prepare('DELETE FROM account_checkpoints WHERE id = ?').run(checkpoint.id);
    expect(getBatch(db, batch.id)?.checkpointId).toBeNull();
  });

  it("nulls a transaction's stamp when its batch row is deleted", () => {
    const id = seedTransaction('2026-07-01');
    const batch = insertBatch(db, { accountId, sourceKind: 'csv-dialect', rowCount: 1 }, [id]);
    raw.prepare('DELETE FROM import_batches WHERE id = ?').run(batch.id);
    expect(
      db.select().from(transactions).where(eq(transactions.id, id)).get()?.importBatchId
    ).toBeNull();
  });
});
