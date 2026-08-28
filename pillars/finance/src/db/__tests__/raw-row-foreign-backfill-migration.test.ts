/**
 * Migration test for 0072_backfill_foreign_charge_from_raw_row.
 *
 * Seeds `transactions` with the three `raw_row` shapes the live ledger actually
 * holds — the long Amex export, the headerless ANZ export whose foreign detail
 * is a trailer inside the description, and the short four-column Amex export
 * that carries nothing — then runs the REAL migration SQL through the REAL
 * `finance_raw_row_foreign` function.
 *
 * Both directions are asserted: the rows carrying source data get all four
 * fields, and the rows that do not are left NULL rather than zeroed. The abort
 * path runs inside a transaction so the rollback is observed rather than
 * assumed, and the second-run no-op is asserted by comparing the whole table
 * before and after.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerFinanceSqlFunctions } from '../open-finance-db.js';

/**
 * Pinned by hand to the shape `transactions` had after 0066 and before 0072 —
 * the foreign-charge columns exist and are empty, which is precisely the state
 * this migration repairs. Deriving it from the journal would run 0072 over the
 * input and prove nothing.
 */
const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  account text NOT NULL,
  amount_cents integer NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  country text,
  raw_row text,
  foreign_amount_minor integer,
  foreign_currency text,
  fx_fee_cents integer,
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
    '0072_backfill_foreign_charge_from_raw_row.sql'
  );
  return readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function anzRawRow(description: string): string {
  return JSON.stringify({
    Date: '12/06/2026',
    Amount: '-148.63',
    Description: description,
    'Column 4': '',
    'Column 5': '',
    'Column 6': '',
    'Column 7': '',
    'Column 8': '',
  });
}

const AMEX_LONG_COLUMNS = {
  Date: '12/06/2026',
  'Date Processed': '13/06/2026',
  Description: 'MERCHANT',
  Amount: '148.63',
  'Foreign Spend Amount': '',
  Commission: '',
  'Exchange Rate': '',
  'Additional Information': '',
  'Appears On Your Statement As': 'MERCHANT',
  Address: '',
  'Town/City': '',
  Postcode: '',
  Country: '',
  Reference: '',
};

function amexRawRow(cells: Record<string, string>): string {
  return JSON.stringify({ ...AMEX_LONG_COLUMNS, ...cells });
}

/** The short export Amex also ships. The columns are absent, not empty. */
const AMEX_SHORT_RAW_ROW = JSON.stringify({
  Date: '12/07/2026',
  'Date Processed': '13/07/2026',
  Description: 'MERCHANT',
  Amount: '148.63',
});

interface SeedRow {
  id: string;
  country?: string | null;
  rawRow: string | null;
  foreignCurrency?: string | null;
  foreignAmountMinor?: number | null;
  fxFeeCents?: number | null;
}

/**
 * The three ANZ descriptions are verbatim `raw_row.Description` values from the
 * live ledger — the only rows in that export carrying a currency marker.
 */
const SEEDS: readonly SeedRow[] = [
  {
    id: 'anz-github',
    rawRow: anzRawRow('GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD'),
  },
  {
    id: 'anz-fileflows',
    rawRow: anzRawRow('FILEFLOWS                 CONIFER GROVE  6.99  USD 0.35 AUD'),
  },
  {
    id: 'anz-corridor',
    rawRow: anzRawRow('CORRIDORDIGITAL           CORRIDORDIGIT  3.99  USD 0.20 AUD'),
  },
  // Zero-decimal: `1 100  JPY` is 1100 minor units, not 110000.
  {
    id: 'anz-jpy',
    rawRow: anzRawRow('TOKYO RAMEN               SHIBUYA  1 100  JPY 0.40 AUD'),
  },
  { id: 'anz-domestic', rawRow: anzRawRow('ALDI STORES - MARRICKV    MARRICKVILLE') },
  {
    id: 'amex-foreign',
    rawRow: amexRawRow({
      'Foreign Spend Amount': '5.50 USD',
      Commission: '0.27',
      Country: 'SINGAPORE',
    }),
  },
  { id: 'amex-domestic', rawRow: amexRawRow({ Country: 'AUSTRALIA' }) },
  // Amex prints the UK under a name no standard list carries; the parser yields
  // no country rather than guessing, and the backfill must not write one.
  { id: 'amex-unmapped-country', rawRow: amexRawRow({ Country: 'ATLANTIS' }) },
  { id: 'amex-short', rawRow: AMEX_SHORT_RAW_ROW },
  { id: 'no-raw-row', rawRow: null },
  // Already captured by the importer POPS-2604 fixed. Must not be rewritten.
  {
    id: 'already-captured',
    country: 'JP',
    rawRow: anzRawRow('TOKYO RAMEN               SHIBUYA  1 100  JPY 0.40 AUD'),
    foreignCurrency: 'JPY',
    foreignAmountMinor: 1100,
    fxFeeCents: 40,
  },
];

interface BackfilledRow {
  country: string | null;
  foreign_amount_minor: number | null;
  foreign_currency: string | null;
  fx_fee_cents: number | null;
}

const NOTHING_RECOVERED: BackfilledRow = {
  country: null,
  foreign_amount_minor: null,
  foreign_currency: null,
  fx_fee_cents: null,
};

