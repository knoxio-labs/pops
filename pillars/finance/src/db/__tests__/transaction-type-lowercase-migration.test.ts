/**
 * Migration test for 0065_transaction_type_lowercase (#3607 stage 2).
 *
 * Seeds a pre-migration `transactions` table carrying the legacy capitalized
 * display types (`Expense`/`Income`/`Transfer`) plus the awkward cases (empty
 * string, an already-lowercase canonical value, a new taxonomy value, and an
 * unknown stray) and asserts the backfill lands every row on the canonical
 * lowercase taxonomy — mapping the legacy three correctly, leaving valid
 * lowercase values untouched, and defaulting everything else to `purchase` —
 * and that a second run changes nothing (idempotent).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Pinned by hand to the shape `transactions` had before 0065 ran, so the rows
 * seeded into it can still carry the capitalised `type` values the migration
 * rewrites. The current-schema suites derive their table from the journal
 * (`migrated-db.ts`); this one must NOT, because a migration test whose input
 * already carries the migration's output proves nothing.
 */
const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  account text NOT NULL,
  amount_cents integer NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  last_edited_time text NOT NULL
);
`;

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', '..', '..', 'migrations', '0065_transaction_type_lowercase.sql');
  return readFileSync(file, 'utf8');
}

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
});

afterEach(() => {
  raw.close();
});

function seed(id: string, type: string): void {
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account, amount_cents, date, type, last_edited_time)
       VALUES (?, 'seed', 'Amex', -1000, '2026-01-01', ?, '2026-01-01T00:00:00Z')`
    )
    .run(id, type);
}

function typeOf(id: string): string {
  const row = raw.prepare('SELECT type FROM transactions WHERE id = ?').get(id) as { type: string };
  return row.type;
}

describe('0065_transaction_type_lowercase', () => {
  it('maps the legacy capitalized types and defaults everything else to purchase', () => {
    seed('exp', 'Expense');
    seed('inc', 'Income');
    seed('xfer', 'Transfer');
    seed('empty', '');
    seed('stray', 'SomethingElse');
    seed('already-purchase', 'purchase');
    seed('already-refund', 'refund');

    raw.exec(migrationSql());

    expect(typeOf('exp')).toBe('purchase');
    expect(typeOf('inc')).toBe('income');
    expect(typeOf('xfer')).toBe('transfer');
    expect(typeOf('empty')).toBe('purchase');
    expect(typeOf('stray')).toBe('purchase');
    // already-canonical values must survive untouched (idempotency by construction)
    expect(typeOf('already-purchase')).toBe('purchase');
    expect(typeOf('already-refund')).toBe('refund');
  });

  it('is idempotent — a second run changes nothing', () => {
    seed('exp', 'Expense');
    seed('inc', 'Income');
    seed('xfer', 'Transfer');

    raw.exec(migrationSql());
    const afterFirst = { exp: typeOf('exp'), inc: typeOf('inc'), xfer: typeOf('xfer') };

    raw.exec(migrationSql());
    expect({ exp: typeOf('exp'), inc: typeOf('inc'), xfer: typeOf('xfer') }).toEqual(afterFirst);
    expect(afterFirst).toEqual({ exp: 'purchase', inc: 'income', xfer: 'transfer' });
  });
});
