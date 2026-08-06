import { describe, expect, it } from 'vitest';

import { findSubsetSummingTo, MAX_SUBSET_CANDIDATES } from '../subset-sum.js';

describe('findSubsetSummingTo', () => {
  it('finds a unique single-element match', () => {
    expect(findSubsetSummingTo([1000, 2500, 4000], 2500)).toEqual({
      kind: 'unique',
      indices: [1],
    });
  });

  it('finds a shipment split — several transactions summing to one charge', () => {
    const result = findSubsetSummingTo([1200, 3300, 900, 5000], 4500, { minSize: 2 });
    expect(result.kind).toBe('unique');
    if (result.kind !== 'unique') return;
    expect([...result.indices].toSorted()).toEqual([0, 1]);
  });

  it('reports no combination rather than approximating', () => {
    expect(findSubsetSummingTo([1000, 2000], 3500).kind).toBe('none');
  });

  it('reports ambiguity instead of picking one of two valid partitions', () => {
    // 1000+2000 and 3000 both reach 3000. Choosing either is a coin flip.
    const result = findSubsetSummingTo([1000, 2000, 3000], 3000);
    expect(result.kind).toBe('ambiguous');
  });

  it('is deterministic across runs for the same input', () => {
    const amounts = [500, 1500, 2500, 3500, 750];
    const first = findSubsetSummingTo(amounts, 4000, { minSize: 2 });
    for (let run = 0; run < 20; run++) {
      expect(findSubsetSummingTo(amounts, 4000, { minSize: 2 })).toEqual(first);
    }
  });

  describe('zero amounts', () => {
    it('does not let a zero turn a unique answer ambiguous', () => {
      // Without excluding zeros, {2500} and {2500, 0} are two valid
      // answers, so a single zero-amount transaction would send the whole
      // window to review for no reason.
      const result = findSubsetSummingTo([2500, 0], 2500);
      expect(result).toEqual({ kind: 'unique', indices: [0] });
    });

    it('never includes a zero in a solution', () => {
      const result = findSubsetSummingTo([1000, 0, 1500], 2500, { minSize: 2 });
      expect(result.kind).toBe('unique');
      if (result.kind !== 'unique') return;
      expect(result.indices).not.toContain(1);
    });

    it('finds nothing for a zero target rather than every empty-ish subset', () => {
      expect(findSubsetSummingTo([0, 0, 1000], 0).kind).toBe('none');
    });
  });

  describe('sign', () => {
    it('matches a refund against negative amounts', () => {
      expect(findSubsetSummingTo([-1179, 2000, -500], -1179)).toEqual({
        kind: 'unique',
        indices: [0],
      });
    });

    it('never cancels a purchase against a refund to hit a target', () => {
      // 5000 + (-2000) + 2000 = 5000 is arithmetically true and factually
      // absurd: a refund did not help pay for the order.
      const result = findSubsetSummingTo([5000, -2000, 2000], 5000);
      expect(result).toEqual({ kind: 'unique', indices: [0] });
    });

    it('finds a negative split without borrowing a positive', () => {
      const result = findSubsetSummingTo([-1000, -1500, 3000], -2500, { minSize: 2 });
      expect(result.kind).toBe('unique');
      if (result.kind !== 'unique') return;
      expect([...result.indices].toSorted()).toEqual([0, 1]);
    });
  });

  describe('the candidate ceiling', () => {
    it('refuses to search a window that is too crowded', () => {
      const amounts = Array.from({ length: MAX_SUBSET_CANDIDATES + 1 }, (_, i) => (i + 1) * 100);
      const result = findSubsetSummingTo(amounts, 300);
      expect(result.kind).toBe('too-many');
    });

    it('counts only eligible candidates toward the ceiling', () => {
      // Zeros and wrong-signed values cannot take part, so they must not
      // push an otherwise-searchable window over the bound.
      const amounts = [...Array.from({ length: 12 }, (_, i) => (i + 1) * 100), 0, 0, -500];
      expect(findSubsetSummingTo(amounts, 100).kind).not.toBe('too-many');
    });

    it('searches a full window at the ceiling', () => {
      const amounts = Array.from({ length: MAX_SUBSET_CANDIDATES }, (_, i) => (i + 1) * 100);
      expect(findSubsetSummingTo(amounts, 100).kind).toBe('unique');
    });
  });

  it('honours a minimum subset size, so a split cannot be a single txn', () => {
    // 2500 alone reaches the target, but a split means two or more.
    const result = findSubsetSummingTo([2500, 1000, 1500], 2500, { minSize: 2 });
    expect(result.kind).toBe('unique');
    if (result.kind !== 'unique') return;
    expect([...result.indices].toSorted()).toEqual([1, 2]);
  });

  it('is exact on cent values that would drift as floats', () => {
    // 0.1 + 0.2 territory: as dollars these sum to 30.000000000000004.
    expect(findSubsetSummingTo([10, 20], 30, { minSize: 2 }).kind).toBe('unique');
    expect(findSubsetSummingTo([1999, 829, 7], 2835, { minSize: 2 }).kind).toBe('unique');
  });
});
