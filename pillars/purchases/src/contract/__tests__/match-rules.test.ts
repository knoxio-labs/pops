/**
 * The descriptor normaliser a match rule is keyed on.
 *
 * Worth its own file because both halves of the rule table depend on this
 * one function agreeing with itself: a writer and a reader that normalise
 * differently build a table whose rows can never match, and the failure is
 * silent — every lookup simply misses.
 */
import { describe, expect, it } from 'vitest';

import { matchPatternFor, normalizeMatchDescriptor } from '../match-rules.js';

describe('normalizeMatchDescriptor', () => {
  it('collapses a merchant descriptor to the merchant', () => {
    // The two are the same shop with different store numbers, and a rule
    // that could not see that would be learned once per checkout lane.
    expect(normalizeMatchDescriptor('WOOLWORTHS 1234 SYDNEY')).toBe(
      normalizeMatchDescriptor('WOOLWORTHS 5567 SYDNEY')
    );
    expect(normalizeMatchDescriptor('WOOLWORTHS 1234 SYDNEY')).toBe('WOOLWORTHS SYDNEY');
  });

  it('is case-insensitive and whitespace-insensitive', () => {
    expect(normalizeMatchDescriptor('  amazon   mktplace au ')).toBe('AMAZON MKTPLACE AU');
  });

  it('folds diacritics, hyphens, ampersands and periods', () => {
    expect(normalizeMatchDescriptor('Café-Süd & Co.')).toBe('CAFE SUD CO');
  });

  it('keeps merchants that differ in more than their reference apart', () => {
    expect(normalizeMatchDescriptor('AMAZON AU')).not.toBe(normalizeMatchDescriptor('AMAZON US'));
  });
});

describe('matchPatternFor', () => {
  it('has nothing to key on when the descriptor is only digits', () => {
    // A card-present terminal that emits a bare reference gives a rule no
    // merchant to be about, and an empty pattern would match by accident.
    expect(matchPatternFor('4471 0092')).toBeNull();
  });

  it('has nothing to key on when there is no descriptor at all', () => {
    expect(matchPatternFor(null)).toBeNull();
    expect(matchPatternFor('   ')).toBeNull();
  });

  it('returns the normalised form for a real descriptor', () => {
    expect(matchPatternFor('Amazon Mktplace AU 4128')).toBe('AMAZON MKTPLACE AU');
  });
});
