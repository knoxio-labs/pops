import { describe, expect, it } from 'vitest';

import {
  dollarsToCents,
  financeTransactionUri,
  FinanceListResponseSchema,
  toCandidateTransaction,
} from '../wire.js';

describe('dollarsToCents', () => {
  it('rounds rather than truncating the values IEEE-754 cannot hold', () => {
    // 19.99 * 100 is 1998.9999999999998. Truncating lands a cent short and
    // turns a correct match into a one-cent mismatch.
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(0.29)).toBe(29);
    expect(dollarsToCents(1146.55)).toBe(114655);
  });

  it('survives the classic float-addition case', () => {
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
  });

  it('handles negative amounts, which refunds arrive as', () => {
    expect(dollarsToCents(-11.79)).toBe(-1179);
    expect(dollarsToCents(-0.01)).toBe(-1);
  });

  it('round-trips every cent value finance could have divided by 100', () => {
    // Finance stores integer cents and publishes cents/100. This asserts the
    // inverse is exact across the range, which is the property subset-sum
    // depends on — a single lost cent makes an exact match unfindable.
    for (let cents = -5000; cents <= 5000; cents++) {
      expect(dollarsToCents(cents / 100)).toBe(cents);
    }
  });

  it('round-trips large amounts too', () => {
    for (const cents of [999_999, 1_000_001, 12_345_678, 99_999_999]) {
      expect(dollarsToCents(cents / 100)).toBe(cents);
      expect(dollarsToCents(-cents / 100)).toBe(-cents);
    }
  });
});

describe('FinanceListResponseSchema', () => {
  const validRow = {
    id: 'txn-1',
    description: 'AMAZON MKTPLACE AU',
    account: 'everyday',
    amount: 41.28,
    date: '2026-03-04',
    type: 'purchase',
    entityId: null,
    entityName: null,
  };

  it('accepts the shape finance publishes', () => {
    const parsed = FinanceListResponseSchema.safeParse({
      data: [validRow],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a row whose amount became a string', () => {
    // The realistic producer-side drift: a serializer change emitting
    // "41.28". Without validation that becomes NaN cents and every match
    // in the window silently fails.
    const parsed = FinanceListResponseSchema.safeParse({
      data: [{ ...validRow, amount: '41.28' }],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a response missing its pagination envelope', () => {
    expect(FinanceListResponseSchema.safeParse({ data: [validRow] }).success).toBe(false);
  });
});

describe('toCandidateTransaction', () => {
  const wire = {
    id: 'txn-9',
    description: 'AMAZON MKTPLACE AU',
    account: 'everyday',
    amount: 19.99,
    date: '2026-03-04',
    type: 'purchase',
    entityId: 'ent-1',
    entityName: 'Amazon',
  };

  it('converts to integer cents at the boundary', () => {
    expect(toCandidateTransaction(wire).amountCents).toBe(1999);
  });

  it('exposes no dollar amount at all, so one cannot reach the solver', () => {
    // Not a style preference: the candidate type deliberately has no
    // `amount`, so a float cannot be passed through by accident.
    expect(Object.keys(toCandidateTransaction(wire))).not.toContain('amount');
  });

  it('carries the pops:// URI a charge link stores', () => {
    expect(toCandidateTransaction(wire).uri).toBe('pops://finance/transaction/txn-9');
    expect(financeTransactionUri('abc')).toBe('pops://finance/transaction/abc');
  });
});
