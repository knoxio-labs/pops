import { describe, expect, it } from 'vitest';

import { groupReceiptRows, parseAmountCents, type ReceiptRow } from '../rows.js';

/**
 * The rows of a real Everyday Rewards receipt, verbatim from the
 * `ReceiptDetailsItems.items[]` payload. Seven rows, five products, and a
 * stated total of "TOTAL (6 items)" — the three numbers that must not be
 * confused with each other.
 */
const REAL_RECEIPT: ReceiptRow[] = [
  { prefixChar: null, description: 'Essentials Grated Parmesan Cheese 100g', amount: '2.00' },
  { prefixChar: null, description: 'WW Cage Free Eggs XL 12pk 700g', amount: '5.70' },
  { prefixChar: null, description: 'WW Cheese Slices Smoky 250g', amount: '3.80' },
  { prefixChar: null, description: 'Woolworths Turkish Rolls 400g Pk 4', amount: '2.60' },
  { prefixChar: null, description: 'Thomas Dux Smoked Salmon Slices 300g', amount: '' },
  { prefixChar: null, description: 'Qty 2 @ $9.24 each', amount: '18.48' },
  { prefixChar: null, description: 'PRICE REDUCED BY $7.26 each', amount: '' },
];

const RECEIPT_TOTAL_CENTS = 3258;

describe('the real receipt', () => {
  it('folds seven rows into five products', () => {
    const { items } = groupReceiptRows(REAL_RECEIPT);
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.name)).toEqual([
      'Essentials Grated Parmesan Cheese 100g',
      'WW Cage Free Eggs XL 12pk 700g',
      'WW Cheese Slices Smoky 250g',
      'Woolworths Turkish Rolls 400g Pk 4',
      'Thomas Dux Smoked Salmon Slices 300g',
    ]);
  });

  it('never emits a quantity line as a product', () => {
    // THE regression. One-row-one-item produces a product called
    // "Qty 2 @ $9.24 each" costing $18.48 — and the totals still reconcile,
    // so no arithmetic check would ever notice.
    const { items } = groupReceiptRows(REAL_RECEIPT);
    expect(items.map((i) => i.name)).not.toContain('Qty 2 @ $9.24 each');
    expect(items.map((i) => i.name)).not.toContain('PRICE REDUCED BY $7.26 each');
  });

  it('attaches the money from the quantity row to the product above it', () => {
    const salmon = groupReceiptRows(REAL_RECEIPT).items.at(-1);
    expect(salmon?.quantity).toBe(2);
    expect(salmon?.unitPriceCents).toBe(924);
    expect(salmon?.lineTotalCents).toBe(1848);
  });

  it('keeps the promotion as a note on the product it modifies', () => {
    const salmon = groupReceiptRows(REAL_RECEIPT).items.at(-1);
    expect(salmon?.notes).toEqual(['PRICE REDUCED BY $7.26 each']);
  });

  it('reconstructs the receipt total from the grouped products', () => {
    const { items } = groupReceiptRows(REAL_RECEIPT);
    const sum = items.reduce((total, item) => total + item.lineTotalCents, 0);
    expect(sum).toBe(RECEIPT_TOTAL_CENTS);
  });

  it('counts units, not rows, the way the receipt states its total', () => {
    // "TOTAL (6 items)" — four singles plus a quantity of two.
    const { items } = groupReceiptRows(REAL_RECEIPT);
    expect(items.reduce((n, i) => n + i.quantity, 0)).toBe(6);
  });

  it('reports no anomalies for a receipt it fully understands', () => {
    expect(groupReceiptRows(REAL_RECEIPT).anomalies).toEqual([]);
  });
});

