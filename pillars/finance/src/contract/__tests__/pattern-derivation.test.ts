import { describe, expect, it } from 'vitest';

import {
  derivePatternFromDescriptions,
  longestCommonSubstring,
  MIN_DERIVED_PATTERN_LENGTH,
} from '../pattern-derivation.js';
import { describeForMatching, patternMatchesDescription } from '../pattern-match.js';

describe('longestCommonSubstring', () => {
  it('returns the longest run every value contains', () => {
    expect(longestCommonSubstring(['WOOLWORTHS METRO', 'WOOLWORTHS ONLINE'])).toBe('WOOLWORTHS ');
  });

  it('finds a shared run that is not a prefix of either value', () => {
    expect(longestCommonSubstring(['SQ *MCLUU DARLINGHURST', 'MCLUU DARLINGHURST NSW'])).toBe(
      'MCLUU DARLINGHURST'
    );
  });

  it('returns the whole value when given one', () => {
    expect(longestCommonSubstring(['NETFLIX COM'])).toBe('NETFLIX COM');
  });

  it('returns an empty string for no values', () => {
    expect(longestCommonSubstring([])).toBe('');
  });

  it('returns an empty string when the values share no character', () => {
    expect(longestCommonSubstring(['ABC', 'XYZ'])).toBe('');
  });
});

describe('derivePatternFromDescriptions', () => {
  it('derives the shared descriptor, trimmed', () => {
    expect(derivePatternFromDescriptions(['WOOLWORTHS METRO', 'WOOLWORTHS ONLINE'])).toBe(
      'WOOLWORTHS'
    );
  });

  it('normalises before comparing, so case and punctuation do not split a merchant', () => {
    expect(derivePatternFromDescriptions(['Woolworths Metro', 'WOOLWORTHS. ONLINE'])).toBe(
      'WOOLWORTHS'
    );
  });

  it('folds diacritics before comparing', () => {
    expect(derivePatternFromDescriptions(['CAFÉ NERO CBD', 'CAFE NERO PITT ST'])).toBe('CAFE NERO');
  });

  it('keeps digits, which normalisation preserves', () => {
    expect(
      derivePatternFromDescriptions(['7-ELEVEN 2041 SYDNEY', '7-ELEVEN 2041 PARRAMATTA'])
    ).toBe('7 ELEVEN 2041');
  });

  it('returns the whole normalised descriptor for a single description', () => {
    expect(derivePatternFromDescriptions(['NETFLIX.COM'])).toBe('NETFLIXCOM');
  });

  it('keeps a pattern exactly the minimum length', () => {
    const pattern = derivePatternFromDescriptions(['XBARS ONE', 'YBARS TWO']);
    expect(pattern).toBe('BARS');
    expect(pattern).toHaveLength(MIN_DERIVED_PATTERN_LENGTH);
  });

  it('measures the minimum after trimming, so a shared trailing space does not count', () => {
    expect(derivePatternFromDescriptions(['XBAR ONE', 'YBAR TWO'])).toBeNull();
  });

  it('returns null when the descriptions share nothing specific', () => {
    expect(derivePatternFromDescriptions(['SQ *MCLUU DARLINGHURST', 'SAUNA X PTY LTD'])).toBeNull();
  });

  it('returns null for no descriptions', () => {
    expect(derivePatternFromDescriptions([])).toBeNull();
  });

  it('matches a descriptor the entity name would not, which is why it exists', () => {
    const descriptor = describeForMatching('MICROSOFT*STORE');
    expect(patternMatchesDescription('MICROSOFT STORE', 'contains', descriptor)).toBe(false);

    const pattern = derivePatternFromDescriptions(['MICROSOFT*STORE', 'MICROSOFT*STORE AU']);
    expect(pattern).toBe('MICROSOFT*STORE');
    expect(patternMatchesDescription(pattern ?? '', 'contains', descriptor)).toBe(true);
  });

  it('only ever returns a pattern that matches every description it came from', () => {
    const sets = [
      ['WOOLWORTHS METRO', 'WOOLWORTHS ONLINE'],
      ['SQ *MCLUU DARLINGHURST', 'MCLUU DARLINGHURST NSW', 'MCLUU DARLING'],
      ['CAFÉ NERO CBD', 'CAFE NERO PITT ST'],
      ['RATTLE N HUM BAR GRI', 'RATTLE N HUM BAR GRILL'],
    ];
    for (const descriptions of sets) {
      const pattern = derivePatternFromDescriptions(descriptions);
      expect(pattern).not.toBeNull();
      for (const description of descriptions) {
        expect(
          patternMatchesDescription(pattern ?? '', 'contains', describeForMatching(description))
        ).toBe(true);
      }
    }
  });
});

describe('derivePatternFromDescriptions refuses an over-reaching pattern (POPS-3665, POPS-3679)', () => {
  // A prod rule scoped to Amazon, pattern `A* AM`, was learned from
  // `AMZNPRIMEA* AMZNPRIMEA` and also matched `AMAZON RETA* AMAZON AU
  // SYDNEY` / `AMAZON RETA* AMAZON AU`, stamping fee:membership on retail
  // rows. Verified directly: the longest common substring of all three real
  // descriptors together is exactly `A* AM` — confirming the shape, even
  // though two natural Prime renewals alone do not shrink this far (their
  // shared `AMZNPRIME`/`PRIME` token survives). The second "Prime" row below
  // is a synthetic descriptor engineered to share nothing with the first
  // except that fragment, standing in for whatever real variation once
  // produced it.
  const primeRenewals = ['AMZNPRIMEA* AMZNPRIMEA', 'QQQQQQQQQA* AMWWWWWWWWW'];
  const retailSiblings = ['AMAZON RETA* AMAZON AU SYDNEY', 'AMAZON RETA* AMAZON AU'];

  it('refuses the Amazon Prime vs retail shape', () => {
    // Without the guard this derives to "A* AM", the exact prod pattern.
    expect(derivePatternFromDescriptions(primeRenewals, retailSiblings)).toBeNull();
  });

  it('refuses the Qantas Wine vs Qantas flight shape', () => {
    // QANTAS, learned from QANTAS WINE MASCOT, also matched QANTAS MASCOT.
    // Real suburb variation keeps `QANTAS WINE` intact (it doesn't match a
    // flight descriptor); this synthetic companion isolates the shorter
    // `QANTAS`-only fragment the guard must still catch.
    const qantasWine = ['QANTAS WINE MASCOT', 'QANTAS ZZZZZZZZZZZZ'];
    const qantasFlight = ['QANTAS MASCOT'];
    expect(derivePatternFromDescriptions(qantasWine, qantasFlight)).toBeNull();
  });

  it('does not refuse a group whose pattern stays inside its own siblings', () => {
    expect(
      derivePatternFromDescriptions(
        ['WOOLWORTHS 1234 SYDNEY', 'WOOLWORTHS 5678 NEWTOWN'],
        ['COLES 1234 SYDNEY']
      )
    ).toBe('WOOLWORTHS');
  });

  it('refuses a pattern that is a pure run of digits', () => {
    // A statement reference or store number recurs across unrelated
    // merchants (`2200`, `215`); the only thing these two descriptions share
    // is the digits between them.
    expect(derivePatternFromDescriptions(['A 2200 B', 'C 2200 D'])).toBeNull();
  });

  it('refuses a pattern whose non-digit content is below the length floor', () => {
    expect(derivePatternFromDescriptions(['XX 2200A YY', 'ZZ 2200A WW'])).toBeNull();
  });
});
