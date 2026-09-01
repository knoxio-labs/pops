/**
 * The commit-time `type` decision (POPS-2754).
 *
 * `buildFromEntityMatch` leaves a positive-amount entity match untyped on
 * purpose — a credit from a matched merchant is ambiguous and must reach review
 * rather than commit as spend. `transactionColumns` then defaulted a missing
 * type to `purchase` and undid exactly that: a `+$139.72 APPLE.COM/BILL` refund
 * was stored as a `purchase`, and the expense tile negates a purchase, so the
 * refund subtracted $139.72 from the month it belonged to.
 *
 * Pinned here: the debit default stays (the column is `NOT NULL` and a debit
 * with a merchant genuinely is a purchase), a credit that names its type is
 * stored with it, and a credit that names none is refused rather than guessed.
 */
import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../shared/errors.js';
import { transactionColumns } from '../commit-columns.js';

import type { CommitPayload } from '../types.js';

type ConfirmedRow = CommitPayload['transactions'][number];

function row(overrides: Partial<ConfirmedRow> = {}): ConfirmedRow {
  return {
    date: '2026-06-12',
    description: 'APPLE.COM/BILL',
    amount: -19.99,
    account: 'ANZ Credit Card',
    rawRow: '{}',
    checksum: 'checksum-1',
    ...overrides,
  };
}

describe('transactionColumns — the type a confirmed row is stored with', () => {
  it('defaults an untyped debit to purchase', () => {
    expect(transactionColumns(row(), undefined).type).toBe('purchase');
  });

  it('refuses an untyped credit instead of storing it as a purchase', () => {
    expect(() => transactionColumns(row({ amount: 139.72 }), undefined)).toThrow(ValidationError);
  });

  it('refuses an untyped $0 row, which is not a debit either', () => {
    expect(() => transactionColumns(row({ amount: 0 }), undefined)).toThrow(ValidationError);
  });

  it('names the row in the refusal, so the offending line is identifiable', () => {
    expect(() => transactionColumns(row({ amount: 139.72 }), undefined)).toThrow(
      /APPLE\.COM\/BILL/
    );
  });

  it('stores a credit that names its type', () => {
    expect(
      transactionColumns(row({ amount: 139.72, transactionType: 'refund' }), undefined).type
    ).toBe('refund');
    expect(
      transactionColumns(row({ amount: 4545.37, transactionType: 'transfer' }), undefined).type
    ).toBe('transfer');
  });

  it('still rewrites a gift-card purchase to the transfer it is', () => {
    expect(
      transactionColumns(
        row({ transactionType: 'purchase', tags: ['contains:gift-card'] }),
        undefined
      ).type
    ).toBe('transfer');
  });
});
