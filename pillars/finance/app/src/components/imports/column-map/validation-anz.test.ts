/**
 * Tests for the ANZ credit-card import path: the sign convention, the derived
 * description fields, and the dedup identity those fields are deliberately NOT
 * built from.
 *
 * Rows here are shaped like the real export — headerless, so the wizard keys
 * them by the dialect's synthetic column names.
 */
import { describe, expect, it } from 'vitest';

import { validateAllRows } from './validation';

import type { ColumnMap } from './parsers';

const columnMap: ColumnMap = { date: 'Date', description: 'Description', amount: 'Amount' };

function anzRow(date: string, amount: string, description: string): Record<string, string> {
  return { Date: date, Amount: amount, Description: description };
}

const PURCHASE = anzRow('31/07/2026', '-23.22', 'ALDI STORES - MARRICKV    MARRICKVILLE');
const REPAYMENT = anzRow('23/07/2026', '500.00', 'PAYMENT THANKYOU 754244');

describe('ANZ credit card — amount sign', () => {
  it('keeps a purchase negative rather than flipping it to income', () => {
    const { parsedTransactions } = validateAllRows(
      [PURCHASE],
      columnMap,
      'ANZ Credit Card',
      'acc-test'
    );
    expect(parsedTransactions[0]?.amount).toBe(-23.22);
  });

  it('keeps a card repayment positive', () => {
    const { parsedTransactions } = validateAllRows(
      [REPAYMENT],
      columnMap,
      'ANZ Credit Card',
      'acc-test'
    );
    expect(parsedTransactions[0]?.amount).toBe(500);
  });

  it('flips the sign for a debit-positive bank on the same input', () => {
    // Guards the convention itself: were the dialect ignored, both banks would
    // agree here and the ANZ assertions above would pass for the wrong reason.
    const { parsedTransactions } = validateAllRows([PURCHASE], columnMap, 'Amex', 'acc-test');
    expect(parsedTransactions[0]?.amount).toBe(23.22);
  });
});

describe('ANZ credit card — derived fields', () => {
  it('stores the merchant and suburb separately', () => {
    const { parsedTransactions } = validateAllRows(
      [PURCHASE],
      columnMap,
      'ANZ Credit Card',
      'acc-test'
    );
    expect(parsedTransactions[0]).toMatchObject({
      description: 'ALDI STORES - MARRICKV',
      location: 'Marrickville',
    });
  });

  it('carries country and fx detail for a foreign charge', () => {
    const row = anzRow(
      '12/06/2026',
      '-148.63',
      'GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD'
    );
    const { parsedTransactions } = validateAllRows([row], columnMap, 'ANZ Credit Card', 'acc-test');
    expect(parsedTransactions[0]).toMatchObject({
      description: 'GITHUB INC.',
      location: 'Github.com',
      country: 'US',
      foreignAmountMinor: 10_000,
      foreignCurrency: 'USD',
      fxFeeCents: 503,
    });
  });

  it('leaves location unset when the detail field is a merchant phone number', () => {
    const row = anzRow('31/07/2026', '-23.22', 'PP*HUMBLEBUNDL HUMBLEBUND 4029357733');
    const { parsedTransactions } = validateAllRows([row], columnMap, 'ANZ Credit Card', 'acc-test');
    expect(parsedTransactions[0]?.description).toBe('PP*HUMBLEBUNDL HUMBLEBUND');
    expect(parsedTransactions[0]?.location).toBeUndefined();
  });

  it('leaves a headed bank alone — its description is stored as exported', () => {
    const { parsedTransactions } = validateAllRows([PURCHASE], columnMap, 'Amex', 'acc-test');
    expect(parsedTransactions[0]?.description).toBe('ALDI STORES - MARRICKV    MARRICKVILLE');
    expect(parsedTransactions[0]?.location).toBeUndefined();
  });
});

describe('ANZ credit card — dedup identity', () => {
  it('keeps two same-day, same-amount charges of one merchant distinct by suburb', () => {
    // Both rows parse to the description "SQ *FESTIVAL CURRENCY"; the suburb is
    // the only thing separating them, and ANZ ships no reference column. Were
    // the key built from the parsed description, one of these real charges
    // would be dropped as a duplicate. This pair is from the real export.
    const kensington = anzRow('22/04/2025', '-20.40', 'SQ *FESTIVAL CURRENCY     Kensington');
    const springfield = anzRow('22/04/2025', '-20.40', 'SQ *FESTIVAL CURRENCY     Springfield');
    const { parsedTransactions } = validateAllRows(
      [kensington, springfield],
      columnMap,
      'ANZ Credit Card',
      'acc-test'
    );
    expect(parsedTransactions[0]?.description).toBe(parsedTransactions[1]?.description);
    expect(parsedTransactions[0]?.checksum).not.toBe(parsedTransactions[1]?.checksum);
  });

  it('gives the same charge the same checksum across re-exports', () => {
    const first = validateAllRows([PURCHASE], columnMap, 'ANZ Credit Card', 'acc-test');
    const second = validateAllRows([PURCHASE], columnMap, 'ANZ Credit Card', 'acc-test');
    expect(first.parsedTransactions[0]?.checksum).toBe(second.parsedTransactions[0]?.checksum);
  });

  it('distinguishes two genuinely different charges on the same day', () => {
    const toll = anzRow('10/12/2025', '-40.20', 'TRANSPORT NSW ETOLL       PARRAMATTA');
    const coffee = anzRow('10/12/2025', '-40.20', 'SQ *THE WOOD ROASTER ESPR Marrickville');
    const { parsedTransactions } = validateAllRows(
      [toll, coffee],
      columnMap,
      'ANZ Credit Card',
      'acc-test'
    );
    expect(parsedTransactions[0]?.checksum).not.toBe(parsedTransactions[1]?.checksum);
  });
});

/**
 * The marker that lets a stored ANZ row say "capture ran and there was nothing
 * to find" (POPS-2647). Without it a domestic ANZ row is byte-identical to one
 * imported before the descriptor was ever parsed.
 */
describe('ANZ credit card — foreign-charge capture provenance', () => {
  it('declares the descriptor as the capture source on a domestic row', () => {
    const { parsedTransactions } = validateAllRows(
      [PURCHASE],
      columnMap,
      'ANZ Credit Card',
      'acc-test'
    );

    expect(parsedTransactions[0]?.foreignCurrency).toBeUndefined();
    expect(parsedTransactions[0]?.country).toBeUndefined();
    expect(parsedTransactions[0]?.fxCaptureSource).toBe('anz-descriptor');
  });

  it('declares the same source on a foreign row, which found something', () => {
    const foreign = anzRow(
      '31/07/2026',
      '-105.03',
      'GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD'
    );

    const { parsedTransactions } = validateAllRows(
      [foreign],
      columnMap,
      'ANZ Credit Card',
      'acc-test'
    );

    expect(parsedTransactions[0]?.foreignCurrency).toBe('USD');
    expect(parsedTransactions[0]?.fxCaptureSource).toBe('anz-descriptor');
  });

  it('declares a bank whose export carries no foreign detail as unavailable', () => {
    const { parsedTransactions } = validateAllRows([PURCHASE], columnMap, 'ING', 'acc-test');

    expect(parsedTransactions[0]?.fxCaptureSource).toBe('unavailable');
  });
});
