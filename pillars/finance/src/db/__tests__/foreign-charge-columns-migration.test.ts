/**
 * Migration test for 0066_transaction_foreign_charge_columns.
 *
 * Seeds the pre-migration `transactions` table with the note shapes the ANZ
 * importer actually wrote — including the zero-decimal currencies whose
 * thousands separator is a SPACE, which are a quarter of the affected rows and
 * which a `[\d,.]+` amount pattern skips without failing — plus a note the user
 * wrote themselves, then runs the REAL migration SQL against the REAL
 * `finance_anz_fx_note` function.
 *
 * Both directions are asserted: the columns hold the right minor units, and
 * every note the importer did not write is byte-identical afterwards. The
 * abort path is exercised too, in a transaction, so the rollback is observed
 * rather than assumed.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerFinanceSqlFunctions } from '../open-finance-db.js';

const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  account text NOT NULL,
  amount_cents integer NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  country text,
  notes text,
  last_edited_time text NOT NULL
);
`;

function migrationSql(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(
    here,
    '..',
    '..',
    '..',
    'migrations',
    '0066_transaction_foreign_charge_columns.sql'
  );
  return readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

interface SeedRow {
  id: string;
  country: string | null;
  notes: string | null;
}

/** Every note shape below was produced by `describeForeignCharge` as it shipped. */
const SEEDS: readonly SeedRow[] = [
  { id: 'usd', country: 'US', notes: '100.00 USD, 5.03 AUD fx fee' },
  // ANZ writes zero-decimal thousands with a space, never a comma.
  { id: 'jpy', country: 'JP', notes: '1 100 JPY, 0.40 AUD fx fee' },
  { id: 'jpy-large', country: 'JP', notes: '35 340 JPY, 13.40 AUD fx fee' },
  // EUR spans nineteen countries, so the parser stored no country. The backfill
  // must not invent one.
  { id: 'eur', country: null, notes: '14.99 EUR, 0.75 AUD fx fee' },
  { id: 'vuv', country: 'VU', notes: '2 500 VUV, 1.00 AUD fx fee' },
  { id: 'user-note', country: null, notes: 'Split with Mia — she owes me 20 AUD for this' },
  // Same words, the user's casing. A case-insensitive LIKE would make this a
  // candidate, fail to parse it, and abort a migration that had nothing to do.
  { id: 'user-note-lowercase', country: null, notes: 'refunded me the aud fx fee' },
  { id: 'domestic', country: null, notes: null },
];

interface BackfilledRow {
  foreign_amount_minor: number | null;
  foreign_currency: string | null;
  fx_fee_cents: number | null;
  notes: string | null;
  country: string | null;
}

