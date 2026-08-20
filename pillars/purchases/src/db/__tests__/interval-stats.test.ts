/**
 * The gap arithmetic, held away from a database.
 *
 * The failures worth catching here are all silent. A median taken over gaps
 * left in chronological order is not a median; extremes read off the ends of
 * that same array are the first and last gaps rather than the smallest and
 * largest; and a mean that agrees with the median on a regular history hides
 * that only one of them survives a bursty one. Each of those returns a
 * plausible number.
 */
import { describe, expect, it } from 'vitest';

import { summariseIntervals } from '../services/interval-stats.js';

const DAY = 86_400_000;
const DAY_SECONDS = 86_400;

/** Epoch instants `days` apart, cumulatively, starting at an arbitrary epoch. */
function at(...days: readonly number[]): number[] {
  let cursor = Date.parse('2026-01-01T00:00:00Z');
  const instants = [cursor];
  for (const gap of days) {
    cursor += gap * DAY;
    instants.push(cursor);
  }
  return instants;
}

describe('summariseIntervals', () => {
  it('has nothing to say about a single occurrence', () => {
    expect(summariseIntervals([Date.parse('2026-01-01T00:00:00Z')])).toBeNull();
  });

  it('has nothing to say about none', () => {
    expect(summariseIntervals([])).toBeNull();
  });

  it('reports one gap as every figure it has', () => {
    expect(summariseIntervals(at(7))).toEqual({
      medianSeconds: 7 * DAY_SECONDS,
      meanSeconds: 7 * DAY_SECONDS,
      shortestSeconds: 7 * DAY_SECONDS,
      longestSeconds: 7 * DAY_SECONDS,
    });
  });

  it('takes the median over the gaps by size, not in the order they happened', () => {
    // 2, 30, 3 in time order. Read straight off the array the middle gap is
    // 30; sorted it is 3, which is what a median means.
    const stats = summariseIntervals(at(2, 30, 3));

    expect(stats?.medianSeconds).toBe(3 * DAY_SECONDS);
  });

  it('reports the smallest and largest gaps, not the first and last', () => {
    const stats = summariseIntervals(at(9, 1, 40, 5));

    expect(stats?.shortestSeconds).toBe(1 * DAY_SECONDS);
    expect(stats?.longestSeconds).toBe(40 * DAY_SECONDS);
  });

  it('averages the two middle gaps when their count is even', () => {
    const stats = summariseIntervals(at(2, 4, 6, 10));

    // Sorted: 2, 4, 6, 10 — the middle pair averages to 5.
    expect(stats?.medianSeconds).toBe(5 * DAY_SECONDS);
  });

  it('separates from the mean on a bursty history, which is the point of returning both', () => {
    // Five purchases in a week, then a two-year gap. The mean describes a
    // cadence nothing ever happened at; the median describes the burst.
    const stats = summariseIntervals(at(1, 1, 1, 1, 730));

    expect(stats?.medianSeconds).toBe(1 * DAY_SECONDS);
    expect(stats?.meanSeconds).toBe(Math.round(((4 + 730) / 5) * DAY_SECONDS));
    expect(stats?.meanSeconds).toBeGreaterThan(stats?.medianSeconds ?? 0);
  });

  it('keeps a same-instant repeat as a zero gap rather than collapsing it', () => {
    const instant = Date.parse('2026-01-01T00:00:00Z');

    expect(summariseIntervals([instant, instant])).toEqual({
      medianSeconds: 0,
      meanSeconds: 0,
      shortestSeconds: 0,
      longestSeconds: 0,
    });
  });

  it('does not depend on the order it is given the instants in', () => {
    const ordered = at(3, 11, 7);
    const shuffled = [ordered[2], ordered[0], ordered[3], ordered[1]].filter(
      (value): value is number => value !== undefined
    );

    expect(summariseIntervals(shuffled)).toEqual(summariseIntervals(ordered));
  });

  it('rounds to the second rather than truncating toward a shorter cadence', () => {
    const start = Date.parse('2026-01-01T00:00:00Z');
    const stats = summariseIntervals([start, start + 1600]);

    expect(stats?.medianSeconds).toBe(2);
  });
});
