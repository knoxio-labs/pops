import { describe, expect, it } from 'vitest';

import { parseAmountCents } from '../money.js';

describe('parseAmountCents', () => {
  it('reads money with and without a currency symbol', () => {
    expect(parseAmountCents('8.00')).toBe(800);
    expect(parseAmountCents('$8.00')).toBe(800);
    expect(parseAmountCents('18.48')).toBe(1848);
  });

  it('reads a sign on either side of the symbol', () => {
    // Everyday Rewards prints `-4.95`; a photographed till slip prints
    // `-$4.95`. Stripping the symbol by position handled one and silently
    // refused the other, which read as an unreadable discount.
    expect(parseAmountCents('-4.95')).toBe(-495);
    expect(parseAmountCents('-$4.95')).toBe(-495);
    expect(parseAmountCents('$-4.95')).toBe(-495);
  });

  it('does not lose cents to binary floating point', () => {
    expect(parseAmountCents('9.24')).toBe(924);
    expect(parseAmountCents('19.99')).toBe(1999);
    expect(parseAmountCents('0.07')).toBe(7);
  });

  it('rounds a third decimal rather than truncating it', () => {
    // Per-kilo pricing produces them: 0.202 kg at $2.90/kg is 0.5858.
    expect(parseAmountCents('0.585')).toBe(59);
    expect(parseAmountCents('0.584')).toBe(58);
  });

  it('reads a thousands separator', () => {
    expect(parseAmountCents('1,495.00')).toBe(149500);
    expect(parseAmountCents('$1,495.00')).toBe(149500);
  });

  it('refuses a decimal comma rather than guessing which convention it is', () => {
    // `1,49` is one-forty-nine in most of Europe and unreadable here. A
    // parser that guesses turns €1.49 into €149.
    expect(parseAmountCents('1,49')).toBeNull();
  });

  it('returns null for blanks and prose rather than guessing', () => {
    for (const raw of ['', ' ', null, undefined, 'FREE', 'TOTAL', '$', '-', 'SMUDGED']) {
      expect(parseAmountCents(raw)).toBeNull();
    }
  });
});