describe('single-item receipts', () => {
  it('takes the amount from the product row itself', () => {
    const { items } = groupReceiptRows([
      { prefixChar: '#', description: 'Wiltshire Impulse Citrus Juicer', amount: '8.00' },
    ]);
    expect(items).toEqual([
      {
        name: 'Wiltshire Impulse Citrus Juicer',
        quantity: 1,
        lineTotalCents: 800,
        unitPriceCents: 800,
        notes: [],
        gstApplicable: true,
        promotional: false,
      },
    ]);
  });

  it('marks GST from the # prefix', () => {
    const [gst] = groupReceiptRows([{ prefixChar: '#', description: 'A', amount: '1.00' }]).items;
    const [free] = groupReceiptRows([{ prefixChar: null, description: 'B', amount: '1.00' }]).items;
    expect(gst?.gstApplicable).toBe(true);
    expect(free?.gstApplicable).toBe(false);
  });
});

/**
 * Rows taken verbatim from a real 45-receipt export. Every one of these
 * was misread by a version of this module that produced a receipt adding
 * up exactly to its stated total — which is why none of these tests check
 * a sum.
 */
describe('weighed goods', () => {
  const WEIGHED: ReceiptRow[] = [
    { description: 'Orange Navel Loose', amount: '' },
    { description: '0.202 kg NET @ $2.90/kg', amount: '0.59' },
    { description: 'Chilli Red', amount: '' },
    { description: '0.022 kg NET @ $30.00/kg', amount: '0.66' },
  ];

  it('prices the fruit, not the weight line', () => {
    // Fruit, vegetables and the deli all price by weight, and the money is
    // on the weight row. Read as products they became two items called
    // "0.202 kg NET @ $2.90/kg" while the oranges were dropped for having
    // no amount — and $0.59 + $0.66 is still exactly what was paid.
    const { items } = groupReceiptRows(WEIGHED);
    expect(items.map((i) => i.name)).toEqual(['Orange Navel Loose', 'Chilli Red']);
    expect(items.map((i) => i.lineTotalCents)).toEqual([59, 66]);
  });

  it('counts one item, not 0.202 of one', () => {
    // A weight is not a count. Coercing it gives a bag of oranges a
    // quantity of zero.
    expect(groupReceiptRows(WEIGHED).items.every((i) => i.quantity === 1)).toBe(true);
  });

  it('keeps the weight, which is the only record of how much was bought', () => {
    expect(groupReceiptRows(WEIGHED).items[0]?.notes).toEqual(['0.202 kg NET @ $2.90/kg']);
  });

  it('reports no anomaly for a receipt of nothing but weighed goods', () => {
    expect(groupReceiptRows(WEIGHED).anomalies).toEqual([]);
  });
});

describe('money coming back', () => {
  it('takes a negative row out of the items and into the discounts', () => {
    // Four wordings appear across one account with nothing in common but
    // the minus sign. Left among the items they are products with negative
    // prices, and the receipt still adds up.
    const { items, discounts } = groupReceiptRows([
      { description: 'Berry Strawberry 250g P/P', amount: '5.00' },
      { description: 'Everyday Extra 10% Discount', amount: '-4.95' },
      { description: 'BUY 2 for $4.60', amount: '-4.80' },
      { description: 'CORN HARVEST  OFFER', amount: '-1.00' },
    ]);
    expect(items.map((i) => i.name)).toEqual(['Berry Strawberry 250g P/P']);
    expect(discounts).toEqual([
      { description: 'Everyday Extra 10% Discount', amountCents: 495 },
      { description: 'BUY 2 for $4.60', amountCents: 480 },
      { description: 'CORN HARVEST  OFFER', amountCents: 100 },
    ]);
  });

  it('states a discount as a positive number, because being a discount is the sign', () => {
    const { discounts } = groupReceiptRows([{ description: 'Offer', amount: '-1.50' }]);
    expect(discounts[0]?.amountCents).toBe(150);
  });

  it('does not mistake a free item for a discount', () => {
    const { items, discounts } = groupReceiptRows([{ description: 'Free Sample', amount: '0.00' }]);
    expect(items).toHaveLength(1);
    expect(discounts).toEqual([]);
  });
});

