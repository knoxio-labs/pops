/**
 * Summarising the gaps between a repeated event's occurrences.
 *
 * Its own module because the arithmetic is the part that is quietly wrong
 * elsewhere, and it is testable without a database. Two decisions are load
 * bearing:
 *
 * **The median leads, and the mean is returned beside it.** `(last − first)
 * / (n − 1)` is the figure everyone reaches for and it describes a bursty
 * history badly: five purchases in one week two years ago and one
 * yesterday average to a comfortable four months, which is a cadence
 * nothing ever happened at. The median survives that; the mean does not,
 * and the distance between the two is exactly the signal that the median is
 * worth trusting. Returning only one of them would hide the check.
 *
 * **Seconds, as integers.** Timestamps are instants and seconds is the
 * largest unit that loses nothing meaningful about a gap measured in weeks;
 * rounding to whole days here would print 6.6 and 7.4 as the same number in
 * a payload that could then no longer tell them apart. A day figure is a
 * rendering choice and belongs to whoever renders it.
 */

const MILLISECONDS_PER_SECOND = 1000;

/** The gaps between consecutive occurrences, in whole seconds. */
export interface IntervalStats {
  /**
   * The middle gap — the mean of the two middle ones where their count is
   * even, rounded to the second, which is immaterial against a gap measured
   * in days and keeps every figure here an integer.
   */
  readonly medianSeconds: number;
  /** The arithmetic mean, identically rounded. Diverges from the median when the history is bursty. */
  readonly meanSeconds: number;
  readonly shortestSeconds: number;
  readonly longestSeconds: number;
}

/**
 * Summarise the gaps between `instants` (epoch milliseconds, in any order).
 *
 * Null when fewer than two occurrences are given: one purchase has no gap,
 * and a zero would be read as "bought again immediately" — the opposite of
 * what it means.
 *
 * Two occurrences at the same instant are a genuine zero-second gap, not a
 * duplicate to collapse: two orders placed the same minute are two
 * purchases, and dropping one would understate how often the thing is
 * bought.
 */
export function summariseIntervals(instants: readonly number[]): IntervalStats | null {
  if (instants.length < 2) return null;

  const ordered = [...instants].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    gaps.push((ordered[i] ?? 0) - (ordered[i - 1] ?? 0));
  }

  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  // Sorted after the total is taken: the median and the extremes want the
  // gaps by size, and the sum does not care, so one pass over the
  // chronological order does both.
  gaps.sort((a, b) => a - b);

  return {
    medianSeconds: toSeconds(median(gaps)),
    meanSeconds: toSeconds(total / gaps.length),
    shortestSeconds: toSeconds(gaps[0] ?? 0),
    longestSeconds: toSeconds(gaps.at(-1) ?? 0),
  };
}

/** `values` must be sorted ascending, which the caller's own sort guarantees. */
function median(values: readonly number[]): number {
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle] ?? 0;
  return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
}

function toSeconds(milliseconds: number): number {
  return Math.round(milliseconds / MILLISECONDS_PER_SECOND);
}
