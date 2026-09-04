import { describe, expect, it } from 'vitest';

import {
  computeLoanInterestCents,
  deriveLoanInterestChecksum,
  splitLoanRepaymentAmounts,
} from '../loan-repayment-split.js';

describe('computeLoanInterestCents', () => {
  it('computes |balance| × rate / 12, rounded to the nearest cent', () => {
    // $650,000 owed at 8.71% p.a.: 65_000_000 * 8.71 / 100 / 12 = 471_791.67, rounds up.
    expect(computeLoanInterestCents(-65_000_000, 8.71)).toBe(471_792);
  });

  it('uses the magnitude of a negative (liability) balance', () => {
    expect(computeLoanInterestCents(-65_000_000, 8.71)).toBe(
      computeLoanInterestCents(65_000_000, 8.71)
    );
  });

  it('is zero on a zero balance', () => {
    expect(computeLoanInterestCents(0, 8.71)).toBe(0);
  });
});

describe('splitLoanRepaymentAmounts', () => {
  it('produces a correctly-summing split when interest is comfortably below the repayment', () => {
    const result = splitLoanRepaymentAmounts({
      repaymentAmountCents: 500_000,
      balanceCents: -65_000_000,
      annualRatePct: 8.71,
    });

    expect(result.interestCents).toBe(471_792);
    expect(result.principalCents).toBe(28_208);
    expect(result.interestCents + result.principalCents).toBe(500_000);
  });

  it('clamps interest to the repayment amount rather than letting principal go negative', () => {
    const result = splitLoanRepaymentAmounts({
      repaymentAmountCents: 100_000,
      balanceCents: -65_000_000,
      annualRatePct: 8.71,
    });

    expect(result.interestCents).toBe(100_000);
    expect(result.principalCents).toBe(0);
  });

  it('is all-principal when there is no balance to accrue interest on', () => {
    const result = splitLoanRepaymentAmounts({
      repaymentAmountCents: 50_000,
      balanceCents: 0,
      annualRatePct: 8.71,
    });

    expect(result.interestCents).toBe(0);
    expect(result.principalCents).toBe(50_000);
  });
});

describe('deriveLoanInterestChecksum', () => {
  it('appends a stable, non-hex suffix that can never collide with a real SHA-256 checksum', () => {
    const original = 'a'.repeat(64);
    expect(deriveLoanInterestChecksum(original)).toBe(`${original}:loan-interest-split`);
  });

  it('is a pure function of the original checksum, so re-deriving it is idempotent', () => {
    const original = 'b'.repeat(64);
    expect(deriveLoanInterestChecksum(original)).toBe(deriveLoanInterestChecksum(original));
  });

  it('produces distinct checksums for distinct originals', () => {
    expect(deriveLoanInterestChecksum('a'.repeat(64))).not.toBe(
      deriveLoanInterestChecksum('b'.repeat(64))
    );
  });
});
