import { describe, expect, it } from 'vitest';

import { ExtractedReceiptSchema } from '../extraction.js';
import { gateExtraction } from '../gate.js';

import type { ExtractedReceipt } from '../extraction.js';

const receipt = (over: Partial<ExtractedReceipt> = {}): ExtractedReceipt =>
  ExtractedReceiptSchema.parse({
    merchantName: 'Bunnings Warehouse',
    purchasedOn: '2026-08-01',
    purchasedAt: '14:32',
    currency: 'AUD',
    total: '$27.50',
    tax: null,
    discounts: [],
    lines: [
      { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
      { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
    ],
    unreadable: [],
    ...over,
  });

describe('a reading that agrees with the paper', () => {
  it('is admissible', () => {
    const result = gateExtraction(receipt());
    expect(result.admissible).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.lineTotalCents).toBe(2750);
    expect(result.totalCents).toBe(2750);
  });

  it('adds stated tax rather than assuming it is already in the lines', () => {
    // A receipt that separates tax has lines that exclude it. Assuming
    // either convention breaks the other country's receipts.
    const result = gateExtraction(receipt({ total: '$30.25', tax: '$2.75' }));
    expect(result.admissible).toBe(true);
    expect(result.taxCents).toBe(275);
  });

  it('subtracts stated discounts', () => {
    const result = gateExtraction(receipt({ total: '$22.50', discounts: ['$5.00'] }));
    expect(result.admissible).toBe(true);
    expect(result.discountCents).toBe(500);
  });

  it('reads a discount stated as a negative the same as a positive', () => {
    const negative = gateExtraction(receipt({ total: '$22.50', discounts: ['-$5.00'] }));
    expect(negative.admissible).toBe(true);
    expect(negative.discountCents).toBe(500);
  });
});

describe('a reading that does not', () => {
  it('is refused, with the discrepancy stated in cents', () => {
    // The whole point. A model reading a crumpled receipt is confidently
    // wrong often enough that its output cannot be trusted on its own —
    // but the receipt states its own answer, so it does not have to be.
    const result = gateExtraction(receipt({ total: '$99.99' }));
    expect(result.admissible).toBe(false);
    const mismatch = result.failures.find((f) => f.kind === 'sum-mismatch');
    expect(mismatch?.deltaCents).toBe(2750 - 9999);
    expect(mismatch?.detail).toContain('9999c');
  });

  it('does not accept a reading that is out by a single cent', () => {
    // Any tolerance wide enough to absorb rounding is wide enough to absorb
    // a misread digit, and a misread digit is worth at least ten cents.
    const result = gateExtraction(receipt({ total: '$27.51' }));
    expect(result.admissible).toBe(false);
  });

  it('refuses a total it cannot read as money', () => {
    const result = gateExtraction(receipt({ total: 'TOTAL' }));
    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toContain('unreadable-total');
    expect(result.totalCents).toBeNull();
  });

  it('names the line it could not read, by position and description', () => {
    // A reviewer holding the photo needs to know which line to look at.
    const result = gateExtraction(
      receipt({
        lines: [
          { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
          { description: 'Screws Bugle 8g 65mm', amount: 'SMUDGED' },
        ],
      })
    );
    const failure = result.failures.find((f) => f.kind === 'unreadable-line');
    expect(failure?.detail).toContain('line 2');
    expect(failure?.detail).toContain('Screws Bugle 8g 65mm');
  });

  it('refuses a receipt with a total and no lines', () => {
    // It reconciles trivially against nothing, so without this the emptiest
    // possible reading is also the most confident one.
    const result = gateExtraction(receipt({ lines: [], total: '$0.00' }));
    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toContain('no-lines');
  });

  it('refuses a receipt the model admits it could not fully read', () => {
    // The sum can still agree while a torn line is missing from both sides
    // of it. The reviewer needs "the receipt is damaged" told apart from
    // "the model is wrong".
    const result = gateExtraction(receipt({ unreadable: ['the third line is torn'] }));
    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toEqual(['damaged']);
  });

  it('reports everything wrong with it, not just the first thing', () => {
    const result = gateExtraction(
      receipt({
        total: 'TOTAL',
        lines: [{ description: 'Something', amount: 'SMUDGED' }],
        unreadable: ['bottom corner missing'],
      })
    );
    expect(result.failures.map((f) => f.kind).toSorted()).toEqual([
      'damaged',
      'unreadable-line',
      'unreadable-total',
    ]);
  });
});

describe('what the gate cannot catch, and does not pretend to', () => {
  it('accepts a reading whose descriptions are wrong but whose money is right', () => {
    // Stated so the limit is explicit: this checks arithmetic, not reading
    // comprehension. A model that transcribes every amount correctly and
    // every product name badly passes, and should — the money is what
    // reconciliation and spend analysis run on, and a wrong name is visible
    // to a human in a way a wrong cent is not.
    const result = gateExtraction(
      receipt({
        lines: [
          { description: 'aaaa', amount: '$12.50' },
          { description: 'bbbb', amount: '$15.00' },
        ],
      })
    );
    expect(result.admissible).toBe(true);
  });
});

describe('a discount the model filed among the lines', () => {
  it('is refused, even though the arithmetic reconciles', () => {
    // This is the case nothing else here would catch. Σ lines still equals
    // the stated total, so the sum check is satisfied and the reading looks
    // admissible — while the purchase it produces carries an item worth
    // less than nothing, and per-item spend silently nets out.
    const misfiled = receipt({
      total: '$8.00',
      lines: [
        { description: 'Timber Pine DAR 42x19', amount: '$10.00' },
        { description: 'MEMBER DISCOUNT', amount: '-$2.00' },
      ],
    });

    const result = gateExtraction(misfiled);

    expect(result.admissible).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.kind).toBe('negative-line');
    expect(result.failures[0]?.detail).toContain('MEMBER DISCOUNT');
    // The arithmetic is reported as it truly is, so a reviewer sees that
    // the total does agree and the filing is the only fault.
    expect(result.lineTotalCents).toBe(800);
    expect(result.totalCents).toBe(800);
  });

  it('accepts the same receipt with the discount in its proper place', () => {
    const proper = receipt({
      total: '$8.00',
      discounts: ['$2.00'],
      lines: [{ description: 'Timber Pine DAR 42x19', amount: '$10.00' }],
    });

    const result = gateExtraction(proper);

    expect(result.admissible).toBe(true);
    expect(result.failures).toEqual([]);
  });
});
