/**
 * The eval decides whether a prompt revision is reported as better, so these
 * cases are built to catch a scorer that flatters: one that folds a false
 * positive into "wrong", counts an empty-vs-empty axis as a hit, or reads a
 * zero denominator as a perfect rate.
 */
import { describe, expect, it } from 'vitest';

import {
  facetRates,
  formatScoreTable,
  HELD_OUT_PERCENT,
  isHeldOut,
  scoreTagSuggestions,
} from '../tag-suggestion-eval.js';

describe('scoreTagSuggestions', () => {
  it('counts a value on an axis the committed row leaves empty as a false positive, not as wrong', () => {
    const [venue] = scoreTagSuggestions(
      [{ suggested: ['venue:takeaway'], committed: ['hobby:crypto'] }],
      ['venue']
    );

    expect(venue).toMatchObject({ falsePositive: 1, wrongValue: 0, exact: 0, bothEmpty: 0 });
  });

  it('separates a missed axis, a wrong value and an exact match', () => {
    const [venue] = scoreTagSuggestions(
      [
        { suggested: [], committed: ['venue:pub'] },
        { suggested: ['venue:club'], committed: ['venue:pub'] },
        { suggested: ['venue:pub'], committed: ['venue:pub'] },
      ],
      ['venue']
    );

    expect(venue).toMatchObject({ falseNegative: 1, wrongValue: 1, exact: 1, falsePositive: 0 });
  });

  it('requires the whole value set to match on a multi-valued facet', () => {
    const [contains] = scoreTagSuggestions(
      [
        { suggested: ['contains:food'], committed: ['contains:food', 'contains:alcohol'] },
        {
          suggested: ['contains:alcohol', 'contains:food'],
          committed: ['contains:food', 'contains:alcohol'],
        },
      ],
      ['contains']
    );

    expect(contains).toMatchObject({ wrongValue: 1, exact: 1 });
  });

  it('ignores tags on facets it was not asked to score', () => {
    const [occasion] = scoreTagSuggestions(
      [{ suggested: ['venue:pub'], committed: ['hobby:crypto'] }],
      ['occasion']
    );

    expect(occasion).toMatchObject({ bothEmpty: 1, falsePositive: 0, total: 1 });
  });

  it('does not split on a colon inside a value', () => {
    const [trip] = scoreTagSuggestions(
      [{ suggested: ['trip:a:b'], committed: ['trip:a:b'] }],
      ['trip']
    );

    expect(trip?.exact).toBe(1);
  });
});

describe('facetRates', () => {
  it('reports null rather than 0% or 100% when a denominator is empty', () => {
    const [venue] = scoreTagSuggestions([{ suggested: [], committed: ['venue:pub'] }], ['venue']);
    if (venue === undefined) throw new Error('no score');

    expect(facetRates(venue)).toEqual({
      facet: 'venue',
      recall: 0,
      precision: null,
      falsePositiveRate: null,
    });
  });

  it('computes the false-positive rate over the axes the person left empty only', () => {
    const [venue] = scoreTagSuggestions(
      [
        { suggested: ['venue:pub'], committed: [] },
        { suggested: [], committed: [] },
        { suggested: [], committed: [] },
        { suggested: ['venue:pub'], committed: ['venue:pub'] },
      ],
      ['venue']
    );
    if (venue === undefined) throw new Error('no score');

    const rates = facetRates(venue);
    expect(rates.falsePositiveRate).toBeCloseTo(1 / 3);
    expect(rates.precision).toBeCloseTo(1 / 2);
    expect(rates.recall).toBe(1);
  });
});

describe('isHeldOut', () => {
  it('is stable for the same id', () => {
    expect(isHeldOut('0d176c5e-1151-414b-a010-612e2b063efc')).toBe(
      isHeldOut('0d176c5e-1151-414b-a010-612e2b063efc')
    );
  });

  it('holds out roughly the configured share of a large id population', () => {
    const ids = Array.from(
      { length: 10_000 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    );
    const share = (ids.filter(isHeldOut).length / ids.length) * 100;

    expect(share).toBeGreaterThan(HELD_OUT_PERCENT - 3);
    expect(share).toBeLessThan(HELD_OUT_PERCENT + 3);
  });
});

describe('formatScoreTable', () => {
  it('renders one line per facet under a header, with n/a for an undefined rate', () => {
    const table = formatScoreTable(
      scoreTagSuggestions([{ suggested: [], committed: ['venue:pub'] }], ['venue', 'fee'])
    );
    const lines = table.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^venue\s+n\/a\s+n\/a\s+0\.0%/);
  });
});
