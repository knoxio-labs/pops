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
    accountId: 'everyday',
    foreignAmountMinor: null,
    foreignCurrency: null,
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

  it('rejects a date that drifted into a full timestamp', () => {
    // The window is expressed as YYYY-MM-DD and compared against it. A
    // producer emitting a timestamp would sort and compare differently
    // without ever failing, silently changing which transactions fall
    // inside a 14-21 day window.
    const parsed = FinanceListResponseSchema.safeParse({
      data: [{ ...validRow, date: '2026-03-04T00:00:00Z' }],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts an unfamiliar transaction type rather than rejecting the window', () => {
    // Deliberately NOT a closed enum. Pinning it would mean finance could
    // not add a type without this leg rejecting every transaction — a
    // routine producer change becoming a fleet-wide reconciliation outage.
    const parsed = FinanceListResponseSchema.safeParse({
      data: [{ ...validRow, type: 'chargeback' }],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('toCandidateTransaction', () => {
  const wire = {
    id: 'txn-9',
    description: 'AMAZON MKTPLACE AU',
    accountId: 'everyday',
    foreignAmountMinor: null,
    foreignCurrency: null,
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

  it('carries the foreign charge through in the issuer own minor units', () => {
    // NOT converted. `amount` is decimal dollars and becomes cents here;
    // `foreignAmountMinor` is already an integer in its own currency's
    // minor units, and scaling it again would be a hundredfold error.
    const foreign = toCandidateTransaction({
      ...wire,
      amount: 34.71,
      foreignAmountMinor: 12_890,
      foreignCurrency: 'BRL',
    });

    expect(foreign.foreignAmountMinor).toBe(12_890);
    expect(foreign.foreignCurrency).toBe('BRL');
    expect(foreign.settlementCurrency).toBe('AUD');
  });
});

/**
 * The field names in `pillars/finance/openapi/finance.openapi.json`, which
 * is the document this pillar's reader has to agree with.
 *
 * Worth its own suite because the disagreement is silent and total: this
 * schema asked for `account` where finance has always published
 * `accountId`, so every page failed to parse, every window read as
 * unreadable, and every sweep skipped — for as long as the mismatch stood.
 * Nothing failed loudly, because the fixtures were written from the same
 * misreading as the schema.
 */
describe('the shape finance actually publishes', () => {
  /** Copied field for field from `GET /transactions` in finance's spec. */
  const publishedRow = {
    id: 'txn-1',
    description: 'PADARIA SAO JOAO SAO PAULO BR',
    accountId: 'acc-anz-plat',
    amount: 34.71,
    date: '2026-11-14',
    type: 'expense',
    tags: ['food'],
    entityId: null,
    entityName: null,
    location: 'Sao Paulo',
    country: 'BR',
    relatedTransactionId: null,
    notes: null,
    foreignAmountMinor: 12_890,
    foreignCurrency: 'BRL',
    fxFeeCents: 101,
    fxCaptureSource: 'anz-descriptor',
    lastEditedTime: '2026-11-15T02:00:00Z',
  };

  it('parses a row exactly as finance serves it', () => {
    const parsed = FinanceListResponseSchema.safeParse({
      data: [publishedRow],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects a row that renamed the account identifier', () => {
    const { accountId: _dropped, ...withoutAccountId } = publishedRow;
    const parsed = FinanceListResponseSchema.safeParse({
      data: [{ ...withoutAccountId, account: 'acc-anz-plat' }],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    });

    expect(parsed.success).toBe(false);
  });

  it('tolerates a producer that states no foreign charge at all', () => {
    // Absent and null mean the same thing here — nobody captured one — and
    // both refuse a cross-currency match rather than inventing a rate. An
    // absent `amount` is a different matter and stays rejected.
    const { foreignAmountMinor: _a, foreignCurrency: _c, ...withoutForeign } = publishedRow;
    const parsed = FinanceListResponseSchema.safeParse({
      data: [withoutForeign],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    });

    expect(parsed.success).toBe(true);
  });
});
