/**
 * Unit tests for `normalizeDescription` (CF056/CP022): diacritic folding and
 * broadened punctuation stripping, plus a lockstep check against the
 * db-side copy in `db/services/transaction-corrections-types.ts` — the two
 * are intentionally duplicated (one is browser-bundlable, the other is
 * server-only) but must never diverge in behaviour.
 */
import { describe, expect, it } from 'vitest';

import { normalizeDescription as dbNormalizeDescription } from '../../db/services/transaction-corrections-types.js';
import { normalizeDescription } from '../corrections-pure.js';

describe('normalizeDescription', () => {
  it('uppercases, strips digits, collapses whitespace, and trims', () => {
    expect(normalizeDescription('  starbucks   42  store 7 ')).toBe('STARBUCKS STORE');
  });

  it('folds diacritics so an accented merchant matches its plain-ASCII spelling', () => {
    expect(normalizeDescription('Café Nero')).toBe('CAFE NERO');
    expect(normalizeDescription('Ünder Armour')).toBe('UNDER ARMOUR');
  });

  it('treats a hyphen as a space and strips ampersands/periods', () => {
    expect(normalizeDescription('WW-METRO')).toBe('WW METRO');
    expect(normalizeDescription('M&S FOOD')).toBe('MS FOOD');
    expect(normalizeDescription('J.CREW')).toBe('JCREW');
  });

  it('is idempotent — passing a normalised value through is a no-op', () => {
    const once = normalizeDescription('Café Nero 12');
    expect(normalizeDescription(once)).toBe(once);
  });
});

describe('normalizeDescription — lockstep with the db-side normaliser (CP022)', () => {
  const cases = [
    'Café Nero',
    'WW-METRO',
    'M&S FOOD',
    'J.CREW',
    '  starbucks   42  store 7 ',
    'Ünder Armour',
    'GOOGLE*YOUTUBE',
  ];

  it.each(cases)('normalizes %s identically in both copies', (input) => {
    expect(normalizeDescription(input)).toBe(dbNormalizeDescription(input));
  });
});
