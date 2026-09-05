/**
 * Tests for the per-bank CSV dialect, and for the headerless parse it drives.
 *
 * The parse is exercised through Papa Parse directly with the same options
 * `UploadStep` passes, so the assertions cover the real CSV reader rather than
 * a hand-split string.
 */
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import { bankDialect, HEADERLESS_ANZ_COLUMNS } from './bank-dialect';
import { autoDetectColumns } from './column-map/parsers';

/** Two real ANZ lines, complete with the CRLF and five unused columns. */
const ANZ_CSV =
  '31/07/2026,"-23.22",PP*HUMBLEBUNDL HUMBLEBUND 4029357733,,,,,\r\n' +
  '23/07/2026,"500.00",PAYMENT THANKYOU 754244,,,,,\r\n';

function parseHeaderless(csv: string, columns: readonly string[]) {
  const { data } = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: true });
  return data.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] ?? '']))
  );
}

describe('bankDialect', () => {
  it('declares ANZ credit card as headerless with debits already signed', () => {
    expect(bankDialect('ANZ Credit Card')).toMatchObject({
      hasHeader: false,
      amountSign: 'debit-negative',
    });
  });

  it('declares ING as headed with the amount split across Credit and Debit (POPS-29)', () => {
    expect(bankDialect('ING')).toMatchObject({
      hasHeader: true,
      splitAmount: { credit: 'Credit', debit: 'Debit' },
    });
  });

  it('leaves the headed, debit-positive banks on the default', () => {
    for (const bank of ['ANZ', 'Amex', 'Up'] as const) {
      expect(bankDialect(bank)).toMatchObject({
        hasHeader: true,
        amountSign: 'debit-positive',
      });
    }
  });

  it('gives a field parser to the banks whose fields the mapper cannot reach', () => {
    // ANZ packs them into the description; Amex puts them in unmappable columns.
    expect(bankDialect('ANZ Credit Card').deriveFields).toBeTypeOf('function');
    expect(bankDialect('Amex').deriveFields).toBeTypeOf('function');
  });

  it('leaves the banks with no hidden fields without a parser', () => {
    for (const bank of ['ANZ', 'ING', 'Up'] as const) {
      expect(bankDialect(bank).deriveFields).toBeUndefined();
    }
  });

  it('gives only the split-amount bank two amount columns', () => {
    for (const bank of ['ANZ', 'ANZ Credit Card', 'Amex', 'Up'] as const) {
      expect(bankDialect(bank).splitAmount).toBeUndefined();
    }
  });
});

describe('headerless parse', () => {
  it('does not consume the first transaction as a header row', () => {
    const rows = parseHeaderless(ANZ_CSV, HEADERLESS_ANZ_COLUMNS);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Date: '31/07/2026', Amount: '-23.22' });
  });

  it('strips the CRLF rather than trailing it into the last column', () => {
    const rows = parseHeaderless(ANZ_CSV, HEADERLESS_ANZ_COLUMNS);
    expect(rows[0]?.['Column 8']).toBe('');
    expect(rows[1]?.Description).toBe('PAYMENT THANKYOU 754244');
  });

  it('produces column names the existing auto-detection recognises', () => {
    // The synthetic names are what spare the rest of the wizard from knowing
    // the file had no header; auto-detect matching them is what makes the
    // mapping step land pre-filled instead of empty.
    expect(autoDetectColumns([...HEADERLESS_ANZ_COLUMNS])).toMatchObject({
      date: 'Date',
      description: 'Description',
      amount: 'Amount',
    });
  });
});
