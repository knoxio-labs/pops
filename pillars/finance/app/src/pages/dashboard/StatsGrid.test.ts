import { describe, expect, it } from 'vitest';

import { computeStats, formatTileAmount, signedColor } from './StatsGrid';

import type { TransactionsListResponse } from '../../finance-api/types.gen.js';

type Transaction = NonNullable<TransactionsListResponse['data']>[number];

/**
 * `type` widens to `string`: the tile mapping has to survive values the REST
 * contract does not list (legacy casing, types added server-side), and those
 * cases are exactly what the suite below pins down.
 */
type TransactionOverrides = Omit<Partial<Transaction>, 'type'> & { type?: string };

function makeTx(amount: number, overrides: TransactionOverrides = {}): Transaction {
  return {
    id: `tx-${amount}`,
    date: '2026-04-29',
    description: 'Test',
    amount,
    accountId: 'acc-1',
    accountName: 'Test',
    type: amount >= 0 ? 'income' : 'purchase',
    entityId: null,
    entityName: null,
    tags: [],
    location: null,
    createdAt: '2026-04-29T00:00:00Z',
    updatedAt: '2026-04-29T00:00:00Z',
    ...overrides,
  } as Transaction;
}

describe('signedColor', () => {
  it('maps positive amounts to emerald', () => {
    expect(signedColor(0.01)).toBe('emerald');
    expect(signedColor(1234.56)).toBe('emerald');
  });

  it('maps negative amounts to rose', () => {
    expect(signedColor(-0.01)).toBe('rose');
    expect(signedColor(-1234.56)).toBe('rose');
  });

  it('maps zero to slate (neutral)', () => {
    expect(signedColor(0)).toBe('slate');
    expect(signedColor(-0)).toBe('slate');
  });
});

describe('formatTileAmount', () => {
  it('puts the sign before the currency symbol for a negative total (#3757 nit 3)', () => {
    expect(formatTileAmount(-400)).toBe('-$400.00');
  });

  it('renders a positive total with two decimals and no leading sign', () => {
    expect(formatTileAmount(400)).toBe('$400.00');
  });

  it('renders zero as $0.00', () => {
    expect(formatTileAmount(0)).toBe('$0.00');
  });

  it('groups thousands', () => {
    expect(formatTileAmount(1234.5)).toBe('$1,234.50');
  });
});

describe('computeStats', () => {
  it('returns null when transactions are undefined', () => {
    expect(computeStats(undefined, 0)).toBeNull();
  });

  it('returns zeroed stats for an empty transaction list', () => {
    expect(computeStats([], 0)).toEqual({
      totalTransactions: 0,
      totalIncome: 0,
      totalExpenses: 0,
    });
  });

  it('sums income (positive) and expenses (abs of negative) separately', () => {
    const stats = computeStats([makeTx(100), makeTx(-30), makeTx(50), makeTx(-20)], 4);
    expect(stats).toEqual({
      totalTransactions: 4,
      totalIncome: 150,
      totalExpenses: 50,
    });
  });

  it('uses the provided total count rather than the array length', () => {
    const stats = computeStats([makeTx(10)], 999);
    expect(stats?.totalTransactions).toBe(999);
  });

  it('excludes Transfer type from income and expense totals', () => {
    const stats = computeStats(
      [
        makeTx(100),
        makeTx(-30),
        makeTx(500, { type: 'Transfer' }),
        makeTx(-500, { type: 'Transfer' }),
      ],
      4
    );
    expect(stats).toEqual({
      totalTransactions: 4,
      totalIncome: 100,
      totalExpenses: 30,
    });
  });

  it('excludes lowercase transfer type too', () => {
    const stats = computeStats([makeTx(200, { type: 'transfer' }), makeTx(50)], 2);
    expect(stats).toEqual({
      totalTransactions: 2,
      totalIncome: 50,
      totalExpenses: 0,
    });
  });
});

describe('computeStats — type → tile mapping (#3607 stage 2c)', () => {
  it('routes refund + reversal to the expense tile as an offset, not income', () => {
    // purchase -100 (+100 exp), refund +30 (-30 exp), reversal -40 (+40 exp) → 110; income untouched
    const stats = computeStats(
      [
        makeTx(-100, { type: 'purchase' }),
        makeTx(30, { type: 'refund' }),
        makeTx(-40, { type: 'reversal' }),
      ],
      3
    );
    expect(stats).toEqual({ totalTransactions: 3, totalIncome: 0, totalExpenses: 110 });
  });

  it('routes loan, rebate and income to the income tile', () => {
    const stats = computeStats(
      [
        makeTx(1000, { type: 'loan' }),
        makeTx(25, { type: 'rebate' }),
        makeTx(200, { type: 'income' }),
      ],
      3
    );
    expect(stats).toEqual({ totalTransactions: 3, totalIncome: 1225, totalExpenses: 0 });
  });

  it('feeds tax to the income tile with its sign (a tax debit reduces income)', () => {
    const stats = computeStats([makeTx(500, { type: 'income' }), makeTx(-80, { type: 'tax' })], 2);
    expect(stats).toEqual({ totalTransactions: 2, totalIncome: 420, totalExpenses: 0 });
  });

  it('excludes an unrecognised type from both tiles', () => {
    const stats = computeStats(
      [makeTx(100, { type: 'mystery' }), makeTx(-50, { type: 'purchase' })],
      2
    );
    expect(stats).toEqual({ totalTransactions: 2, totalIncome: 0, totalExpenses: 50 });
  });
});
