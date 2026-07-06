/**
 * Tests for the money boundary (#3665, CF041): dollars <-> cents conversion,
 * round-tripping, and the precision guarantee integer-cents arithmetic buys
 * over the float-dollar arithmetic this pillar used to do.
 */
import { describe, expect, it } from 'vitest';

import {
  centsToDollars,
  centsToDollarsNullable,
  dollarsToCents,
  dollarsToCentsNullable,
} from '../money.js';

describe('dollarsToCents', () => {
  it.each([
    [19.99, 1999],
    [0.1, 10],
    [0.29, 29],
    [0.07, 7],
    [-19.99, -1999],
    [-0.1, -10],
    [0, 0],
    [1234567.89, 123456789],
    [100, 10000],
  ])('converts %s dollars to %s cents', (dollars, expected) => {
    expect(dollarsToCents(dollars)).toBe(expected);
  });

  it('rounds rather than truncates a value that is not exactly representable', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE-754 — truncating would land
    // one cent short.
    expect(19.99 * 100).not.toBe(1999);
    expect(dollarsToCents(19.99)).toBe(1999);

    // 0.1 * 100 is 10.000000000000002 — truncating still happens to work
    // here, but rounding is the correct general rule.
    expect(dollarsToCents(0.1)).toBe(10);
  });
});

describe('centsToDollars', () => {
  it.each([
    [1999, 19.99],
    [10, 0.1],
    [29, 0.29],
    [7, 0.07],
    [-1999, -19.99],
    [0, 0],
    [123456789, 1234567.89],
  ])('converts %s cents to %s dollars', (cents, expected) => {
    expect(centsToDollars(cents)).toBe(expected);
  });
});

describe('round-tripping', () => {
  it.each([19.99, 0.1, 0.29, 0.07, -19.99, 0, 1234567.89, 100, -0.01, 0.01])(
    'centsToDollars(dollarsToCents(%s)) recovers the original dollar value exactly',
    (dollars) => {
      expect(centsToDollars(dollarsToCents(dollars))).toBe(dollars);
    }
  );
});

describe('nullable variants', () => {
  it('dollarsToCentsNullable passes null/undefined through unchanged', () => {
    expect(dollarsToCentsNullable(null)).toBeNull();
    expect(dollarsToCentsNullable(undefined)).toBeNull();
    expect(dollarsToCentsNullable(19.99)).toBe(1999);
  });

  it('centsToDollarsNullable passes null/undefined through unchanged', () => {
    expect(centsToDollarsNullable(null)).toBeNull();
    expect(centsToDollarsNullable(undefined)).toBeNull();
    expect(centsToDollarsNullable(1999)).toBe(19.99);
  });
});

describe('arithmetic precision — the bug this pillar fixed (CF041)', () => {
  it('reproduces the float-dollar subtraction bug this migration eliminates', () => {
    // The exact repro from the finance audit finding: 100.10 - 100.00 does
    // NOT equal 0.10 in IEEE-754 float arithmetic.
    expect(100.1 - 100.0).not.toBe(0.1);
    expect(100.1 - 100.0).toBeCloseTo(0.1, 10);
  });

  it('the same subtraction in integer cents is exact', () => {
    const targetCents = dollarsToCents(100.1);
    const savedCents = dollarsToCents(100.0);
    expect(targetCents - savedCents).toBe(10);
    expect(centsToDollars(targetCents - savedCents)).toBe(0.1);
  });

  it('summing many imprecise cent values loses no precision', () => {
    const lineItemsCents = [1999, 10, 29, 7, 2999, 1].map((c) => c);
    const total = lineItemsCents.reduce((sum, c) => sum + c, 0);
    expect(total).toBe(5045);
  });

  it('a long run of repeated fractional-dollar additions would drift in float, but not in cents', () => {
    let floatTotal = 0;
    for (let i = 0; i < 10; i++) floatTotal += 0.1;
    // The classic float drift: ten lots of 0.1 is not exactly 1.
    expect(floatTotal).not.toBe(1);

    let centsTotal = 0;
    for (let i = 0; i < 10; i++) centsTotal += dollarsToCents(0.1);
    expect(centsTotal).toBe(100);
    expect(centsToDollars(centsTotal)).toBe(1);
  });
});
