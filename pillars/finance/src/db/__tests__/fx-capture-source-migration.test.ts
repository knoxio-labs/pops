/**
 * Migration test for 0074_fx_capture_source (POPS-2647).
 *
 * The column exists so a stored row can say capture RAN, which `country` and
 * the three foreign columns cannot: on ANZ — a source that prints no country —
 * a domestic row is byte-identical to one imported before anything read the
 * descriptor.
 *
 * 0072 backfilled the rows before this column existed, so 0074 has to mark them
 * itself, through the same `finance_raw_row_foreign` routing 0072 used. The
 * cases that matter are the ones where nothing was found: a domestic ANZ row
 * must come out marked, and a row of no recognised shape must come out NULL
 * rather than claiming `unavailable` on an importer's behalf.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerFinanceSqlFunctions } from '../open-finance-db.js';

/** `transactions` as it stands after 0072 and before this migration. */
const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  raw_row text,
  foreign_currency text,
  last_edited_time text NOT NULL
);
`;

function migrationStatements(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(here, '..', '..', '..', 'migrations', '0074_fx_capture_source.sql'),
    'utf8'
  )
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

const AMEX_LONG_RAW_ROW = JSON.stringify({
  Date: '12/06/2026',
  Description: 'MERCHANT',
  Amount: '148.63',
  'Foreign Spend Amount': '',
  Commission: '',
  Country: 'AUSTRALIA',
});

/** The short export: the foreign columns are absent, not empty. */
const AMEX_SHORT_RAW_ROW = JSON.stringify({
  Date: '12/07/2026',
  Description: 'MERCHANT',
  Amount: '148.63',
});

const ANZ_PDF_RAW_ROW = JSON.stringify({
  source: 'anz-pdf-statement',
  line: '13/06/2026 12/06/2026 1234 ALDI STORES - MARRICKV    MARRICKVILLE 23.22 1,234.56',
});

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  registerFinanceSqlFunctions(raw);
  raw.exec(PRE_MIGRATION_DDL);
});

function seed(id: string, rawRow: string | null): void {
  raw
    .prepare(
      `INSERT INTO transactions (id, description, raw_row, last_edited_time)
       VALUES (?, 'MERCHANT', ?, '2026-06-12T00:00:00Z')`
    )
    .run(id, rawRow);
}

function migrate(): void {
  raw.exec('BEGIN');
  try {
    for (const statement of migrationStatements()) raw.exec(statement);
    raw.exec('COMMIT');
  } catch (error) {
    raw.exec('ROLLBACK');
    throw error;
  }
}

function captureSourceOf(id: string): string | null {
  const row = raw.prepare('SELECT fx_capture_source FROM transactions WHERE id = ?').get(id) as
    | { fx_capture_source: string | null }
    | undefined;
  if (!row) throw new Error(`transaction ${id} vanished`);
  return row.fx_capture_source;
}

describe('0074 — marking what the backfill could read', () => {
  it('marks a domestic ANZ row, which is the row the column exists for', () => {
    seed('anz-domestic', anzRawRow('ALDI STORES - MARRICKV    MARRICKVILLE'));

    migrate();

    expect(captureSourceOf('anz-domestic')).toBe('anz-descriptor');
  });

  it('marks a foreign ANZ row with the same source — the parser is the same one', () => {
    seed('anz-foreign', anzRawRow('GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD'));

    migrate();

    expect(captureSourceOf('anz-foreign')).toBe('anz-descriptor');
  });

  it('marks an ANZ PDF statement line, whose row is a different shape entirely', () => {
    seed('anz-pdf', ANZ_PDF_RAW_ROW);

    migrate();

    expect(captureSourceOf('anz-pdf')).toBe('anz-descriptor');
  });

  it('marks a long Amex row by the columns being present, not by them holding values', () => {
    seed('amex-long', AMEX_LONG_RAW_ROW);

    migrate();

    expect(captureSourceOf('amex-long')).toBe('amex-columns');
  });
});

describe('0074 — the rows no parser owns', () => {
  it.each([
    ['amex-short', AMEX_SHORT_RAW_ROW],
    ['unknown-bank', JSON.stringify({ Date: '12/06/2026', Description: 'X', Amount: '1.00' })],
    ['malformed', '{not json'],
    ['no-raw-row', null],
  ])("leaves %s NULL rather than claiming unavailable on an importer's behalf", (id, rawRow) => {
    seed(id, rawRow);

    migrate();

    expect(captureSourceOf(id)).toBeNull();
  });
});

describe('0074 — idempotency', () => {
  it('is a no-op on a second run', () => {
    seed('anz', anzRawRow('ALDI STORES - MARRICKV    MARRICKVILLE'));
    seed('amex-short', AMEX_SHORT_RAW_ROW);

    migrate();
    const afterFirst = raw.prepare('SELECT * FROM transactions ORDER BY id').all();

    raw.exec(migrationStatements().slice(1).join(';'));

    expect(raw.prepare('SELECT * FROM transactions ORDER BY id').all()).toEqual(afterFirst);
  });

  it('never overwrites a value an import already declared', () => {
    seed('anz', anzRawRow('ALDI STORES - MARRICKV    MARRICKVILLE'));

    migrate();
    raw.prepare("UPDATE transactions SET fx_capture_source = 'unavailable' WHERE id = 'anz'").run();
    raw.exec(migrationStatements().slice(1).join(';'));

    expect(captureSourceOf('anz')).toBe('unavailable');
  });
});
