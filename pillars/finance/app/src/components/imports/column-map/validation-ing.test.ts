/**
 * Tests for the ING import path (POPS-29): the amount lives in two columns,
 * Credit and Debit, and the mapper offers no Amount field for it. Rows are
 * shaped like the real export — a header row of Date, Description, Credit,
 * Debit, Balance — with values as ING prints them.
 */
import { describe, expect, it } from 'vitest';

import { combineSplitAmount, hasRequiredColumns, readRowAmount } from './parsers';
import { validateAllRows } from './validation';

import type { ColumnMap } from './parsers';

const columnMap: ColumnMap = { date: 'Date', description: 'Description', amount: '' };

function ingRow(
  date: string,
  description: string,
  credit: string,
  debit: string,
  balance = '1000.00'
): Record<string, string> {
  return { Date: date, Description: description, Credit: credit, Debit: debit, Balance: balance };
}

const PURCHASE = ingRow('14/08/2026', 'Visa Purchase - Receipt 123456 WOOLWORTHS', '', '-52.30');
const DEPOSIT = ingRow('15/08/2026', 'Internal Transfer - Receipt 654321', '250.00', '');

describe('ING — split amount', () => {
  it('reads a debit as money out, whether or not the bank signed it', () => {
    const signed = validateAllRows([PURCHASE], columnMap, 'ING', 'acc-test');
    const unsigned = validateAllRows(
      [ingRow('14/08/2026', 'Visa Purchase', '', '52.30')],
      columnMap,
      'ING',
      'acc-test'
    );
    expect(signed.parsedTransactions[0]?.amount).toBe(-52.3);
    expect(unsigned.parsedTransactions[0]?.amount).toBe(-52.3);
  });

  it('reads a credit as money in', () => {
    const { parsedTransactions } = validateAllRows([DEPOSIT], columnMap, 'ING', 'acc-test');
    expect(parsedTransactions[0]?.amount).toBe(250);
  });

  it('needs no Amount mapping, and the other banks still do', () => {
    expect(
      hasRequiredColumns(columnMap, { splitAmount: { credit: 'Credit', debit: 'Debit' } })
    ).toBe(true);
    expect(hasRequiredColumns(columnMap, {})).toBe(false);
    const { valid, errors } = validateAllRows([PURCHASE], columnMap, 'ANZ', 'acc-test');
    expect(valid).toBe(false);
    expect(errors[0]).toContain('Amount');
  });

  it('rejects a row with neither a credit nor a debit', () => {
    const blank = ingRow('16/08/2026', 'Fee waived', '', '');
    const { valid, errors } = validateAllRows([blank], columnMap, 'ING', 'acc-test');
    expect(valid).toBe(false);
    expect(errors[0]).toMatch(/^Row 2: Invalid amount/);
  });

  it('rejects a file that lacks the Credit and Debit columns instead of guessing', () => {
    const anzShaped = { Date: '14/08/2026', Description: 'WOOLWORTHS', Amount: '-52.30' };
    const { valid } = validateAllRows([anzShaped], columnMap, 'ING', 'acc-test');
    expect(valid).toBe(false);
  });

  it('finds the two columns whatever their header case or padding', () => {
    const row = { date: '14/08/2026', description: 'X', ' credit ': '', DEBIT: '-1.10' };
    expect(combineSplitAmount(row, { credit: 'Credit', debit: 'Debit' }).amount).toBe(-1.1);
  });

  it('nets a row that carries both sides', () => {
    expect(
      combineSplitAmount(ingRow('x', 'x', '10.00', '-4.00'), { credit: 'Credit', debit: 'Debit' })
    ).toMatchObject({ amount: 6, raw: '10.00 / -4.00' });
  });

  it('keeps the single-column path for a bank that has one', () => {
    const row = { Date: '14/08/2026', Description: 'X', Amount: '52.30' };
    expect(readRowAmount(row, { amount: 'Amount' }, { amountSign: 'debit-positive' }).amount).toBe(
      -52.3
    );
  });

  it('dedupes on the account and the exported description like every other dialect', () => {
    const twice = validateAllRows([PURCHASE, { ...PURCHASE }], columnMap, 'ING', 'acc-test');
    expect(twice.parsedTransactions[0]?.checksum).toBe(twice.parsedTransactions[1]?.checksum);
    expect(twice.parsedTransactions[0]?.dialectAccountLabel).toBe('ING');
  });
});
