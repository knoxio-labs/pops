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
