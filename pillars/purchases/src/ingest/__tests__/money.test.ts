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
    // A grouped thousand cannot lead with zero, so these are fractions —
    // reading them as grouping turned 58 cents of oranges into $585.
    expect(parseAmountCents('0.585')).toBe(59);
    expect(parseAmountCents('0.584')).toBe(58);
    expect(parseAmountCents('0,585', { currency: 'EUR' })).toBe(59);
  });

  it('reads a thousands separator', () => {
    expect(parseAmountCents('1,495.00')).toBe(149500);
    expect(parseAmountCents('$1,495.00')).toBe(149500);
  });

  it('reads a decimal comma, because grouping never takes two digits', () => {
    // `1,49` cannot be a grouped thousand in any locale — grouping is always
    // exactly three digits. That settles what looked like it needed to know
    // where the receipt was from, which matters because the currency is the
    // field most often missing.
    expect(parseAmountCents('1,49')).toBe(149);
    expect(parseAmountCents('12,49')).toBe(1249);
    expect(parseAmountCents('-12,49')).toBe(-1249);
  });

  it('reads a number that states its own convention', () => {
    // Both separators present: the later one is the decimal point, because
    // nothing groups digits after a decimal separator. No locale needed.
    expect(parseAmountCents('1.234,56')).toBe(123456);
    expect(parseAmountCents('1,234.56')).toBe(123456);
    expect(parseAmountCents('1.234.567,89')).toBe(123456789);
  });

  it('treats three trailing digits as grouping unless the currency says otherwise', () => {
    // `1,495` is fifteen hundred on an Australian receipt. It is the one
    // genuinely ambiguous shape, and grouping is overwhelmingly the common
    // reading on a till slip.
    expect(parseAmountCents('1,495')).toBe(149500);
    expect(parseAmountCents('1.495')).toBe(149500);
  });

  it('reads a whole European receipt correctly', () => {
    // The case that produced four unreadable lines and a zero total before.
    const lines = ['1,20', '3,49', '7,80'].map((a) => parseAmountCents(a, { currency: 'EUR' }));
    expect(lines).toEqual([120, 349, 780]);
    expect(parseAmountCents('12,49', { currency: 'EUR' })).toBe(1249);
    expect(lines.reduce((t, c) => (t ?? 0) + (c ?? 0), 0)).toBe(1249);
  });

  it('returns null for blanks and prose rather than guessing', () => {
    for (const raw of ['', ' ', null, undefined, 'FREE', 'TOTAL', '$', '-', 'SMUDGED']) {
      expect(parseAmountCents(raw)).toBeNull();
    }
  });

  it('requires the whole string to be an amount, not merely to contain one', () => {
    // An earlier version deleted every non-numeric character and read what
    // survived, so `TOTAL $27.50` became $27.50 and `1-2` became −12. That
    // let malformed model output through the gate as fact.
    expect(parseAmountCents('TOTAL $27.50')).toBeNull();
    expect(parseAmountCents('1-2')).toBeNull();
    expect(parseAmountCents('12 items')).toBeNull();
    expect(parseAmountCents('approx 5.00')).toBeNull();
    expect(parseAmountCents('5.00 each')).toBeNull();
  });

  it('still accepts a currency marker at either end', () => {
    // What the exclusion must not break: symbols and ISO codes sit beside
    // amounts on real receipts, on either side.
    expect(parseAmountCents('$27.50')).toBe(2750);
    expect(parseAmountCents('27,50 EUR', { currency: 'EUR' })).toBe(2750);
    expect(parseAmountCents('€27,50', { currency: 'EUR' })).toBe(2750);
    expect(parseAmountCents('kr 27,50', { currency: 'SEK' })).toBe(2750);
    expect(parseAmountCents('-$4.95')).toBe(-495);
    expect(parseAmountCents('$-4.95')).toBe(-495);
  });

  it('refuses a three-letter label wearing a currency code’s clothes', () => {
    // These are what a receipt prints beside an amount accounted for
    // elsewhere. Read as a line total, each one describes a shop the paper
    // does not — and the sum still reconciles, so the gate cannot object.
    for (const labelled of ['TAX 2.75', 'GST 1.50', 'SUB 10.00', 'NET 5.00', 'VAT 1.20']) {
      expect(parseAmountCents(labelled)).toBeNull();
    }
  });

  it('reads an ISO code only when the receipt stated that currency', () => {
    // Nothing about the characters distinguishes AUD from TAX, so the
    // stated currency is what makes the difference — and absent one,
    // refusing is the cheap direction to be wrong in.
    expect(parseAmountCents('AUD 12.50')).toBeNull();
    expect(parseAmountCents('AUD 12.50', { currency: 'AUD' })).toBe(1250);
    expect(parseAmountCents('AUD 12.50', { currency: 'EUR' })).toBeNull();
  });

  it('reads a country-prefixed currency sign', () => {
    // The first real Australian receipt sent through the drop-zone was
    // refused for exactly this: an enumerated list of letter-bearing
    // symbols cannot contain the ones nobody thought of. What makes these
    // money is the shape — letters against an actual currency sign.
    expect(parseAmountCents('AU$66.00', { currency: 'AUD' })).toBe(6600);
    expect(parseAmountCents('US$5.00', { currency: 'USD' })).toBe(500);
    expect(parseAmountCents('NZ$4.50', { currency: 'NZD' })).toBe(450);
    expect(parseAmountCents('66.00 AU$', { currency: 'AUD' })).toBe(6600);
    expect(parseAmountCents('-AU$4.95', { currency: 'AUD' })).toBe(-495);
  });

  it('does not mistake a label for a prefixed currency sign', () => {
    // The shape rule must not readmit what excluding letters was for: a
    // colon is not a currency sign, so this stays refused.
    expect(parseAmountCents('TAX: 2.75')).toBeNull();
    expect(parseAmountCents('GST: 1.50')).toBeNull();
  });

  it('reads currency symbols that are spelled with letters', () => {
    // The exclusion of letters must not cost the currencies whose symbol
    // is one, which no stated ISO code would rescue.
    expect(parseAmountCents('12.50 kr', { currency: 'SEK' })).toBe(1250);
    expect(parseAmountCents('R$ 12,50', { currency: 'BRL' })).toBe(1250);
    expect(parseAmountCents('RM 12.50', { currency: 'MYR' })).toBe(1250);
  });
});
