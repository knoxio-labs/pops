import crypto from 'crypto-js';
import { describe, expect, it } from 'vitest';

/**
 * Tests for CSV row validation covering the two import write-path fixes:
 *
 *   - #3608: the persisted `account` is the SELECTED bank, not a hardcoded
 *     "Amex". A non-Amex bank is asserted so the old literal cannot pass.
 *   - #3611: the checksum is the canonical dedup identity (date + amount +
 *     normalized description + bank reference), not SHA-256 of the raw row, so
 *     two exports of one charge differing only in a free-text column dedupe,
 *     while genuinely different charges do not.
 */
import { buildImportDedupKey } from '@pops/finance';

import { validateAllRows } from './validation';

import type { ColumnMap } from './parsers';

const columnMap: ColumnMap = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
};

const baseRow = {
  Date: '15/01/2026',
  Description: 'STARBUCKS STORE 1234',
  Amount: '42.50',
  Reference: 'REF-999',
  Address: '1 King St',
};

describe('validateAllRows — account (#3608)', () => {
  it('persists the selected bank account, not a hardcoded Amex', () => {
    const result = validateAllRows([baseRow], columnMap, 'ANZ');
    expect(result.valid).toBe(true);
    expect(result.parsedTransactions).toHaveLength(1);
    expect(result.parsedTransactions[0]?.account).toBe('ANZ');
  });

  it('threads through every supported bank', () => {
    for (const bank of ['ANZ', 'ANZ Credit Card', 'Amex', 'ING', 'Up'] as const) {
      const result = validateAllRows([baseRow], columnMap, bank);
      expect(result.parsedTransactions[0]?.account).toBe(bank);
    }
  });
});

describe('validateAllRows — canonical checksum (#3611)', () => {
  it('gives two exports differing only in a free-text column the same checksum', () => {
    const rowA = { ...baseRow, Address: '1 King St' };
    const rowB = { ...baseRow, Address: '2 Queen St' };
    const result = validateAllRows([rowA, rowB], columnMap, 'Amex');
    expect(result.parsedTransactions[0]?.checksum).toBe(result.parsedTransactions[1]?.checksum);
    // The raw rows genuinely differ — the OLD raw-row checksum would not have matched.
    expect(result.parsedTransactions[0]?.rawRow).not.toBe(result.parsedTransactions[1]?.rawRow);
  });

  it('distinguishes a different merchant, amount, and bank reference', () => {
    const [base] = validateAllRows([baseRow], columnMap, 'Amex').parsedTransactions;
    const merchant = validateAllRows(
      [{ ...baseRow, Description: 'ALDI GROCERIES' }],
      columnMap,
      'Amex'
    ).parsedTransactions[0];
    const amount = validateAllRows([{ ...baseRow, Amount: '43.00' }], columnMap, 'Amex')
      .parsedTransactions[0];
    const reference = validateAllRows([{ ...baseRow, Reference: 'REF-000' }], columnMap, 'Amex')
      .parsedTransactions[0];
    expect(merchant?.checksum).not.toBe(base?.checksum);
    expect(amount?.checksum).not.toBe(base?.checksum);
    expect(reference?.checksum).not.toBe(base?.checksum);
  });

  it('matches the shared canonical key hashed with crypto-js', () => {
    const [parsed] = validateAllRows([baseRow], columnMap, 'Amex').parsedTransactions;
    const expected = crypto
      .SHA256(
        buildImportDedupKey({
          account: 'Amex',
          date: '2026-01-15',
          amount: -42.5,
          description: 'STARBUCKS STORE 1234',
          reference: 'REF-999',
        })
      )
      .toString();
    expect(parsed?.checksum).toBe(expected);
    // Pinned digest shared with the contract-level unit test — proves the
    // browser parser and the pure key builder agree byte-for-byte.
    expect(parsed?.checksum).toBe(
      '809520f1327bd7c8e17e0e7c2c979323af7c7dbe19c23b8d9172e9594406cbf4'
    );
  });

  it('scopes the checksum to the selected account (POPS-2773)', () => {
    const amex = validateAllRows([baseRow], columnMap, 'Amex').parsedTransactions[0];
    const anz = validateAllRows([baseRow], columnMap, 'ANZ Credit Card').parsedTransactions[0];
    expect(amex?.checksum).not.toBe(anz?.checksum);
  });

  it('dedupes even when the CSV carries no reference column', () => {
    const noRefMap: ColumnMap = { date: 'Date', description: 'Description', amount: 'Amount' };
    const rowA = {
      Date: '15/01/2026',
      Description: 'STARBUCKS STORE 1234',
      Amount: '42.50',
      Notes: 'x',
    };
    const rowB = {
      Date: '15/01/2026',
      Description: 'STARBUCKS STORE 1234',
      Amount: '42.50',
      Notes: 'y',
    };
    const result = validateAllRows([rowA, rowB], noRefMap, 'Amex');
    expect(result.parsedTransactions[0]?.checksum).toBe(result.parsedTransactions[1]?.checksum);
  });
});
