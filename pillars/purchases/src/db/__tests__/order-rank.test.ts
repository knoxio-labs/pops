/**
 * The one notion of "which order came later" the in-memory folds share.
 *
 * Two properties matter and neither is obvious from the call sites. Order is
 * by the instant, so a `+HH:MM` timestamp does not overtake a later `Z` one.
 * And a timestamp that does not parse loses both comparisons rather than
 * sorting to one end — the asymmetry that would otherwise hand it a group's
 * newest or oldest slot outright.
 */
import { describe, expect, it } from 'vitest';

import { hasInstant, isNewer, isOlder, orderRank } from '../services/order-rank.js';

const earlierInFact = orderRank('2026-01-02T00:00:00+10:00', 'a');
const laterInFact = orderRank('2026-01-01T20:00:00Z', 'b');
const unreadable = orderRank('whenever', 'c');

describe('orderRank', () => {
  it('orders two offsets by the instant, against their text order', () => {
    expect(isNewer(laterInFact, earlierInFact)).toBe(true);
    expect(isNewer(earlierInFact, laterInFact)).toBe(false);
    expect(isOlder(earlierInFact, laterInFact)).toBe(true);
    expect(isOlder(laterInFact, earlierInFact)).toBe(false);
  });

  it('breaks a tie on the same instant deterministically, both ways', () => {
    const first = orderRank('2026-01-01T00:00:00Z', 'a');
    const second = orderRank('2026-01-01T00:00:00Z', 'b');

    expect(isNewer(second, first)).toBe(true);
    expect(isOlder(first, second)).toBe(true);
    expect(isNewer(first, first)).toBe(false);
    expect(isOlder(first, first)).toBe(false);
  });

  it('never lets an unreadable timestamp become either end', () => {
    expect(isNewer(unreadable, laterInFact)).toBe(false);
    expect(isOlder(unreadable, laterInFact)).toBe(false);
    expect(hasInstant(unreadable)).toBe(false);
  });

  it('lets a readable timestamp displace an unreadable one at either end', () => {
    expect(isNewer(laterInFact, unreadable)).toBe(true);
    expect(isOlder(laterInFact, unreadable)).toBe(true);
  });

  it('leaves two unreadable timestamps in the order they arrived', () => {
    expect(isNewer(unreadable, orderRank('sometime', 'a'))).toBe(false);
    expect(isOlder(unreadable, orderRank('sometime', 'a'))).toBe(false);
  });
});
