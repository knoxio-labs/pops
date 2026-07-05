import { describe, expect, it } from 'vitest';

import { computeBudgetProgress } from './BudgetProgress';

describe('computeBudgetProgress', () => {
  it('reports no percentage when there is no target amount', () => {
    const result = computeBudgetProgress({ spent: 42, amount: null });
    expect(result).toEqual({ overBudget: false, pct: null, display: null, visual: null });
  });

  it('reports no percentage when the target amount is zero or negative', () => {
    expect(computeBudgetProgress({ spent: 10, amount: 0 }).pct).toBeNull();
    expect(computeBudgetProgress({ spent: 10, amount: -5 }).pct).toBeNull();
  });

  it('computes percentage under budget', () => {
    const result = computeBudgetProgress({ spent: 50, amount: 200 });
    expect(result.overBudget).toBe(false);
    expect(result.pct).toBe(25);
    expect(result.display).toBe(25);
    expect(result.visual).toBe(25);
  });

  it('flags over-budget and clamps the visual percentage at 100', () => {
    const result = computeBudgetProgress({ spent: 300, amount: 200 });
    expect(result.overBudget).toBe(true);
    expect(result.pct).toBe(150);
    expect(result.display).toBe(150);
    expect(result.visual).toBe(100);
  });

  it('is not over budget when spent exactly equals the target', () => {
    expect(computeBudgetProgress({ spent: 200, amount: 200 }).overBudget).toBe(false);
  });

  it('never reports over budget when there is no target amount, even with spend', () => {
    expect(computeBudgetProgress({ spent: 999, amount: null }).overBudget).toBe(false);
  });
});
