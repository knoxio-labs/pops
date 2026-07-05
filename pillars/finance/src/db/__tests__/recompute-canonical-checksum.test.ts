/**
 * Migration test for 0059_recompute_canonical_checksum (#3611).
 *
 * Seeds the pre-migration `transactions` table — including its UNIQUE checksum
 * index and a known duplicate pair (same charge, different free-text) that only
 * the raw-row checksum let coexist — then runs the REAL migration SQL and the
 * REAL `finance_canonical_checksum` function, asserting:
 *   - every checksummed row is re-keyed to its canonical SHA-256;
 *   - the duplicate pair collapses to one checksum WITHOUT the UPDATE aborting
 *     (proving the unique index is dropped first);
 *   - genuinely different charges keep distinct checksums;
 *   - null-checksum legacy rows are untouched;
 *   - the checksum index survives as a NON-unique index.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildImportDedupKeyFromStoredRow } from '../../contract/import-dedup.js';
import { registerFinanceSqlFunctions } from '../open-finance-db.js';

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
CREATE UNIQUE INDEX idx_transactions_checksum ON transactions (checksum);
`;

function migrationSql(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', '..', '..', 'migrations', '0059_recompute_canonical_checksum.sql');
  return readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

interface SeedRow {
  id: string;
  description: string;
  amount: number;
  date: string;
  checksum: string | null;
  rawRow: string | null;
}

function seed(raw: Database.Database, row: SeedRow): void {
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account, amount, date, type, checksum, raw_row, last_edited_time)
       VALUES (@id, @description, 'Amex', @amount, @date, 'Expense', @checksum, @rawRow, '2026-01-15T00:00:00Z')`
    )
    .run(row);
}

function canonicalChecksum(
  row: Pick<SeedRow, 'date' | 'amount' | 'description' | 'rawRow'>
): string {
  const key = buildImportDedupKeyFromStoredRow({
    date: row.date,
    amount: row.amount,
    description: row.description,
    rawRow: row.rawRow,
  });
  return createHash('sha256').update(key).digest('hex');
}

describe('0059_recompute_canonical_checksum', () => {
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

  it('re-keys a checksummed row to its canonical SHA-256', () => {
    const row: SeedRow = {
      id: 'a',
      description: 'STARBUCKS STORE 1234',
      amount: -42.5,
      date: '2026-01-15',
      checksum: 'legacy-raw-row-hash-a',
      rawRow: JSON.stringify({ Reference: 'REF-999', Address: '1 King St' }),
    };
    seed(raw, row);

    runMigration();

    expect(checksumOf('a')).toBe(canonicalChecksum(row));
    expect(checksumOf('a')).not.toBe('legacy-raw-row-hash-a');
  });

  it('collapses a duplicate pair without aborting on the (dropped) unique index', () => {
    seed(raw, {
      id: 'a',
      description: 'STARBUCKS STORE 1234',
      amount: -42.5,
      date: '2026-01-15',
      checksum: 'legacy-a',
      rawRow: JSON.stringify({ Reference: 'REF-999', Address: '1 King St' }),
    });
    seed(raw, {
      id: 'a2',
      description: 'STARBUCKS STORE 1234',
      amount: -42.5,
      date: '2026-01-15',
      checksum: 'legacy-a2',
      rawRow: JSON.stringify({ Reference: 'REF-999', Address: '2 Queen St' }),
    });

    expect(() => runMigration()).not.toThrow();

    const a = checksumOf('a');
    expect(a).not.toBeNull();
    expect(checksumOf('a2')).toBe(a);
  });

  it('keeps genuinely different charges distinct and leaves null-checksum rows untouched', () => {
    seed(raw, {
      id: 'a',
      description: 'STARBUCKS STORE 1234',
      amount: -42.5,
      date: '2026-01-15',
      checksum: 'legacy-a',
      rawRow: JSON.stringify({ Reference: 'REF-999' }),
    });
    seed(raw, {
      id: 'b',
      description: 'ALDI GROCERIES',
      amount: -10,
      date: '2026-01-16',
      checksum: 'legacy-b',
      rawRow: JSON.stringify({ Reference: 'REF-111' }),
    });
    seed(raw, {
      id: 'legacy',
      description: 'IMPORTED FROM NOTION',
      amount: -5,
      date: '2020-01-01',
      checksum: null,
      rawRow: null,
    });

    runMigration();

    expect(checksumOf('a')).not.toBe(checksumOf('b'));
    expect(checksumOf('legacy')).toBeNull();
  });

  it('leaves the checksum index in place but no longer unique', () => {
    seed(raw, {
      id: 'a',
      description: 'STARBUCKS STORE 1234',
      amount: -42.5,
      date: '2026-01-15',
      checksum: 'legacy-a',
      rawRow: JSON.stringify({ Reference: 'REF-999' }),
    });

    runMigration();

    const indexes = raw.prepare('PRAGMA index_list(transactions)').all() as Array<{
      name: string;
      unique: number;
    }>;
    const checksumIndex = indexes.find((index) => index.name === 'idx_transactions_checksum');
    expect(checksumIndex).toBeDefined();
    expect(checksumIndex?.unique).toBe(0);
  });
});
