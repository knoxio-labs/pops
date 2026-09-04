/**
 * Migration test for 0087_scope_dedup_key_to_account (POPS-2773).
 *
 * Seeds the pre-migration `transactions` table — the shape it had right after
 * `0083_accounts` (the last migration to touch this table before `0087`),
 * with checksums computed the OLD (pre-account) way — then runs the REAL
 * migration SQL and the REAL `finance_account_scoped_checksum` function,
 * asserting:
 *   - every checksummed row is re-keyed to the account-scoped canonical
 *     SHA-256, which the pure builder agrees with byte-for-byte;
 *   - the same row on two different accounts is re-keyed to two DIFFERENT
 *     checksums (the acceptance criterion this migration exists for —
 *     identical rows on two accounts both commit going forward);
 *   - re-running the migration (idempotent replay, e.g. a fresh install
 *     applying the full journal) converges on the same checksums;
 *   - null-checksum legacy rows are left untouched.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildImportDedupKeyFromStoredRow } from '../../contract/import-dedup.js';
import { centsToDollars } from '../../money.js';
import { registerFinanceSqlFunctions } from '../open-finance-db.js';

/**
 * Pinned by hand to the shape `transactions` had right after `0083_accounts`
 * (the last migration to touch this table before `0087`) — `account_id`
 * exists and is NOT NULL, `checksum` is a plain (non-unique) index as of
 * `0059`. Deliberately NOT derived from the journal (`migrated-db.ts`) —
 * that always includes `0087` itself once it lands, which would make this
 * migration test vacuous.
 */
const PRE_MIGRATION_DDL = `
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
  match_confidence real
);
CREATE INDEX idx_transactions_checksum ON transactions (checksum);
`;

function migrationSql(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', '..', '..', 'migrations', '0087_scope_dedup_key_to_account.sql');
  return readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

interface SeedRow {
  id: string;
  account: string;
  accountId: string;
  description: string;
  amountCents: number;
  date: string;
  checksum: string | null;
  rawRow: string | null;
}

function seed(raw: Database.Database, row: SeedRow): void {
  raw
    .prepare(
      `INSERT INTO transactions
         (id, description, account, account_id, amount_cents, date, type, checksum, raw_row, last_edited_time)
       VALUES
         (@id, @description, @account, @accountId, @amountCents, @date, 'Expense', @checksum, @rawRow, '2026-01-15T00:00:00Z')`
    )
    .run(row);
}

function accountScopedChecksum(
  row: Pick<SeedRow, 'date' | 'amountCents' | 'description' | 'rawRow' | 'account'>
): string {
  const key = buildImportDedupKeyFromStoredRow({
    account: row.account,
    date: row.date,
    amount: centsToDollars(row.amountCents),
    description: row.description,
    rawRow: row.rawRow,
  });
  return createHash('sha256').update(key).digest('hex');
}

describe('0087_scope_dedup_key_to_account', () => {
  let raw: Database.Database;

  beforeEach(() => {
    raw = new Database(':memory:');
    registerFinanceSqlFunctions(raw);
    raw.exec(PRE_MIGRATION_DDL);
  });

  function checksumOf(id: string): string | null {
    const row = raw.prepare('SELECT checksum FROM transactions WHERE id = ?').get(id) as
      | { checksum: string | null }
      | undefined;
    return row?.checksum ?? null;
  }

  function runMigration(): void {
    for (const statement of migrationSql()) raw.exec(statement);
  }

  it('re-keys a checksummed row to the account-scoped canonical SHA-256', () => {
    const row: SeedRow = {
      id: 'a',
      account: 'Amex',
      accountId: 'acc-amex',
      description: 'STARBUCKS STORE 1234',
      amountCents: -4250,
      date: '2026-01-15',
      checksum: 'pre-account-hash-a',
      rawRow: JSON.stringify({ Reference: 'REF-999' }),
    };
    seed(raw, row);

    runMigration();

    expect(checksumOf('a')).toBe(accountScopedChecksum(row));
    expect(checksumOf('a')).not.toBe('pre-account-hash-a');
  });

  it('splits an identical row across two accounts into two DIFFERENT checksums', () => {
    // Same subscription charged to two cards on the same day — a legitimate
    // duplicate row across accounts, not a re-export of one charge.
    const shared = {
      description: 'NETFLIX.COM',
      amountCents: -1599,
      date: '2026-02-01',
      rawRow: JSON.stringify({ Reference: '' }),
    };
    seed(raw, {
      id: 'amex-leg',
      account: 'Amex',
      accountId: 'acc-amex',
      checksum: 'old-a',
      ...shared,
    });
    seed(raw, {
      id: 'anz-leg',
      account: 'ANZ Credit Card',
      accountId: 'acc-anz',
      checksum: 'old-b',
      ...shared,
    });

    runMigration();

    const amex = checksumOf('amex-leg');
    const anz = checksumOf('anz-leg');
    expect(amex).not.toBeNull();
    expect(anz).not.toBeNull();
    expect(amex).not.toBe(anz);
  });

  it('is idempotent: re-running the migration converges on the same checksums', () => {
    const row: SeedRow = {
      id: 'a',
      account: 'Amex',
      accountId: 'acc-amex',
      description: 'STARBUCKS STORE 1234',
      amountCents: -4250,
      date: '2026-01-15',
      checksum: 'pre-account-hash-a',
      rawRow: JSON.stringify({ Reference: 'REF-999' }),
    };
    seed(raw, row);

    runMigration();
    const first = checksumOf('a');
    runMigration();
    const second = checksumOf('a');

    expect(second).toBe(first);
  });

  it('leaves null-checksum legacy rows untouched', () => {
    seed(raw, {
      id: 'legacy',
      account: 'Amex',
      accountId: 'acc-amex',
      description: 'IMPORTED FROM NOTION',
      amountCents: -500,
      date: '2020-01-01',
      checksum: null,
      rawRow: null,
    });

    runMigration();

    expect(checksumOf('legacy')).toBeNull();
  });
});
