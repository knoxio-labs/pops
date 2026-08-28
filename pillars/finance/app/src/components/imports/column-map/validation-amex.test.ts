/**
 * Amex validation: the foreign-charge and country columns the mapper does not
 * offer reach the parsed transaction, and the mapped location column still
 * applies now that Amex declares a row parser (POPS-2604).
 *
 * Values are the real export's long shape.
 */
import { describe, expect, it } from 'vitest';

import { validateAllRows } from './validation';

import type { ColumnMap } from './parsers';

const COLUMN_MAP: ColumnMap = { date: 'Date', description: 'Description', amount: 'Amount' };

function amexRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    Date: '25/07/2026',
    Description: 'NANONOBLE PTE. LTD.     SINGAPORE',
    Amount: '8.11',
    'Foreign Spend Amount': '5.50 USD',
    Commission: '0.27',
    Country: 'SINGAPORE',
    'Town/City': 'SINGAPORE',
    ...overrides,
  };
}

function parseOne(row: Record<string, string>, columnMap = COLUMN_MAP) {
  const result = validateAllRows([row], columnMap, 'Amex');
  expect(result.errors).toEqual([]);
  return result.parsedTransactions[0];
}

describe('Amex import validation', () => {
  it('carries the country and all three foreign-charge fields off the row', () => {
    expect(parseOne(amexRow())).toMatchObject({
      country: 'SG',
      foreignAmountMinor: 550,
      foreignCurrency: 'USD',
      fxFeeCents: 27,
      // Purchases are stated positive by Amex and signed negative for the ledger.
      amount: -8.11,
    });
  });

  it('leaves the three columns unset on a domestic row while still stating the country', () => {
    const parsed = parseOne(
      amexRow({ 'Foreign Spend Amount': '', Commission: '', Country: 'AUSTRALIA' })
    );

    expect(parsed?.country).toBe('AU');
    expect(parsed?.foreignAmountMinor).toBeUndefined();
    expect(parsed?.foreignCurrency).toBeUndefined();
    expect(parsed?.fxFeeCents).toBeUndefined();
  });

  it('still honours the mapped location column, which the row parser does not supply', () => {
    const parsed = parseOne(amexRow(), { ...COLUMN_MAP, location: 'Town/City' });

    expect(parsed?.location).toBe('Singapore');
  });

  it('parses the short four-column export as a domestic row with no country', () => {
    const parsed = parseOne({ Date: '25/07/2026', Description: 'ALDI 1234', Amount: '42.50' });

    expect(parsed?.country).toBeUndefined();
    expect(parsed?.foreignCurrency).toBeUndefined();
    expect(parsed?.description).toBe('ALDI 1234');
  });
});
