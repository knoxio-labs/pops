/**
 * Invariant tests for `previewRuleMatchTransactions` — the DB-wide rule-match
 * preview behind the "Manage Rules" impact panel.
 *
 * Seeds an in-memory `transactions` table with the canonical DDL and asserts
 * the preview matches exactly what a rule would hit at import time: matching is
 * against the post-`normalizeDescription` form (digits stripped, whitespace
 * collapsed, uppercased), the total count spans the full DB (never the page
 * limit), and pagination slices the newest-first ordering.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { dollarsToCents } from '../../money.js';
import { previewRuleMatchTransactions } from '../services/transaction-corrections-matching.js';

import type { FinanceDb } from '../services/internal.js';
import type { TransactionCorrectionMatchType } from '../services/transaction-corrections-types.js';

const TRANSACTIONS_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
  amount_cents integer NOT NULL,
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
  last_edited_time text NOT NULL,
  match_type text,
  match_rule_id text,
  match_confidence real
);
CREATE INDEX idx_transactions_date ON transactions (date);
CREATE UNIQUE INDEX idx_transactions_checksum ON transactions (checksum);
`;

interface SeedOverrides {
  id?: string;
  description: string;
  amount?: number;
  date?: string;
  entityId?: string | null;
  entityName?: string | null;
  checksum?: string | null;
}

interface TestHarness {
  db: FinanceDb;
  raw: Database.Database;
}

function freshDb(): TestHarness {
  const raw = new Database(':memory:');
  raw.exec(TRANSACTIONS_DDL);
  return { db: drizzle(raw), raw };
}

let seq = 0;
function seedTransaction(raw: Database.Database, o: SeedOverrides): string {
  seq += 1;
  const id = o.id ?? `txn-${seq}`;
  raw
    .prepare(
      `INSERT INTO transactions (
        id, description, account, amount_cents, date, type, checksum, entity_id, entity_name, last_edited_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      o.description,
      'Up Savings',
      dollarsToCents(o.amount ?? -10),
      o.date ?? '2025-01-01',
      'Purchase',
      o.checksum === undefined ? `sum-${seq}` : o.checksum,
      o.entityId ?? null,
      o.entityName ?? null,
      '2025-01-01T00:00:00.000Z'
    );
  return id;
}

function preview(
  db: FinanceDb,
  pattern: string,
  matchType: TransactionCorrectionMatchType,
  page: { limit?: number; offset?: number } = {}
) {
  return previewRuleMatchTransactions(db, {
    pattern,
    matchType,
    limit: page.limit ?? 100,
    offset: page.offset ?? 0,
  });
}

describe('previewRuleMatchTransactions — exact', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('matches on the normalised description (digits stripped, whitespace collapsed)', () => {
    seedTransaction(harness.raw, { description: 'Starbucks   42  Store 7' });
    seedTransaction(harness.raw, { description: 'Starbucks Coffee' });

    const result = preview(harness.db, 'STARBUCKS STORE', 'exact');
    expect(result.totalCount).toBe(1);
    expect(result.matches.map((m) => m.description)).toEqual(['Starbucks   42  Store 7']);
  });

  it('uppercases the pattern before comparing (case-insensitive on the pattern side)', () => {
    seedTransaction(harness.raw, { description: 'NETFLIX' });
    expect(preview(harness.db, 'netflix', 'exact').totalCount).toBe(1);
  });

  it('does not treat an exact pattern as a substring', () => {
    seedTransaction(harness.raw, { description: 'UBER EATS' });
    expect(preview(harness.db, 'UBER', 'exact').totalCount).toBe(0);
  });
});

describe('previewRuleMatchTransactions — contains', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('matches substrings of the normalised description', () => {
    seedTransaction(harness.raw, { description: 'Morning coffee at home' });
    seedTransaction(harness.raw, { description: 'COFFEE BEAN CO' });
    seedTransaction(harness.raw, { description: 'Grocery run' });

    const result = preview(harness.db, 'COFFEE', 'contains');
    expect(result.totalCount).toBe(2);
    expect(result.matches.map((m) => m.description).toSorted()).toEqual([
      'COFFEE BEAN CO',
      'Morning coffee at home',
    ]);
  });

  it('matches across digit boundaries a raw SQL LIKE would miss', () => {
    // normalise("STARBUCKS 12 LONDON") === "STARBUCKS LONDON", so the pattern
    // spans a point where the raw row still has an interposed reference number.
    seedTransaction(harness.raw, { description: 'STARBUCKS 12 LONDON' });
    expect(preview(harness.db, 'STARBUCKS LONDON', 'contains').totalCount).toBe(1);
  });

  it('projects checksum + current entity onto each match', () => {
    seedTransaction(harness.raw, {
      description: 'SPOTIFY',
      checksum: 'chk-1',
      entityId: 'ent-1',
      entityName: 'Spotify',
      amount: -11.99,
      date: '2025-03-03',
    });
    const [match] = preview(harness.db, 'SPOTIFY', 'contains').matches;
    expect(match).toEqual({
      id: expect.any(String),
      checksum: 'chk-1',
      date: '2025-03-03',
      description: 'SPOTIFY',
      amount: -11.99,
      entityId: 'ent-1',
      entityName: 'Spotify',
    });
  });
});

describe('previewRuleMatchTransactions — regex', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('runs case-insensitively against the normalised description', () => {
    seedTransaction(harness.raw, { description: 'UBER TRIP' });
    seedTransaction(harness.raw, { description: 'LYFT RIDE' });
    // lowercase pattern still hits the uppercased normalised description.
    expect(preview(harness.db, '^uber', 'regex').totalCount).toBe(1);
  });

  it('returns no matches (and does not throw) for an invalid regex', () => {
    seedTransaction(harness.raw, { description: 'ANYTHING' });
    expect(() => preview(harness.db, '[invalid(', 'regex')).not.toThrow();
    expect(preview(harness.db, '[invalid(', 'regex').totalCount).toBe(0);
  });
});

describe('previewRuleMatchTransactions — total count + pagination', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
    for (let i = 0; i < 5; i += 1) {
      seedTransaction(harness.raw, {
        description: `AMAZON ORDER ${i}`,
        date: `2025-01-0${i + 1}`,
      });
    }
    seedTransaction(harness.raw, { description: 'UNRELATED', date: '2025-02-01' });
  });

  it('reports the FULL match total even when the page is capped by limit', () => {
    const result = preview(harness.db, 'AMAZON', 'contains', { limit: 2 });
    expect(result.matches).toHaveLength(2);
    expect(result.totalCount).toBe(5);
  });

  it('orders newest-first and pages with offset without changing the total', () => {
    const page1 = preview(harness.db, 'AMAZON', 'contains', { limit: 2, offset: 0 });
    const page2 = preview(harness.db, 'AMAZON', 'contains', { limit: 2, offset: 2 });
    const page3 = preview(harness.db, 'AMAZON', 'contains', { limit: 2, offset: 4 });

    expect(page1.matches.map((m) => m.date)).toEqual(['2025-01-05', '2025-01-04']);
    expect(page2.matches.map((m) => m.date)).toEqual(['2025-01-03', '2025-01-02']);
    expect(page3.matches.map((m) => m.date)).toEqual(['2025-01-01']);
    expect([page1, page2, page3].every((p) => p.totalCount === 5)).toBe(true);
  });

  it('returns an empty page + zero total when nothing matches', () => {
    const result = preview(harness.db, 'NONEXISTENT', 'contains');
    expect(result.matches).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});
