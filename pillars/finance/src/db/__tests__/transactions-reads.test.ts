/**
 * Tests for {@link getLastImportInfo} — the import-staleness signal backing
 * the `/health` `import` fields. Against an in-memory SQLite seeded with the
 * canonical `transactions` DDL, same pattern as `transactions.test.ts`.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { transactions } from '../schema/transactions.js';
import { getLastImportInfo } from '../services/transactions-reads.js';

import type { FinanceDb } from '../services/internal.js';

const TRANSACTIONS_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
  amount real NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text NOT NULL DEFAULT '[]',
  entity_id text,
  entity_name text,
  location text,
  country text,
  related_transaction_id text,
  notes text,
  checksum text,
  raw_row text,
  last_edited_time text NOT NULL
);
`;

function freshDb(): FinanceDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(TRANSACTIONS_DDL);
  return drizzle(raw);
}

function insertTransaction(db: FinanceDb, id: string, lastEditedTime: string): void {
  db.insert(transactions)
    .values({
      id,
      description: 'x',
      account: 'Up',
      amount: 1,
      date: '2025-01-01',
      type: 'Purchase',
      lastEditedTime,
    })
    .run();
}

describe('getLastImportInfo', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns nulls for an empty table', () => {
    expect(getLastImportInfo(db)).toEqual({ lastEditedTime: null, daysSinceLastImport: null });
  });

  it('returns the most recent lastEditedTime across all rows', () => {
    insertTransaction(db, 'a', '2026-01-01T00:00:00.000Z');
    insertTransaction(db, 'b', '2026-03-15T12:00:00.000Z');
    insertTransaction(db, 'c', '2026-02-01T00:00:00.000Z');

    const now = new Date('2026-03-20T12:00:00.000Z');
    const info = getLastImportInfo(db, now);

    expect(info.lastEditedTime).toBe('2026-03-15T12:00:00.000Z');
    expect(info.daysSinceLastImport).toBe(5);
  });

  it('floors partial days and never goes negative', () => {
    insertTransaction(db, 'a', '2026-03-20T11:00:00.000Z');
    const now = new Date('2026-03-20T12:00:00.000Z');

    expect(getLastImportInfo(db, now).daysSinceLastImport).toBe(0);
  });

  it('keeps the raw value but reports null days for an unparseable lastEditedTime', () => {
    insertTransaction(db, 'a', 'not-a-timestamp');
    const now = new Date('2026-03-20T12:00:00.000Z');

    expect(getLastImportInfo(db, now)).toEqual({
      lastEditedTime: 'not-a-timestamp',
      daysSinceLastImport: null,
    });
  });
});
