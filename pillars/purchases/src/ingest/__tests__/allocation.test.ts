import { describe, expect, it } from 'vitest';

import { allocateProRata } from '../allocation.js';

/** Deterministic PRNG (mulberry32), seeded so a failure replays exactly. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe('allocateProRata', () => {
  it('splits evenly when the amount divides exactly', () => {
    expect(allocateProRata(900, [300, 300, 300])).toEqual([300, 300, 300]);
  });

  it('places the whole remainder deterministically when it does not divide evenly', () => {
    // $10.00 shipping across three equal-value lines: 333.33 each. The
    // extra cent has to land on exactly one line, not vanish and not
    // duplicate — this is the case POPS-1789 called out by name.
    const result = allocateProRata(1000, [1, 1, 1]);
    expect(sum(result)).toBe(1000);
    expect(result).toEqual([334, 333, 333]);
  });

  it('gives a zero-value line no shipping when other lines carry the whole order', () => {
    const result = allocateProRata(500, [0, 1000, 2000]);
    expect(result[0]).toBe(0);
    expect(sum(result)).toBe(500);
  });

  it('weights strictly by value: a line worth twice as much gets roughly twice the share', () => {
    const result = allocateProRata(300, [100, 200]);
    expect(result).toEqual([100, 200]);
  });

  it('falls back to an equal split when every weight is zero', () => {
    const result = allocateProRata(700, [0, 0, 0]);
    expect(sum(result)).toBe(700);
    expect(result.every((share) => share >= 233 && share <= 234)).toBe(true);
  });

  it('returns nothing for no items', () => {
    expect(allocateProRata(500, [])).toEqual([]);
  });

  it('leaves a single item with the whole amount', () => {
    expect(allocateProRata(999, [42])).toEqual([999]);
  });

  it('produces an all-zero allocation for zero shipping', () => {
    expect(allocateProRata(0, [100, 200, 300])).toEqual([0, 0, 0]);
  });

  it('never invents or drops a cent, across many random shipments', () => {
    const next = rng(1789);
    for (let trial = 0; trial < 500; trial++) {
      const itemCount = 1 + Math.floor(next() * 8);
      const weights = Array.from({ length: itemCount }, () => Math.floor(next() * 50_000));
      const totalCents = Math.floor(next() * 20_000);

      const result = allocateProRata(totalCents, weights);

      expect(result).toHaveLength(itemCount);
      expect(sum(result)).toBe(totalCents);
      for (const share of result) {
        expect(Number.isInteger(share)).toBe(true);
      }
    }
  });

  it('assigns no item a negative share when the total and every weight are non-negative', () => {
    const next = rng(42);
    for (let trial = 0; trial < 200; trial++) {
      const itemCount = 1 + Math.floor(next() * 6);
      const weights = Array.from({ length: itemCount }, () => Math.floor(next() * 10_000));
      const totalCents = Math.floor(next() * 10_000);

      const result = allocateProRata(totalCents, weights);
      for (const share of result) {
        expect(share).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