describe('0066_transaction_foreign_charge_columns', () => {
  let raw: Database.Database;

  beforeEach(() => {
    raw = new Database(':memory:');
    registerFinanceSqlFunctions(raw);
    raw.exec(PRE_MIGRATION_DDL);
    for (const row of SEEDS) seed(row);
  });

  function seed(row: SeedRow): void {
    raw
      .prepare(
        `INSERT INTO transactions (id, description, account, amount_cents, date, type, country, notes, last_edited_time)
         VALUES (@id, 'MERCHANT', 'anz-credit-card', -14863, '2026-06-12', 'purchase', @country, @notes, '2026-06-12T00:00:00Z')`
      )
      .run(row);
  }

  function runMigration(): void {
    for (const statement of migrationSql()) raw.exec(statement);
  }

  function runMigrationInTransaction(): void {
    raw.exec('BEGIN');
    try {
      runMigration();
      raw.exec('COMMIT');
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
  }

  function rowOf(id: string): BackfilledRow {
    return raw
      .prepare(
        `SELECT foreign_amount_minor, foreign_currency, fx_fee_cents, notes, country
         FROM transactions WHERE id = ?`
      )
      .get(id) as BackfilledRow;
  }

  describe('the backfill', () => {
    beforeEach(() => {
      runMigrationInTransaction();
    });

    it('reads a two-decimal charge into minor units', () => {
      expect(rowOf('usd')).toMatchObject({
        foreign_amount_minor: 10_000,
        foreign_currency: 'USD',
        fx_fee_cents: 503,
      });
    });

    it.each([
      ['jpy', 1100, 'JPY', 40],
      ['jpy-large', 35_340, 'JPY', 1340],
      ['vuv', 2500, 'VUV', 100],
    ])(
      'reads the space-separated thousands of zero-decimal %s as whole units',
      (id, amountMinor, currency, feeCents) => {
        // The whole point of the guard: 1 100 JPY is 1100 minor units, not
        // 110000 — JPY has no minor unit — and not skipped for want of a comma.
        expect(rowOf(id)).toMatchObject({
          foreign_amount_minor: amountMinor,
          foreign_currency: currency,
          fx_fee_cents: feeCents,
        });
      }
    );

    it('backfills a EUR charge without inventing a country', () => {
      expect(rowOf('eur')).toMatchObject({
        foreign_amount_minor: 1499,
        foreign_currency: 'EUR',
        fx_fee_cents: 75,
        country: null,
      });
    });

    it('clears every note it read', () => {
      const remaining = raw
        .prepare(`SELECT count(*) AS n FROM transactions WHERE notes GLOB '* AUD fx fee'`)
        .get() as { n: number };
      expect(remaining.n).toBe(0);
    });

    it('leaves the user their own note, byte for byte', () => {
      const seeded = SEEDS.find((row) => row.id === 'user-note');
      expect(rowOf('user-note').notes).toBe(seeded?.notes);
      expect(rowOf('user-note')).toMatchObject({
        foreign_amount_minor: null,
        foreign_currency: null,
        fx_fee_cents: null,
      });
    });

    it("does not treat the user's lowercase mention of the suffix as its own output", () => {
      expect(rowOf('user-note-lowercase').notes).toBe('refunded me the aud fx fee');
    });

    it('leaves a domestic row entirely alone', () => {
      expect(rowOf('domestic')).toMatchObject({
        notes: null,
        foreign_amount_minor: null,
        foreign_currency: null,
        fx_fee_cents: null,
      });
    });
  });

  describe('the count guard', () => {
    it('aborts on a candidate note it cannot read, rolling the batch back', () => {
      // A note carrying the importer's suffix that the parser cannot decode
      // means the format drifted. Clearing it would be unrecoverable, so the
      // whole batch must fail rather than cover the rows it does understand.
      seed({ id: 'drifted', country: 'JP', notes: '1.100,00 JPY, 0.40 AUD fx fee' });

      expect(() => runMigrationInTransaction()).toThrow(/CHECK constraint failed/);

      const columns = raw.prepare(`PRAGMA table_info(transactions)`).all() as { name: string }[];
      expect(columns.map((column) => column.name)).not.toContain('foreign_amount_minor');
      const notes = raw.prepare(`SELECT notes FROM transactions WHERE id = 'usd'`).get() as {
        notes: string | null;
      };
      expect(notes.notes).toBe('100.00 USD, 5.03 AUD fx fee');
    });

    it('aborts on a currency whose minor-unit scale is unknown', () => {
      // Scaling an unrecognised currency would guess a power of ten. The
      // migration refuses instead.
      seed({ id: 'unknown-ccy', country: null, notes: '10.00 ZZZ, 0.34 AUD fx fee' });
      expect(() => runMigrationInTransaction()).toThrow(/CHECK constraint failed/);
    });

    it('runs clean when nothing needs backfilling', () => {
      raw.exec(`DELETE FROM transactions WHERE notes GLOB '* AUD fx fee'`);
      expect(() => runMigrationInTransaction()).not.toThrow();
      expect(rowOf('user-note').notes).toBe('Split with Mia — she owes me 20 AUD for this');
    });
  });
});
