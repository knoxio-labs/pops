/**
 * The one notion of "which order came later" the in-memory folds share.
 *
 * Two properties matter and neither is obvious from the call sites. Order is
 * by the instant, so a `+HH:MM` timestamp does not overtake a later `Z` one.
 * And a timestamp that does not parse loses both comparisons rather than
 * sorting to one end — the asymmetry that would otherwise hand it a group's
 * newest or oldest slot outright.
 *
 * `byNewestFirst` is the sort form of the same notion and deliberately does
 * NOT share the fold's answer: a fold may decline to rank an unreadable
 * timestamp, and a comparator may not — one that answers 0 both ways leaves
 * such a row wherever the scan happened to leave it, which is how a list
 * ordered by recency ends up ordered by insertion. Its cases below are about
 * totality and determinism rather than about which row is newest.
 */
import { describe, expect, it } from 'vitest';

import { byNewestFirst, hasInstant, isNewer, isOlder, orderRank } from '../services/order-rank.js';

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

describe('byNewestFirst', () => {
  const sorted = (ranks: readonly ReturnType<typeof orderRank>[]) =>
    [...ranks].sort(byNewestFirst).map((rank) => rank.tieBreaker);

  it('puts the later instant first, against the text order of the timestamps', () => {
    expect(byNewestFirst(laterInFact, earlierInFact)).toBeLessThan(0);
    expect(byNewestFirst(earlierInFact, laterInFact)).toBeGreaterThan(0);
  });

  it('sorts an unreadable timestamp last, whichever side it is passed on', () => {
    expect(byNewestFirst(unreadable, laterInFact)).toBeGreaterThan(0);
    expect(byNewestFirst(laterInFact, unreadable)).toBeLessThan(0);
  });

  it('separates two unreadable timestamps by the tie-break rather than leaving them be', () => {
    // The fold declines this comparison — see `isNewer`'s doc. A comparator
    // that did the same would answer 0, and `Array#sort` would keep whatever
    // order the query returned, which is the one thing this ordering must not
    // depend on.
    expect(byNewestFirst(orderRank('whenever', 'a'), orderRank('sometime', 'b'))).toBeLessThan(0);
    expect(byNewestFirst(orderRank('sometime', 'b'), orderRank('whenever', 'a'))).toBeGreaterThan(
      0
    );
  });

  it('separates two orders on the same instant by the tie-break', () => {
    const first = orderRank('2026-01-01T00:00:00Z', 'a');
    const second = orderRank('2026-01-01T00:00:00Z', 'b');

    expect(byNewestFirst(first, second)).toBeLessThan(0);
    expect(byNewestFirst(second, first)).toBeGreaterThan(0);
  });

  it('answers 0 only for two ranks nothing distinguishes', () => {
    const rank = orderRank('2026-01-01T00:00:00Z', 'a');

    expect(byNewestFirst(rank, rank)).toBe(0);
    expect(byNewestFirst(rank, orderRank('2026-01-01T00:00:00Z', 'a'))).toBe(0);
  });

  it('gives one ordering whatever order the rows arrived in', () => {
    // The property the whole comparator exists for. Three shapes at once —
    // two instants, a tie on one instant, and an unreadable timestamp — sorted
    // from two different starting orders. A comparator with a 0 where it
    // should have a tie-break passes every case above and fails this one.
    const ranks = [
      orderRank('2026-03-01T00:00:00Z', 'march'),
      orderRank('2026-01-01T00:00:00Z', 'jan-b'),
      orderRank('whenever', 'unreadable'),
      orderRank('2026-01-01T00:00:00Z', 'jan-a'),
      orderRank('2026-02-01T00:00:00Z', 'feb'),
    ];
    const expected = ['march', 'feb', 'jan-a', 'jan-b', 'unreadable'];

    expect(sorted(ranks)).toEqual(expected);
    expect(sorted([...ranks].reverse())).toEqual(expected);
  });
});
