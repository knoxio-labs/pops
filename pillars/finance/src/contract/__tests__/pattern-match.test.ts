import { describe, expect, it } from 'vitest';

import {
  normalizeDescription,
  patternMatchesNormalizedDescription,
  regexPatternExpectsDigits,
} from '../pattern-match.js';

describe('regexPatternExpectsDigits', () => {
  const expectsDigits = [
    '\\d{4}',
    '\\d{4}-\\d{2}',
    'CARD 4471',
    '[0-9]{2}',
    '[A-F\\d]',
    'FEE\\s\\d',
    '^\\d',
  ];
  for (const pattern of expectsDigits) {
    it(`flags ${pattern}`, () => {
      expect(regexPatternExpectsDigits(pattern)).toBe(true);
    });
  }

  const digitFree = [
    '',
    'WOOLWORTHS',
    '^WOOLWORTHS SYDNEY$',
    'uber|lyft',
    'A{2,3}',
    'A{2,}B',
    '(?:FEE|CHARGE)+',
    '\\D+',
    '[^0-9]+',
    '[^\\d]',
    '\\x41',
    '\\u0041',
    '\\u{1F600}',
    '\\p{Lu}',
  ];
  for (const pattern of digitFree) {
    it(`does not flag ${pattern || '(empty)'}`, () => {
      expect(regexPatternExpectsDigits(pattern)).toBe(false);
    });
  }

  it('flags a digit outside a quantifier in a pattern that also has one', () => {
    expect(regexPatternExpectsDigits('A{2,3}9')).toBe(true);
  });

  it('flags a digit class after a class that has none', () => {
    expect(regexPatternExpectsDigits('[A-Z]+[0-9]')).toBe(true);
  });

  it('does not flag a literal `{` that is not a quantifier', () => {
    expect(regexPatternExpectsDigits('A{X}')).toBe(false);
  });

  it('reads `]` after `[` as JS does — an empty class, not a literal', () => {
    expect(regexPatternExpectsDigits('[]A]')).toBe(false);
    expect(regexPatternExpectsDigits('[]0]')).toBe(true);
  });

  it('terminates on an unclosed class', () => {
    expect(regexPatternExpectsDigits('[unclosed')).toBe(false);
    expect(regexPatternExpectsDigits('[unclosed9')).toBe(true);
  });

  it('agrees with the matcher: every flagged construct is dead against a digit-bearing description', () => {
    const normalized = normalizeDescription('CARD 4471 PURCHASE');
    expect(normalized).toBe('CARD PURCHASE');
    for (const pattern of ['\\d{4}', '[0-9]{2}', '4471']) {
      expect(regexPatternExpectsDigits(pattern)).toBe(true);
      expect(patternMatchesNormalizedDescription(pattern, 'regex', normalized)).toBe(false);
    }
  });

  it('is not consulted for exact/contains, whose digits are stripped on both sides', () => {
    const normalized = normalizeDescription('WOOLWORTHS 1234 SYDNEY');
    expect(patternMatchesNormalizedDescription('WOOLWORTHS 1234', 'contains', normalized)).toBe(
      true
    );
  });
});
