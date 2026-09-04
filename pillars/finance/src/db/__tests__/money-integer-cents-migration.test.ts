/**
 * Migration test for 0064_money_integer_cents (#3665, CF041).
 *
 * Seeds the pre-migration `transactions`/`budgets`/`wish_list` tables (real
 * dollar columns) with values chosen to expose IEEE-754 float error —
 * 19.99, 0.1, 0.29, 0.07, negatives, zero, a large value, and NULL — then
 * runs the REAL migration SQL and asserts every `*_cents` column lands on
 * the exact integer cent, with no off-by-one from truncation.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb } from '../open-finance-db.js';

import type { OpenedFinanceDb } from '../open-finance-db.js';

/**
 * Pinned by hand to the shape `transactions` had before 0064 ran — a float
 * `amount` column, which is exactly what this migration replaces. The
 * current-schema suites derive their table from the journal
 * (`migrated-db.ts`); this one must NOT, because a migration test whose input
 * already carries the migration's output proves nothing.
 */
const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
  amount real NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text DEFAULT '[]' NOT NULL,
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
CREATE UNIQUE INDEX transactions_notion_id_unique ON transactions (notion_id);
CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_account ON transactions (account);
CREATE INDEX idx_transactions_entity ON transactions (entity_id);
CREATE INDEX idx_transactions_last_edited ON transactions (last_edited_time);
CREATE INDEX idx_transactions_notion_id ON transactions (notion_id);
CREATE UNIQUE INDEX idx_transactions_checksum ON transactions (checksum);

CREATE TABLE budgets (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  category text NOT NULL,
  period text,
  amount real,
  active integer DEFAULT 0 NOT NULL,
  notes text,
  last_edited_time text NOT NULL,
  owner_uri text,
  owner_uri_stale_at text
);
CREATE UNIQUE INDEX budgets_notion_id_unique ON budgets (notion_id);
CREATE UNIQUE INDEX idx_budgets_category_period ON budgets (category, COALESCE(period, char(0)));
CREATE INDEX idx_budgets_owner_uri ON budgets (owner_uri);

CREATE TABLE wish_list (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  item text NOT NULL,
  target_amount real,
  saved real,
  priority text,
  url text,
  notes text,
  last_edited_time text NOT NULL
);
CREATE UNIQUE INDEX wish_list_notion_id_unique ON wish_list (notion_id);
`;

function migrationSql(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', '..', '..', 'migrations', '0064_money_integer_cents.sql');
  return readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function runMigration(raw: Database.Database): void {
  for (const statement of migrationSql()) raw.exec(statement);
}

function seedTransaction(raw: Database.Database, id: string, amount: number | null): void {
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account, amount, date, type, last_edited_time)
       VALUES (?, 'seed', 'Amex', ?, '2026-01-01', 'Expense', '2026-01-01T00:00:00Z')`
    )
    .run(id, amount);
}

function seedBudget(raw: Database.Database, id: string, amount: number | null): void {
  raw
    .prepare(
      `INSERT INTO budgets (id, category, amount, last_edited_time)
       VALUES (?, ?, ?, '2026-01-01T00:00:00Z')`
    )
    .run(id, `category-${id}`, amount);
}

function seedWishListItem(
  raw: Database.Database,
  id: string,
  targetAmount: number | null,
  saved: number | null
): void {
  raw
    .prepare(
      `INSERT INTO wish_list (id, item, target_amount, saved, last_edited_time)
       VALUES (?, 'seed item', ?, ?, '2026-01-01T00:00:00Z')`
    )
    .run(id, targetAmount, saved);
}

function transactionCents(raw: Database.Database, id: string): number | null {
  const row = raw.prepare('SELECT amount_cents FROM transactions WHERE id = ?').get(id) as
    | { amount_cents: number | null }
    | undefined;
  return row?.amount_cents ?? null;
}

function budgetCents(raw: Database.Database, id: string): number | null {
  const row = raw.prepare('SELECT amount_cents FROM budgets WHERE id = ?').get(id) as
    | { amount_cents: number | null }
    | undefined;
  return row?.amount_cents ?? null;
}

function wishListCents(
  raw: Database.Database,
  id: string
): { targetAmountCents: number | null; savedCents: number | null } {
  const row = raw
    .prepare('SELECT target_amount_cents, saved_cents FROM wish_list WHERE id = ?')
    .get(id) as { target_amount_cents: number | null; saved_cents: number | null } | undefined;
  return {
    targetAmountCents: row?.target_amount_cents ?? null,
    savedCents: row?.saved_cents ?? null,
  };
}

