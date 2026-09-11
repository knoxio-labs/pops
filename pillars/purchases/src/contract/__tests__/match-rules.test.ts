/**
 * The descriptor normaliser a match rule is keyed on.
 *
 * Worth its own file because both halves of the rule table depend on this
 * one function agreeing with itself: a writer and a reader that normalise
 * differently build a table whose rows can never match, and the failure is
 * silent — every lookup simply misses.
 */
import { describe, expect, it } from 'vitest';

import {
  compileMatchRulePattern,
  describeForMatching,
  matchPatternFor,
  normalizeMatchDescriptor,
} from '../match-rules.js';

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

describe('compileMatchRulePattern', () => {
  const matches = (
    pattern: string,
    matchType: 'exact' | 'contains' | 'regex',
    descriptor: string
  ) => compileMatchRulePattern(pattern, matchType)(describeForMatching(descriptor));

  it('takes an exact pattern as the whole merchant', () => {
    expect(matches('AMAZON MKTPLACE AU', 'exact', 'Amazon Mktplace AU 4128')).toBe(true);
    expect(matches('AMAZON MKTPLACE', 'exact', 'Amazon Mktplace AU 4128')).toBe(false);
  });

  it('takes a contains pattern as any part of it', () => {
    expect(matches('AMAZON MKTPLACE', 'contains', 'Amazon Mktplace AU 4128')).toBe(true);
    expect(matches('WOOLWORTHS', 'contains', 'Amazon Mktplace AU 4128')).toBe(false);
  });

  it('honours a regex pattern finance would honour', () => {
    // An identity escape is legal in a non-unicode regex and a SyntaxError
    // in a unicode one. Compiling with `u` here would turn a pattern the
    // finance rule table accepts into a silent no-match on this side, and
    // the failure is invisible: the rule looks stored and does nothing.
    expect(matches('AMAZON\\ MKTPLACE.*', 'regex', 'Amazon Mktplace AU 4128')).toBe(true);
    expect(matches('^woolworths', 'regex', 'Amazon Mktplace AU 4128')).toBe(false);
  });

  it('tests a regex against the raw descriptor, so a digit run is visible (POPS-2651)', () => {
    // normalizeMatchDescriptor strips digits, so a pattern anchored on the
    // store number could never see one if it were tested against the
    // normalised form — exactly the gap finance closed for the same reason
    // under POPS-2640. Mirrors that fix's own example.
    expect(matches('^WOOLWORTHS \\d{4} SYDNEY$', 'regex', 'Woolworths 1234 Sydney')).toBe(true);
    // A pattern that only held against the digit-stripped form must now miss.
    expect(matches('^WOOLWORTHS SYDNEY$', 'regex', 'Woolworths 1234 Sydney')).toBe(false);
  });

  it('matches nothing for a pattern that cannot be compiled', () => {
    // A sweep is a batch over every charge in a window. One malformed row
    // must cost that row's matches, never the night's reconciliation.
    expect(matches('AMAZON (', 'regex', 'Amazon Mktplace AU 4128')).toBe(false);
  });

  it('matches nothing for an empty pattern, whatever the match type', () => {
    // Digits alone normalise to empty, so an `exact` empty pattern would
    // auto-link every bare-reference descriptor in the window. Finance's
    // `exact` allows it; this side deliberately does not.
    for (const matchType of ['exact', 'contains', 'regex'] as const) {
      expect(matches('', matchType, '4471 0092')).toBe(false);
    }
  });

  it('still tests exact and contains against the normalised form, unchanged by POPS-2651', () => {
    // Digits still must not distinguish two rows of the same shop for the
    // predicate kinds finance did not move.
    expect(matches('WOOLWORTHS SYDNEY', 'exact', 'Woolworths 1234 Sydney')).toBe(true);
    expect(matches('WOOLWORTHS', 'contains', 'Woolworths 1234 Sydney')).toBe(true);
  });
});

describe('parity with finance (POPS-2651)', () => {
  // `patternMatchesDescription` is not importable here — purchases has no
  // `@pops/finance` dependency, and ADR-042 is explicit that the matcher is
  // reproduced across the seam rather than imported. These triples are
  // pinned identically in
  // `pillars/finance/src/api/modules/__tests__/pattern-match-parity.test.ts`,
  // so a change to either side that breaks the mirror shows up as a failure
  // on both.
  const financeParity = (
    pattern: string,
    matchType: 'exact' | 'contains' | 'regex',
    descriptor: string
  ) => compileMatchRulePattern(pattern, matchType)(describeForMatching(descriptor));

  it('regex, anchored across a digit run', () => {
    expect(financeParity('^WOOLWORTHS \\d{4} SYDNEY$', 'regex', 'Woolworths 1234 Sydney')).toBe(
      true
    );
  });

  it('regex, anchor that only held against the normalised form', () => {
    expect(financeParity('^WOOLWORTHS SYDNEY$', 'regex', 'Woolworths 1234 Sydney')).toBe(false);
  });

  it('regex, diacritic not folded', () => {
    expect(financeParity('CAFE', 'regex', 'CAFÉ MOZART')).toBe(false);
  });

  it('contains, digit-bearing descriptor', () => {
    expect(financeParity('Woolworths', 'contains', 'Woolworths 1234 Sydney')).toBe(true);
  });
});
