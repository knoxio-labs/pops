/**
 * How a removal batch is assembled once the ranking has decided the order.
 *
 * The walk is not free to reorder by size — that is the ranking's job, and
 * ordering by a fixed attribute is what produced the alphabetical deletions
 * this engine is being dug out of. It may only step over a pick that would
 * badly overshoot the deficit while something further down still fits.
 */
import { describe, expect, it } from 'vitest';

import { selectForDeficit } from '../rotation-cycle-types.js';

interface Film {
  title: string;
  sizeGb: number;
}

const film = (title: string, sizeGb: number): Film => ({ title, sizeGb });
const sizeOf = (f: Film): number => f.sizeGb;
const titles = (films: readonly Film[]): string[] => films.map((f) => f.title);
const total = (films: readonly Film[]): number => films.reduce((sum, f) => sum + f.sizeGb, 0);

describe('selectForDeficit', () => {
  it('meets the deficit without the overshoot an unconditional walk takes', () => {
    // Titles and sizes lifted from a live ranking on 2026-08-30, kept as a
    // fixture for its size distribution. What produced that order has since
    // been found to age movies from the wrong Radarr field with its watch and
    // Elo signals dead (POPS-2730), so this is no longer "the top of the
    // ranking" — but the walk under test consumes whatever order it is handed,
    // and the 118% overshoot an unconditional walk takes over these eight
    // sizes is arithmetic on the sizes alone.
    const ranked = [
      film('Road to Ninja', 2.1),
      film('Taxi', 2.4),
      film('Troy', 27.1),
      film('Rise of Skywalker', 52.3),
      film('Se7en', 67.3),
      film('Peter Pan', 3.5),
      film('The Dry', 5.1),
      film('Sleeping Beauty', 4.4),
    ];

    const { selected, skipped } = selectForDeficit(ranked, sizeOf, 40);

    expect(total(selected)).toBeGreaterThanOrEqual(40);
    expect(total(selected)).toBeLessThan(60);
    expect(titles(skipped)).toEqual(['Rise of Skywalker', 'Se7en']);
  });

  it('preserves rank order among everything it takes', () => {
    const ranked = [film('a', 5), film('b', 90), film('c', 5), film('d', 5)];

    const { selected } = selectForDeficit(ranked, sizeOf, 15);

    expect(titles(selected)).toEqual(['a', 'c', 'd']);
  });

  it('always takes the top-ranked movie, however large', () => {
    // The guarantee against a big file being pinned as permanently safe: it
    // reaches the front of the ranking eventually, and there it is taken.
    const ranked = [film('huge', 90), film('small', 1)];

    const { selected, skipped } = selectForDeficit(ranked, sizeOf, 5);

    expect(titles(selected)).toEqual(['huge']);
    expect(skipped).toEqual([]);
  });

  it('takes the only movie big enough rather than leaving the deficit unmet', () => {
    // A 1 GB movie below is not a substitute for the 50 GB one being stepped
    // over: skipping on the strength of "something smaller exists" strands the
    // batch at 3 GB against a 20 GB deficit, with the only movie that could
    // have covered it already passed.
    const ranked = [film('a', 2), film('big', 50), film('small', 1)];

    const { selected } = selectForDeficit(ranked, sizeOf, 20);

    expect(total(selected)).toBeGreaterThanOrEqual(20);
    expect(titles(selected)).toContain('big');
  });

  it('does not walk past a large movie only to take an equally large one below it', () => {
    // When everything below also overshoots, skipping each in turn would trade
    // the top-ranked movie for a lower-ranked one no smaller than it.
    const ranked = [film('a', 2), film('big first', 50), film('big second', 50)];

    const { selected, skipped } = selectForDeficit(ranked, sizeOf, 20);

    expect(titles(selected)).toEqual(['a', 'big first']);
    expect(skipped).toEqual([]);
  });

  it('accepts the overshoot when nothing further down fits', () => {
    const ranked = [film('a', 3), film('b', 80), film('c', 70)];

    const { selected } = selectForDeficit(ranked, sizeOf, 20);

    expect(titles(selected)).toEqual(['a', 'b']);
    expect(total(selected)).toBeGreaterThanOrEqual(20);
  });

  it('tolerates a modest overshoot rather than hunting for an exact fit', () => {
    const ranked = [film('a', 12), film('b', 1)];

    const { selected } = selectForDeficit(ranked, sizeOf, 10);

    expect(titles(selected)).toEqual(['a']);
  });

  it('ignores movies with no file on disk', () => {
    const ranked = [film('no file', 0), film('a', 6), film('b', 6)];

    const { selected } = selectForDeficit(ranked, sizeOf, 10);

    expect(titles(selected)).toEqual(['a', 'b']);
  });

  it('takes everything available when the deficit cannot be met', () => {
    const ranked = [film('a', 4), film('b', 3)];

    const { selected, skipped } = selectForDeficit(ranked, sizeOf, 100);

    expect(titles(selected)).toEqual(['a', 'b']);
    expect(skipped).toEqual([]);
  });

  it('selects nothing for a deficit that is already covered', () => {
    expect(selectForDeficit([film('a', 4)], sizeOf, 0).selected).toEqual([]);
    expect(selectForDeficit([film('a', 4)], sizeOf, -10).selected).toEqual([]);
  });

  it('selects nothing from an empty ranking', () => {
    expect(selectForDeficit([], sizeOf, 40)).toEqual({ selected: [], skipped: [] });
  });
});
