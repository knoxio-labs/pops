/**
 * Tests for {@link getLastImportInfo} — the import-staleness signal backing
 * the `/health` `import` fields. Against an in-memory SQLite carrying the
 * migrated finance schema, same pattern as `transactions.test.ts`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { transactions } from '../schema/transactions.js';
import { getLastImportInfo } from '../services/transactions-reads.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

function freshDb(): FinanceDb {
  return freshMigratedFinanceDb().db;
}

function insertTransaction(db: FinanceDb, id: string, lastEditedTime: string): void {
  db.insert(transactions)
    .values({
      id,
      description: 'x',
      account: 'Up',
      amountCents: 100,
      date: '2025-01-01',
      type: 'purchase',
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
