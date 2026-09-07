import { describe, expect, it } from 'vitest';

import { activeIndexFor, chargeIdAfterMove, chargeIdAfterSkip } from './cursor';

import type { QueueEntry } from '@/fixtures/purchases-queue';

function entry(chargeId: string): QueueEntry {
  return {
    chargeId,
    purchaseId: chargeId,
    source: 'manual',
    sourceOrderId: null,
    merchantEntityName: null,
    orderedAt: '2026-01-01',
    amountCents: 100,
    currency: 'AUD',
    deltaCents: 0,
    proposed: [],
    autoLinkedSource: false,
  };
}

const entries = [entry('a'), entry('b'), entry('c')];

describe('activeIndexFor', () => {
  it('finds the requested charge', () => {
    expect(activeIndexFor(entries, 'b')).toBe(1);
  });

  it('falls back to the top when the requested charge is gone', () => {
    expect(activeIndexFor(entries, 'missing')).toBe(0);
  });

  it('falls back to the top when nothing has been requested yet', () => {
    expect(activeIndexFor(entries, null)).toBe(0);
  });

  it('answers -1 for an empty list rather than falling back to a nonexistent row', () => {
    expect(activeIndexFor([], null)).toBe(-1);
  });
});

describe('chargeIdAfterMove', () => {
  it('moves forward and backward within bounds', () => {
    expect(chargeIdAfterMove(entries, 0, 1)).toBe('b');
    expect(chargeIdAfterMove(entries, 1, -1)).toBe('a');
  });

  it('clamps at the last row rather than wrapping', () => {
    expect(chargeIdAfterMove(entries, 2, 1)).toBe('c');
  });

  it('clamps at the first row rather than going negative', () => {
    expect(chargeIdAfterMove(entries, 0, -1)).toBe('a');
  });

  it('is undefined over an empty list', () => {
    expect(chargeIdAfterMove([], 0, 1)).toBeUndefined();
  });
});

describe('chargeIdAfterSkip', () => {
  it('lands on the successor', () => {
    expect(chargeIdAfterSkip(entries, 'a')).toBe('b');
  });

  it('holds the current charge when it is the last row', () => {
    expect(chargeIdAfterSkip(entries, 'c')).toBe('c');
  });

  it('holds the current charge when it is no longer in the list', () => {
    expect(chargeIdAfterSkip(entries, 'missing')).toBe('missing');
  });
});
