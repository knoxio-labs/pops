import { describe, expect, it } from 'vitest';

import { orderCountAgreement, orderCountLabel } from './order-count-agreement';

describe('orderCountAgreement', () => {
  it('agrees when the list matches the count exactly', () => {
    expect(orderCountAgreement(6, 6, 500)).toBe('agrees');
  });

  it('agrees at zero and zero', () => {
    expect(orderCountAgreement(0, 0, 500)).toBe('agrees');
  });

  it('is none when the count says there should be orders but the list is empty', () => {
    expect(orderCountAgreement(0, 3, 500)).toBe('none');
  });

  it('is short of a non-zero list below both the count and the cap', () => {
    expect(orderCountAgreement(4, 6, 500)).toBe('short');
  });

  it('is capped when the list stopped exactly at the page limit', () => {
    expect(orderCountAgreement(500, 900, 500)).toBe('capped');
  });

  it('is over when the list holds more than the count claims', () => {
    expect(orderCountAgreement(10, 9, 500)).toBe('over');
  });

  it('prefers over to capped when the shown count exceeds both the counted total and the cap', () => {
    expect(orderCountAgreement(600, 500, 500)).toBe('over');
  });
});

describe('orderCountLabel', () => {
  it('is singular at exactly one', () => {
    expect(orderCountLabel(1)).toBe('1 order');
  });

  it('is plural at zero and above one', () => {
    expect(orderCountLabel(0)).toBe('0 orders');
    expect(orderCountLabel(2)).toBe('2 orders');
  });
});