describe('0064_money_integer_cents', () => {
  let raw: Database.Database;

  beforeEach(() => {
    raw = new Database(':memory:');
    raw.exec(PRE_MIGRATION_DDL);
  });

  describe('transactions.amount -> amount_cents', () => {
    const cases: Array<[label: string, amount: number, expectedCents: number]> = [
      ['19.99 dollars', 19.99, 1999],
      ['0.10 dollars (the float-subtraction repro value)', 0.1, 10],
      ['0.29 dollars', 0.29, 29],
      ['0.07 dollars', 0.07, 7],
      ['a negative amount', -42.5, -4250],
      ['zero', 0, 0],
      ['a large amount', 1234567.89, 123456789],
    ];

    it.each(cases)('converts %s exactly, with no off-by-one', (_label, amount, expectedCents) => {
      seedTransaction(raw, 'txn-1', amount);
      runMigration(raw);
      expect(transactionCents(raw, 'txn-1')).toBe(expectedCents);
    });

    it('converts every case in the same run without cross-row contamination', () => {
      cases.forEach(([, amount], i) => seedTransaction(raw, `txn-${i}`, amount));
      runMigration(raw);
      cases.forEach(([, , expectedCents], i) => {
        expect(transactionCents(raw, `txn-${i}`)).toBe(expectedCents);
      });
    });

    it('rejects a NULL amount (transactions.amount is NOT NULL, unchanged by the migration)', () => {
      expect(() => seedTransaction(raw, 'txn-null', null)).toThrow();
    });
  });

  describe('budgets.amount -> amount_cents (nullable)', () => {
    it('converts a set amount exactly', () => {
      seedBudget(raw, 'b1', 800);
      runMigration(raw);
      expect(budgetCents(raw, 'b1')).toBe(80000);
    });

    it('converts a fractional amount exactly', () => {
      seedBudget(raw, 'b2', 19.99);
      runMigration(raw);
      expect(budgetCents(raw, 'b2')).toBe(1999);
    });

    it('leaves a NULL amount as NULL rather than coercing to 0', () => {
      seedBudget(raw, 'b3', null);
      runMigration(raw);
      expect(budgetCents(raw, 'b3')).toBeNull();
    });
  });

  describe('wish_list.target_amount/saved -> *_cents (nullable)', () => {
    it('converts both fields exactly', () => {
      seedWishListItem(raw, 'w1', 1200, 250.5);
      runMigration(raw);
      expect(wishListCents(raw, 'w1')).toEqual({ targetAmountCents: 120000, savedCents: 25050 });
    });

    it('leaves NULL fields as NULL independently', () => {
      seedWishListItem(raw, 'w2', 1200, null);
      seedWishListItem(raw, 'w3', null, null);
      runMigration(raw);
      expect(wishListCents(raw, 'w2')).toEqual({ targetAmountCents: 120000, savedCents: null });
      expect(wishListCents(raw, 'w3')).toEqual({ targetAmountCents: null, savedCents: null });
    });
  });

  describe('idempotency', () => {
    it('running the migration body a second time fails loudly instead of silently re-scaling', () => {
      seedTransaction(raw, 'txn-1', 19.99);
      runMigration(raw);
      expect(transactionCents(raw, 'txn-1')).toBe(1999);

      // The source `amount` column is gone after the rebuild+rename, so a
      // second raw run of this file's SQL body throws — it can NOT silently
      // read `amount_cents`, re-multiply by 100, and land on 199900.
      expect(() => runMigration(raw)).toThrow(/no such column: amount/);
      expect(transactionCents(raw, 'txn-1')).toBe(1999);
    });
  });
});

describe('0064_money_integer_cents — via the drizzle migrator', () => {
  let tmpDir: string;
  let opened: OpenedFinanceDb;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'finance-money-cents-test-'));
  });

  afterEach(() => {
    opened.raw.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies once on a fresh database, and re-opening is a no-op (not a double-scale)', () => {
    const path = join(tmpDir, 'finance.db');

    opened = openFinanceDb(path);
    const accountId = (
      opened.raw.prepare('SELECT id FROM accounts WHERE name = ? COLLATE NOCASE').get('Amex') as
        | { id: string }
        | undefined
    )?.id;
    if (!accountId) throw new Error("No seeded account named 'Amex' — did 0083_accounts.sql run?");
    const created = opened.raw
      .prepare(
        `INSERT INTO transactions
           (id, description, account_id, amount_cents, date, type, last_edited_time)
         VALUES ('txn-1', 'Coffee', ?, 1999, '2026-01-01', 'Expense', '2026-01-01T00:00:00Z')`
      )
      .run(accountId);
    expect(created.changes).toBe(1);
    opened.raw.close();

    opened = openFinanceDb(path);
    const row = opened.raw
      .prepare('SELECT amount_cents FROM transactions WHERE id = ?')
      .get('txn-1') as { amount_cents: number };
    expect(row.amount_cents).toBe(1999);
  });
});
