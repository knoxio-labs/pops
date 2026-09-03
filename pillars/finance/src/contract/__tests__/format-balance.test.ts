/**
 * Unit tests for `formatBalance` — the single place a balance becomes a
 * string (POPS-2802). Covers the fiat/points branch, negative amounts, and
 * a non-default decimals count, so the implementation can't get away with
 * hardcoding 0 or 2.
 */
import { describe, expect, it } from 'vitest';

import { formatBalance } from '../format-balance.js';

describe('formatBalance', () => {
  it('renders a fiat balance with its symbol and two decimal places', () => {
    expect(formatBalance(1234.5, { symbol: '$', decimals: 2, kind: 'fiat' })).toBe('$1,234.50');
  });

  it('renders a points balance with no symbol and no decimal places', () => {
    expect(formatBalance(184320, { symbol: null, decimals: 0, kind: 'points' })).toBe(
      '184,320 pts'
    );
  });

  it('keeps the sign in front of the symbol for a negative fiat amount', () => {
    expect(formatBalance(-12, { symbol: '$', decimals: 2, kind: 'fiat' })).toBe('-$12.00');
  });

  it('keeps the sign in front of a negative points amount', () => {
    expect(formatBalance(-500, { symbol: null, decimals: 0, kind: 'points' })).toBe('-500 pts');
  });

  it('renders more than two decimals when the currency says so', () => {
    expect(formatBalance(1.2, { symbol: '₿', decimals: 8, kind: 'fiat' })).toBe('₿1.20000000');
  });

  it('does not round a fiat amount away when it has fewer than `decimals` digits', () => {
    expect(formatBalance(0, { symbol: '$', decimals: 2, kind: 'fiat' })).toBe('$0.00');
  });
});