describe('0072_backfill_foreign_charge_from_raw_row', () => {
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
        `INSERT INTO transactions
           (id, description, account, amount_cents, date, type, country, raw_row,
            foreign_amount_minor, foreign_currency, fx_fee_cents, last_edited_time)
         VALUES (@id, 'MERCHANT', 'anz-credit-card', -14863, '2026-06-12', 'purchase',
                 @country, @rawRow, @foreignAmountMinor, @foreignCurrency, @fxFeeCents,
                 '2026-06-12T00:00:00Z')`
      )
      .run({
        country: null,
        foreignAmountMinor: null,
        foreignCurrency: null,
        fxFeeCents: null,
        ...row,
      });
  }

  function runMigration(): void {
    raw.exec('BEGIN');
    try {
      for (const statement of migrationSql()) raw.exec(statement);
      raw.exec('COMMIT');
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
  }

  function rowOf(id: string): BackfilledRow {
    return raw
      .prepare(
        `SELECT country, foreign_amount_minor, foreign_currency, fx_fee_cents
         FROM transactions WHERE id = ?`
      )
      .get(id) as BackfilledRow;
  }

  function wholeTable(): unknown[] {
    return raw.prepare(`SELECT * FROM transactions ORDER BY id`).all();
  }

  describe('the backfill', () => {
    beforeEach(() => {
      runMigration();
    });

    it.each([
      ['anz-github', 10_000, 503],
      ['anz-fileflows', 699, 35],
      ['anz-corridor', 399, 20],
    ])('recovers %s from the trailer inside the ANZ description', (id, amountMinor, feeCents) => {
      expect(rowOf(id)).toEqual({
        country: 'US',
        foreign_amount_minor: amountMinor,
        foreign_currency: 'USD',
        fx_fee_cents: feeCents,
      });
    });

    it('recovers a zero-decimal charge as whole units', () => {
      expect(rowOf('anz-jpy')).toEqual({
        country: 'JP',
        foreign_amount_minor: 1100,
        foreign_currency: 'JPY',
        fx_fee_cents: 40,
      });
    });

    it('recovers the Amex columns including the merchant country', () => {
      expect(rowOf('amex-foreign')).toEqual({
        country: 'SG',
        foreign_amount_minor: 550,
        foreign_currency: 'USD',
        fx_fee_cents: 27,
      });
    });

    it('recovers the country of a domestic Amex row without inventing a charge', () => {
      expect(rowOf('amex-domestic')).toEqual({ ...NOTHING_RECOVERED, country: 'AU' });
    });

    it('writes no country the parser did not yield', () => {
      expect(rowOf('amex-unmapped-country')).toEqual(NOTHING_RECOVERED);
    });

    it.each(['anz-domestic', 'amex-short', 'no-raw-row'])(
      'leaves %s with all three columns NULL rather than zeroed',
      (id) => {
        expect(rowOf(id)).toEqual(NOTHING_RECOVERED);
      }
    );

    it('does not overwrite a row the importer already captured', () => {
      expect(rowOf('already-captured')).toEqual({
        country: 'JP',
        foreign_amount_minor: 1100,
        foreign_currency: 'JPY',
        fx_fee_cents: 40,
      });
    });

    it('drops its guard table', () => {
      const tables = raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
        name: string;
      }[];
      expect(tables.map((table) => table.name)).not.toContain('_raw_row_foreign_backfill_guard');
    });

    it('changes nothing on a second run', () => {
      const before = wholeTable();
      runMigration();
      expect(wholeTable()).toEqual(before);
    });
  });

  describe('the count guard', () => {
    it('aborts on an ANZ trailer it cannot read, rolling the batch back', () => {
      // A stated foreign charge in a currency with no known minor-unit scale
      // would have to be scaled by a guessed power of ten. Recording it as
      // domestic is unrecoverable, so the whole batch fails instead.
      seed({
        id: 'drifted-anz',
        rawRow: anzRawRow('SOMEWHERE ODD             ELSEWHERE  10.00  ZZZ 0.34 AUD'),
      });

      expect(() => runMigration()).toThrow(/CHECK constraint failed/);

      expect(rowOf('anz-github')).toEqual(NOTHING_RECOVERED);
    });

    it('aborts on an Amex foreign spend in an unreadable shape', () => {
      seed({
        id: 'drifted-amex',
        rawRow: amexRawRow({ 'Foreign Spend Amount': 'USD 5.50', Commission: '0.27' }),
      });
      expect(() => runMigration()).toThrow(/CHECK constraint failed/);
    });

    it('aborts on a foreign spend stated without its commission', () => {
      // A charge recorded as free to convert is a wrong number; a charge
      // recorded as uncaptured is a missing one.
      seed({
        id: 'no-commission',
        rawRow: amexRawRow({ 'Foreign Spend Amount': '5.50 USD', Commission: '' }),
      });
      expect(() => runMigration()).toThrow(/CHECK constraint failed/);
    });

    it('runs clean when there is nothing to recover', () => {
      raw.exec(`DELETE FROM transactions`);
      seed({ id: 'amex-short-only', rawRow: AMEX_SHORT_RAW_ROW });
      expect(() => runMigration()).not.toThrow();
      expect(rowOf('amex-short-only')).toEqual(NOTHING_RECOVERED);
    });
  });
});
