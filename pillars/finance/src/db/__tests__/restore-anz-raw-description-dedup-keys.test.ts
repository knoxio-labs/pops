/** Migration test for 0097_restore_anz_raw_description_dedup_keys. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildImportDedupKey } from '../../contract/import-dedup.js';
import { registerFinanceSqlFunctions } from '../open-finance-db.js';

const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  account_id text NOT NULL,
  amount_cents integer NOT NULL,
  date text NOT NULL,
  checksum text,
  raw_row text
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
    '0097_restore_anz_raw_description_dedup_keys.sql'
  );
  return readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function checksumOf(raw: Database.Database, id: string): string | null {
  const row = raw.prepare('SELECT checksum FROM transactions WHERE id = ?').get(id) as
    | { checksum: string | null }
    | undefined;
  return row?.checksum ?? null;
}

function runMigration(raw: Database.Database): void {
  for (const statement of migrationSql()) raw.exec(statement);
}

describe('0097_restore_anz_raw_description_dedup_keys', () => {
  let raw: Database.Database;

  beforeEach(() => {
    raw = new Database(':memory:');
    registerFinanceSqlFunctions(raw);
    raw.exec(PRE_MIGRATION_DDL);
  });

  it('restores a padded ANZ description to the checksum produced by a re-import', () => {
    const accountId = 'acc-anz-credit';
    const date = '2026-06-12';
    const amountCents = -14_863;
    const rawDescription = 'GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD';
    const storedDescription = 'GITHUB INC.';
    const rawRow = JSON.stringify({
      Date: '12/06/2026',
      Amount: '-148.63',
      Description: rawDescription,
      'Column 4': '',
      'Column 5': '',
      'Column 6': '',
      'Column 7': '',
      'Column 8': '',
    });
    const staleChecksum = sha256(
      buildImportDedupKey({
        accountId,
        date,
        amount: -148.63,
        description: storedDescription,
      })
    );
    const reimportChecksum = sha256(
      buildImportDedupKey({
        accountId,
        date,
        amount: -148.63,
        description: rawDescription,
      })
    );

    raw
      .prepare(
        `INSERT INTO transactions (id, description, account_id, amount_cents, date, checksum, raw_row)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run('anz', storedDescription, accountId, amountCents, date, staleChecksum, rawRow);

    runMigration(raw);

    expect(staleChecksum).not.toBe(reimportChecksum);
    expect(checksumOf(raw, 'anz')).toBe(reimportChecksum);
  });

  it('does not re-key an Amex row, whose stored description is already canonical', () => {
    const checksum = 'amex-checksum';
    raw
      .prepare(
        `INSERT INTO transactions (id, description, account_id, amount_cents, date, checksum, raw_row)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'amex',
        'STARBUCKS STORE 1234',
        'acc-amex',
        -4250,
        '2026-06-12',
        checksum,
        JSON.stringify({
          Date: '12/06/2026',
          Description: 'STARBUCKS STORE 1234',
          Amount: '42.50',
          Reference: 'REF-999',
        })
      );

    runMigration(raw);

    expect(checksumOf(raw, 'amex')).toBe(checksum);
  });

  it('leaves a legacy ANZ row with no checksum untouched', () => {
    raw
      .prepare(
        `INSERT INTO transactions (id, description, account_id, amount_cents, date, checksum, raw_row)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'legacy-anz',
        'GITHUB INC.',
        'acc-anz-credit',
        -14_863,
        '2026-06-12',
        null,
        JSON.stringify({
          Date: '12/06/2026',
          Amount: '-148.63',
          Description: 'GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD',
          'Column 4': '',
          'Column 5': '',
          'Column 6': '',
          'Column 7': '',
          'Column 8': '',
        })
      );

    runMigration(raw);

    expect(checksumOf(raw, 'legacy-anz')).toBeNull();
  });
});
