/**
 * The shared predicate's contract: which representation each match type is
 * tested against, and the consequences of `regex` seeing the raw description
 * (POPS-2640).
 */
import { describe, expect, it } from 'vitest';

import {
  describeForMatching,
  normalizeDescription,
  patternMatchesDescription,
} from '../pattern-match.js';

describe('patternMatchesDescription', () => {
  describe('regex is tested against the raw description', () => {
    it('matches a digit pattern against digits in the description', () => {
      // The regression: `\d{4}-\d{2}` is the example POPS-2600's acceptance
      // criteria used, and it matched nothing until POPS-2640.
      expect(
        patternMatchesDescription('\\d{4}-\\d{2}', 'regex', describeForMatching('INV 1234-56 PAID'))
      ).toBe(true);
    });

    it('matches a store number normalisation would have removed', () => {
      expect(
        patternMatchesDescription(
          '^WOOLWORTHS 1034 ',
          'regex',
          describeForMatching('WOOLWORTHS 1034 CANTERB')
        )
      ).toBe(true);
    });

    it('sees the digits normalisation strips', () => {
      const description = describeForMatching('CARD 4471 PURCHASE');
      expect(description.normalized).toBe('CARD PURCHASE');
      expect(patternMatchesDescription('4471', 'regex', description)).toBe(true);
      expect(patternMatchesDescription('\\d{4}', 'regex', description)).toBe(true);
    });

    it('no longer matches a pattern written for the digit-stripped form', () => {
      // The other side of the change: anchors that only lined up because the
      // digits were gone stop matching. There are no stored regex rules to
      // break (POPS-2621), and this is the behaviour the anchors describe.
      expect(
        patternMatchesDescription(
          '^WOOLWORTHS SYDNEY$',
          'regex',
          describeForMatching('Woolworths 1234 Sydney')
        )
      ).toBe(false);
    });

    it('keeps the `i` flag, so a lowercase literal reaches an uppercase descriptor', () => {
      expect(
        patternMatchesDescription('coffee', 'regex', describeForMatching('THE COFFEE SHOP'))
      ).toBe(true);
    });

    it('does not fold diacritics — literal means literal', () => {
      const cafe = describeForMatching('CAFÉ MOZART');
      expect(patternMatchesDescription('CAFE', 'regex', cafe)).toBe(false);
      expect(patternMatchesDescription('CAF[EÉ]', 'regex', cafe)).toBe(true);
      // `contains` still folds, because its pattern folds on both sides.
      expect(patternMatchesDescription('Cafe', 'contains', cafe)).toBe(true);
    });

    it('returns false rather than throwing for an uncompilable pattern', () => {
      expect(
        patternMatchesDescription('[unclosed', 'regex', describeForMatching('UNCLOSED BRACKET'))
      ).toBe(false);
    });

    it('rejects an empty pattern so a blank rule cannot match everything', () => {
      expect(patternMatchesDescription('', 'regex', describeForMatching('ANYTHING'))).toBe(false);
    });
  });

  describe('exact and contains are tested against the normalised description', () => {
    it('folds digits on both sides, so one pattern covers every store number', () => {
      expect(
        patternMatchesDescription(
          'WOOLWORTHS',
          'contains',
          describeForMatching('WOOLWORTHS 1034 CANTERB')
        )
      ).toBe(true);
      expect(
        patternMatchesDescription(
          'WOOLWORTHS 9999',
          'contains',
          describeForMatching('WOOLWORTHS 2201 NEWTOWN')
        )
      ).toBe(true);
    });

    it('is case- and diacritic-insensitive', () => {
      expect(
        patternMatchesDescription('cafe', 'contains', describeForMatching('CAFÉ MOZART'))
      ).toBe(true);
    });

    it('anchors `exact` to the whole normalised description', () => {
      expect(patternMatchesDescription('NETFLIX', 'exact', describeForMatching('NETFLIX 42'))).toBe(
        true
      );
      expect(
        patternMatchesDescription('NETFLIX', 'exact', describeForMatching('NETFLIX AUSTRALIA'))
      ).toBe(false);
    });

    it('rejects a pattern that normalises to nothing', () => {
      expect(patternMatchesDescription('1234', 'contains', describeForMatching('CARD 1234'))).toBe(
        false
      );
    });
  });

  it('describeForMatching pairs the description with its own normalisation', () => {
    const description = describeForMatching('Woolworths 1234 Sydney');
    expect(description.raw).toBe('Woolworths 1234 Sydney');
    expect(description.normalized).toBe(normalizeDescription('Woolworths 1234 Sydney'));
    expect(description.normalized).toBe('WOOLWORTHS SYDNEY');
  });
});
