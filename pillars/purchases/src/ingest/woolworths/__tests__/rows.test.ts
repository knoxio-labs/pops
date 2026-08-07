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
