import { describe, expect, it } from 'vitest';

import { orderCountAgreement } from '../order-count-agreement';

const CAP = 500;

describe('orderCountAgreement', () => {
  it('says nothing when the list is exactly what the row counted', () => {
    expect(orderCountAgreement(12, 12, CAP)).toBe('agrees');
  });

  it('blames the page cap only when the list came back at it', () => {
    expect(orderCountAgreement(CAP, 748, CAP)).toBe('capped');
  });

  // The cause a shortfall short of the cap has is not one this layer
  // observed — an order deleted between the two reads produces it with the
  // cap untouched — so it must not be reported as the cap.
  it('calls a shortfall short of the cap a disagreement, not a page cut short', () => {
    expect(orderCountAgreement(1, 3, CAP)).toBe('short');
    expect(orderCountAgreement(CAP - 1, 748, CAP)).toBe('short');
  });

  it('keeps an empty answer its own reading', () => {
    expect(orderCountAgreement(0, 12, CAP)).toBe('none');
  });

  // The direction a widened label filter fails in: more orders than the
  // figures above were computed from.
  it('reports a list longer than the count', () => {
    expect(orderCountAgreement(13, 12, CAP)).toBe('over');
    expect(orderCountAgreement(CAP, 3, CAP)).toBe('over');
  });
});