describe('the prefix characters', () => {
  it('reads ^ as a promotional price and # as GST, independently', () => {
    const [promo] = groupReceiptRows([{ prefixChar: '^', description: 'A', amount: '1.00' }]).items;
    const [gst] = groupReceiptRows([{ prefixChar: '#', description: 'B', amount: '1.00' }]).items;
    expect(promo).toMatchObject({ promotional: true, gstApplicable: false });
    expect(gst).toMatchObject({ promotional: false, gstApplicable: true });
  });
});

describe('quantities the receipt should never state', () => {
  it('refuses a quantity of zero but keeps the money', () => {
    // `unitPriceCents` is derived by dividing by the quantity, so a zero
    // yields Infinity and poisons every total downstream of it.
    const { items, anomalies } = groupReceiptRows([
      { description: 'Odd Product', amount: '' },
      { description: 'Qty 0 @ $2.00 each', amount: '4.00' },
    ]);
    expect(anomalies.map((a) => a.kind)).toEqual(['unreadable-quantity']);
    expect(items[0]).toMatchObject({ quantity: 1, lineTotalCents: 400, unitPriceCents: 400 });
    expect(Number.isSafeInteger(items[0]?.unitPriceCents)).toBe(true);
  });
});

describe('rows the grouper cannot place', () => {
  it('reports a quantity row with no product above it', () => {
    const { items, anomalies } = groupReceiptRows([
      { description: 'Qty 2 @ $1.00 each', amount: '2.00' },
    ]);
    expect(items).toHaveLength(0);
    expect(anomalies[0]?.kind).toBe('unattached-note');
  });

  it('reports a promotion with no product above it', () => {
    const { anomalies } = groupReceiptRows([
      { description: 'PRICE REDUCED BY $1.00 each', amount: '' },
    ]);
    expect(anomalies[0]?.kind).toBe('unattached-note');
  });

  it('reports a product whose amount never arrives, rather than pricing it at zero', () => {
    // A silent zero would understate the shop and still sum to something
    // plausible.
    const { items, anomalies } = groupReceiptRows([
      { description: 'Mystery Item', amount: '' },
      { description: 'Next Product', amount: '1.00' },
    ]);
    expect(items.map((i) => i.name)).toEqual(['Next Product']);
    expect(anomalies[0]?.kind).toBe('no-amount');
  });

  it('reports an unreadable amount', () => {
    const { anomalies } = groupReceiptRows([{ description: 'Odd', amount: 'FREE' }]);
    expect(anomalies[0]?.kind).toBe('unreadable-amount');
  });

  it('ignores an entirely blank row', () => {
    const { items, anomalies } = groupReceiptRows([
      { description: '', amount: '' },
      { description: 'Real Product', amount: '3.00' },
    ]);
    expect(items).toHaveLength(1);
    expect(anomalies).toEqual([]);
  });
});

describe('parseAmountCents', () => {
  it('reads receipt money with and without a dollar sign', () => {
    expect(parseAmountCents('8.00')).toBe(800);
    expect(parseAmountCents('$8.00')).toBe(800);
    expect(parseAmountCents('18.48')).toBe(1848);
  });

  it('does not lose cents to binary floating point', () => {
    expect(parseAmountCents('9.24')).toBe(924);
    expect(parseAmountCents('19.99')).toBe(1999);
    expect(parseAmountCents('0.07')).toBe(7);
  });

  it('reads a thousands separator', () => {
    expect(parseAmountCents('1,495.00')).toBe(149500);
  });

  it('returns null for blanks and prose rather than guessing', () => {
    expect(parseAmountCents('')).toBeNull();
    expect(parseAmountCents(null)).toBeNull();
    expect(parseAmountCents(undefined)).toBeNull();
    expect(parseAmountCents('FREE')).toBeNull();
  });
});
