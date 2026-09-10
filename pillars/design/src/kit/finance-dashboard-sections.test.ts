import { type Transaction, transactions } from '@/fixtures/transactions';
import { monthTotals, signedColor } from '@/kit/finance-dashboard-sections';
import { describe, expect, it } from 'vitest';

const txn = (amountMinorUnits: number): Transaction => ({
  id: `t${amountMinorUnits}`,
  description: 'x',
  amountMinorUnits,
  currency: 'AUD',
  date: '2026-09-01',
  type: 'purchase',
  tags: [],
});

describe('signedColor', () => {
  it('is green above zero, red below, and neutral at zero', () => {
    expect(signedColor(1)).toBe('emerald');
    expect(signedColor(-1)).toBe('rose');
    expect(signedColor(0)).toBe('slate');
  });
});

describe('monthTotals', () => {
  it('splits income from expenses and keeps both non-negative', () => {
    expect(monthTotals([txn(5_000), txn(-1_250), txn(-750), txn(100)])).toEqual({
      income: 5_100,
      expenses: 2_000,
    });
  });

  it('is zero on nothing', () => {
    expect(monthTotals([])).toEqual({ income: 0, expenses: 0 });
  });

  it('agrees with the fixture the dashboard renders', () => {
    const { income, expenses } = monthTotals(transactions);
    expect(income).toBeGreaterThan(0);
    expect(expenses).toBeGreaterThan(0);
  });
});
