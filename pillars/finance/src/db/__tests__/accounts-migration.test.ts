/**
 * Migration test for 0083_accounts (POPS-2767).
 *
 * Pins the schema exactly as it stands right before 0083 runs (`institutions`
 * and `currencies` already exist, seeded with the AUD fiat row; `transactions`
 * has no `account_id` yet) — same technique `correct-mistyped-rows-migration.test.ts`
 * (0077) uses — rather than seeding through the full journal, which would hand
 * the migration its own output.
 *
 * Covers the two acceptance criteria the migration itself is responsible for:
 * every transaction's free-text `account` backfills to the matching seeded
 * account's id, and an `account` string that matches no seeded account name
 * fails the whole migration loudly instead of landing a NULL `account_id`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PRE_MIGRATION_DDL = `
CREATE TABLE institutions (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  colour text NOT NULL,
  logo_asset_id text,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE UNIQUE INDEX idx_institutions_name_nocase ON institutions (name COLLATE NOCASE);

CREATE TABLE currencies (
  code text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  symbol text,
  decimals integer NOT NULL,
  kind text NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
INSERT INTO currencies (code, name, symbol, decimals, kind) VALUES ('AUD', 'Australian Dollar', '$', 2, 'fiat');

CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
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
  match_confidence real
);
`;

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', '..', '..', 'migrations', '0083_accounts.sql'), 'utf8');
}

const MIGRATION = migrationSql();

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
});

afterEach(() => {
  raw.close();
});

function seedTransaction(id: string, account: string): void {
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account, amount_cents, date, type, last_edited_time)
       VALUES (?, ?, ?, ?, ?, 'purchase', '2026-01-01T00:00:00.000Z')`
    )
    .run(id, `txn on ${account}`, account, -1000, '2026-01-01');
}

function migrate(): void {
  raw.transaction(() => raw.exec(MIGRATION))();
}

describe('0083 — seeds institutions and accounts', () => {
  it('inserts one institution and one credit-card account per bank', () => {
    migrate();

    const institutions = raw
      .prepare('SELECT name, colour FROM institutions ORDER BY name')
      .all() as { name: string; colour: string }[];
    expect(institutions.map((i) => i.name)).toEqual(['ANZ', 'Amex']);
    expect(institutions.every((i) => /^#[0-9a-fA-F]{6}$/.test(i.colour))).toBe(true);

    const accounts = raw
      .prepare('SELECT name, kind, currency, institution_id FROM accounts ORDER BY name')
      .all() as { name: string; kind: string; currency: string; institution_id: string }[];
    expect(accounts.map((a) => a.name)).toEqual(['ANZ Credit Card', 'Amex']);
    for (const account of accounts) {
      expect(account.kind).toBe('credit-card');
      expect(account.currency).toBe('AUD');
      expect(account.institution_id).toEqual(expect.any(String));
    }
  });
});

describe('0083 — backfills transactions.account_id', () => {
  it('links a transaction on "Amex" to the seeded Amex account', () => {
    seedTransaction('t-amex', 'Amex');

    migrate();

    const amexId = (
      raw.prepare('SELECT id FROM accounts WHERE name = ?').get('Amex') as { id: string }
    ).id;
    const row = raw.prepare('SELECT account_id FROM transactions WHERE id = ?').get('t-amex') as {
      account_id: string;
    };
    expect(row.account_id).toBe(amexId);
  });

  it('links a transaction on "ANZ Credit Card" to the seeded ANZ account', () => {
    seedTransaction('t-anz', 'ANZ Credit Card');

    migrate();

    const anzId = (
      raw.prepare('SELECT id FROM accounts WHERE name = ?').get('ANZ Credit Card') as { id: string }
    ).id;
    const row = raw.prepare('SELECT account_id FROM transactions WHERE id = ?').get('t-anz') as {
      account_id: string;
    };
    expect(row.account_id).toBe(anzId);
  });

  it('leaves `account` untouched — the free-text column keeps being written', () => {
    seedTransaction('t-amex', 'Amex');

    migrate();

    const row = raw.prepare('SELECT account FROM transactions WHERE id = ?').get('t-amex') as {
      account: string;
    };
    expect(row.account).toBe('Amex');
  });
});

describe('0083 — fails loudly on an unmatched account string', () => {
  it('throws rather than landing a NULL account_id for a stray third account', () => {
    seedTransaction('t-amex', 'Amex');
    seedTransaction('t-stray', 'Some Other Bank');

    expect(() => migrate()).toThrow(/NOT NULL constraint failed/);
  });

  it('leaves the database as if the migration never ran when it fails', () => {
    seedTransaction('t-amex', 'Amex');
    seedTransaction('t-stray', 'Some Other Bank');

    expect(() => migrate()).toThrow();

    const accountsTable = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'")
      .get();
    expect(accountsTable).toBeUndefined();
    const stillOriginal = raw
      .prepare('SELECT account FROM transactions WHERE id = ?')
      .get('t-amex') as {
      account: string;
    };
    expect(stillOriginal.account).toBe('Amex');
  });
});
