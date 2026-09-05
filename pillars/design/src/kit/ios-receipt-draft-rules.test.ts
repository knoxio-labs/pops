import { describe, expect, it } from 'vitest';

import { adjustmentRows, isSaveable, lineProblem } from './ios-receipt-draft-rules';

import type { ExtractedReceipt } from '@/fixtures/receipts';

const base: ExtractedReceipt = {
  currency: 'AUD',
  total: '31.00',
  discounts: [],
  surcharges: [],
  lines: [{ id: 'l1', description: 'Sourdough loaf', amount: '6.00' }],
  unreadableNotes: [],
};

describe('adjustment rows', () => {
  it('treats a blank value as absent, the way an unread field arrives', () => {
    const rows = adjustmentRows({ ...base, tax: '   ', shipping: '', discounts: [''] });
    expect(rows).toEqual([]);
  });

  it('lists every stated adjustment in receipt order, repeats included', () => {
    const rows = adjustmentRows({
      ...base,
      tax: '7.66',
      discounts: ['2.00', '0.50'],
      surcharges: ['0.03'],
      shipping: '4.00',
    });
    expect(rows).toEqual([
      { label: 'Tax', value: '7.66' },
      { label: 'Discounts', value: '2.00' },
      { label: 'Discounts', value: '0.50' },
      { label: 'Surcharges', value: '0.03' },
      { label: 'Shipping', value: '4.00' },
    ]);
  });
});

describe('line problem', () => {
  it('spares an untouched blank row', () => {
    expect(lineProblem({ id: 'l1', description: '', amount: '' })).toBe(false);
    expect(lineProblem({ id: 'l1', description: '   ', amount: '  ' })).toBe(false);
  });

  it('flags a line somebody described but never priced', () => {
    expect(lineProblem({ id: 'l1', description: 'Sourdough loaf', amount: '' })).toBe(true);
  });

  it('does not flag a priced line with no description — the till prints those', () => {
    expect(lineProblem({ id: 'l1', description: '', amount: '6.00' })).toBe(false);
  });
});

describe('saveable', () => {
  it('needs a total', () => {
    expect(isSaveable(base)).toBe(true);
    expect(isSaveable({ ...base, total: undefined })).toBe(false);
    expect(isSaveable({ ...base, total: '  ' })).toBe(false);
  });

  it('refuses while any described line has no amount', () => {
    const lines = [...base.lines, { id: 'l2', description: 'Milk', amount: '' }];
    expect(isSaveable({ ...base, lines })).toBe(false);
  });

  it('is unmoved by a blank row somebody just added', () => {
    const lines = [...base.lines, { id: 'l2', description: '', amount: '' }];
    expect(isSaveable({ ...base, lines })).toBe(true);
  });
});
