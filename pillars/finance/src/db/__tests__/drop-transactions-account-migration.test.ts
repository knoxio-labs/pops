/**
 * Migration test for 0091_drop_transactions_account (POPS-2770).
 *
 * Pins `transactions` exactly as it stood right after 0083/0089 — `account`
 * (free-text) and `account_id` (FK) both present — the same technique
 * `accounts-migration.test.ts` (0083) and `money-integer-cents-migration.test.ts`
 * (0064) use, rather than seeding through the full journal, which would hand
 * the migration its own output.
 *
 * Covers: the column and its index are gone after the rebuild, `account_id`
 * and every other column survive with their original values, and the
 * rebuilt table still enforces the `account_id` foreign key onto `accounts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PRE_MIGRATION_DDL = `
CREATE TABLE accounts (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  institution_id text,
  kind text NOT NULL,
  currency text NOT NULL,
  archived_at text,
  display_order integer DEFAULT 0 NOT NULL,
  entity_id text,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
INSERT INTO accounts (id, name, kind, currency) VALUES ('acct-1', 'Amex', 'credit-card', 'AUD');

CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
  account_id text NOT NULL,
  amount_cents integer NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text DEFAULT '[]' NOT NULL,
  entity_id text,
  entity_name text,
  location text,
  country text,
  related_transaction_id text,
  notes text,
  foreign_amount_minor integer,
  foreign_currency text,
  fx_fee_cents integer,
  fx_capture_source text,
  checksum text,
  raw_row text,
  last_edited_time text NOT NULL,
  match_type text,
  match_rule_id text,
  match_confidence real,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
CREATE UNIQUE INDEX transactions_notion_id_unique ON transactions (notion_id);
CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_account ON transactions (account);
CREATE INDEX idx_transactions_account_id ON transactions (account_id);
CREATE INDEX idx_transactions_entity ON transactions (entity_id);
CREATE INDEX idx_transactions_last_edited ON transactions (last_edited_time);
CREATE INDEX idx_transactions_notion_id ON transactions (notion_id);
CREATE INDEX idx_transactions_checksum ON transactions (checksum);
`;

function migrationSql(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', '..', '..', 'migrations', '0091_drop_transactions_account.sql');
  return readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function runMigration(raw: Database.Database): void {
  for (const statement of migrationSql()) raw.exec(statement);
}

function seedTransaction(raw: Database.Database, id: string, notes: string | null): void {
  raw
    .prepare(
      `INSERT INTO transactions
         (id, description, account, account_id, amount_cents, date, type, tags,
          entity_id, entity_name, notes, checksum, last_edited_time, match_type,
          match_rule_id, match_confidence)
       VALUES (?, 'Coffee', 'Amex', 'acct-1', 1999, '2026-01-01', 'expense', '["cafe"]',
               'entity-1', 'Cafe Co', ?, 'chk-1', '2026-01-01T00:00:00Z', 'exact', NULL, NULL)`
    )
    .run(id, notes);
}

function tableColumns(raw: Database.Database, table: string): string[] {
  return (raw.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
}

function indexNames(raw: Database.Database, table: string): string[] {
  return (raw.pragma(`index_list(${table})`) as Array<{ name: string }>).map((i) => i.name);
}

describe('0091_drop_transactions_account', () => {
  let raw: Database.Database;

  beforeEach(() => {
    raw = new Database(':memory:');
    raw.pragma('foreign_keys = ON');
    raw.exec(PRE_MIGRATION_DDL);
  });

  afterEach(() => {
    raw.close();
  });

  it('drops the account column and its index', () => {
    seedTransaction(raw, 'txn-1', null);
    runMigration(raw);

    const columns = tableColumns(raw, 'transactions');
    expect(columns).not.toContain('account');
    expect(columns).toContain('account_id');

    const indexes = indexNames(raw, 'transactions');
    expect(indexes).not.toContain('idx_transactions_account');
    expect(indexes).toContain('idx_transactions_account_id');
  });

  it('preserves every surviving column and row through the rebuild', () => {
    seedTransaction(raw, 'txn-1', 'a note');
    runMigration(raw);

    const row = raw.prepare('SELECT * FROM transactions WHERE id = ?').get('txn-1') as Record<
      string,
      unknown
    >;
    expect(row).toMatchObject({
      id: 'txn-1',
      description: 'Coffee',
      account_id: 'acct-1',
      amount_cents: 1999,
      date: '2026-01-01',
      type: 'expense',
      tags: '["cafe"]',
      entity_id: 'entity-1',
      entity_name: 'Cafe Co',
      notes: 'a note',
      checksum: 'chk-1',
      last_edited_time: '2026-01-01T00:00:00Z',
      match_type: 'exact',
    });
    expect('account' in row).toBe(false);
  });

  it('preserves multiple rows without cross-row contamination', () => {
    seedTransaction(raw, 'txn-1', null);
    seedTransaction(raw, 'txn-2', 'second note');
    runMigration(raw);

    const rows = raw.prepare('SELECT id, notes FROM transactions ORDER BY id').all();
    expect(rows).toEqual([
      { id: 'txn-1', notes: null },
      { id: 'txn-2', notes: 'second note' },
    ]);
  });

  it('still enforces the account_id foreign key after the rebuild', () => {
    seedTransaction(raw, 'txn-1', null);
    runMigration(raw);

    expect(() =>
      raw
        .prepare(
          `INSERT INTO transactions
             (id, description, account_id, amount_cents, date, type, tags,
              last_edited_time)
           VALUES ('txn-orphan', 'Orphan', 'no-such-account', 100, '2026-01-01', 'expense',
                   '[]', '2026-01-01T00:00:00Z')`
        )
        .run()
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('is idempotent: a second raw run leaves the surviving data unchanged', () => {
    // Unlike a lossy rename+retype (e.g. 0064's `amount` -> `amount_cents`),
    // this rebuild only drops a column nothing after it depends on, so a
    // second manual run of the SQL body converges on the same table rather
    // than erroring — the drizzle migrator never actually does this in
    // practice (it records the applied tag and skips it), but the rebuild
    // itself is safe either way.
    seedTransaction(raw, 'txn-1', 'a note');
    runMigration(raw);
    runMigration(raw);

    const row = raw.prepare('SELECT * FROM transactions WHERE id = ?').get('txn-1') as Record<
      string,
      unknown
    >;
    expect(row).toMatchObject({ id: 'txn-1', account_id: 'acct-1', notes: 'a note' });
    expect('account' in row).toBe(false);
  });
});
