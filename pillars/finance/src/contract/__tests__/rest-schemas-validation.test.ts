import { describe, expect, it } from 'vitest';

import { financeBudgetsContract } from '../rest-budgets.js';
import { LimitQuery } from '../rest-schemas.js';
import { financeWishlistContract } from '../rest-wishlist.js';

describe('LimitQuery', () => {
  it('accepts a limit at the 500 cap', () => {
    expect(LimitQuery.safeParse('500').success).toBe(true);
  });

  it('rejects a limit above the 500 cap', () => {
    expect(LimitQuery.safeParse('501').success).toBe(false);
  });

  it('rejects a very large limit (e.g. an unbounded MCP request)', () => {
    expect(LimitQuery.safeParse('50000').success).toBe(false);
  });

  it('still rejects non-positive and non-integer limits', () => {
    expect(LimitQuery.safeParse('0').success).toBe(false);
    expect(LimitQuery.safeParse('-10').success).toBe(false);
    expect(LimitQuery.safeParse('12.5').success).toBe(false);
  });

  it('remains optional', () => {
    expect(LimitQuery.safeParse(undefined).success).toBe(true);
  });
});

describe('CreateBudgetBody (amount)', () => {
  const body = financeBudgetsContract.create.body;

  it('rejects a negative amount', () => {
    const result = body.safeParse({ category: 'Groceries', amount: -500 });
    expect(result.success).toBe(false);
  });

  it('accepts a zero amount', () => {
    expect(body.safeParse({ category: 'Groceries', amount: 0 }).success).toBe(true);
  });

  it('accepts a positive amount', () => {
    expect(body.safeParse({ category: 'Groceries', amount: 500 }).success).toBe(true);
  });

  it('accepts a null amount (no target set)', () => {
    expect(body.safeParse({ category: 'Groceries', amount: null }).success).toBe(true);
  });
});

describe('UpdateBudgetBody (amount)', () => {
  const body = financeBudgetsContract.update.body;

  it('rejects a negative amount', () => {
    expect(body.safeParse({ amount: -1 }).success).toBe(false);
  });
});

describe('CreateWishListItemBody (targetAmount / saved)', () => {
  const body = financeWishlistContract.create.body;

  it('rejects a negative targetAmount', () => {
    expect(body.safeParse({ item: 'Camera', targetAmount: -100 }).success).toBe(false);
  });

  it('rejects a negative saved', () => {
    expect(body.safeParse({ item: 'Camera', saved: -100 }).success).toBe(false);
  });

  it('accepts non-negative targetAmount and saved', () => {
    expect(body.safeParse({ item: 'Camera', targetAmount: 1500, saved: 300 }).success).toBe(true);
  });
});

describe('UpdateWishListItemBody (targetAmount / saved)', () => {
  const body = financeWishlistContract.update.body;

  it('rejects a negative targetAmount', () => {
    expect(body.safeParse({ targetAmount: -1 }).success).toBe(false);
  });

  it('rejects a negative saved', () => {
    expect(body.safeParse({ saved: -1 }).success).toBe(false);
  });
});
