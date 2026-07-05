/**
 * Unit tests for the transfer/income pre-AI classifier (CF068/#3649):
 * pins the amount-sign gate against a real `parseAmount`-shaped negative
 * value, and exercises every transfer keyword against the case-insensitive
 * word-boundary regex.
 */
import { describe, expect, it } from 'vitest';

import { isTransferOrIncomeRow } from '../transfer-classifier.js';

import type { ParsedTransaction } from '../types.js';

function transaction(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    date: '2026-02-13',
    description: 'TRANSFER TO SAVINGS',
    amount: -100,
    account: 'Amex',
    rawRow: '{}',
    checksum: 'chk-1',
    ...overrides,
  };
}

describe('isTransferOrIncomeRow', () => {
  it('classifies a negative amount with a transfer keyword as a transfer', () => {
    expect(isTransferOrIncomeRow(transaction({ description: 'TRANSFER TO SAVINGS' }))).toBe(true);
  });

  it.each(['payment', 'transfer', 'refund', 'payid', 'salary', 'reimbursement'])(
    'matches the %s keyword case-insensitively',
    (keyword) => {
      expect(
        isTransferOrIncomeRow(
          transaction({ description: `SOME ${keyword.toUpperCase()} DESCRIPTION` })
        )
      ).toBe(true);
      expect(
        isTransferOrIncomeRow(transaction({ description: `some ${keyword} description` }))
      ).toBe(true);
    }
  );

  it('rejects a positive amount even with a transfer keyword (income deposits go through the matcher)', () => {
    expect(isTransferOrIncomeRow(transaction({ amount: 100, description: 'SALARY PAYMENT' }))).toBe(
      false
    );
  });

  it('rejects a zero amount', () => {
    expect(isTransferOrIncomeRow(transaction({ amount: 0, description: 'REFUND' }))).toBe(false);
  });

  it('rejects a negative amount with no transfer keyword (an ordinary purchase)', () => {
    expect(isTransferOrIncomeRow(transaction({ description: 'WOOLWORTHS 1234' }))).toBe(false);
  });

  it('does not match a keyword embedded inside a longer word (word-boundary guard)', () => {
    // "repayment" contains "payment" as a substring but is not the word "payment".
    expect(isTransferOrIncomeRow(transaction({ description: 'PREPAYMENT PENALTY FEE' }))).toBe(
      false
    );
  });
});
