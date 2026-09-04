import { describe, expect, it } from 'vitest';

import { resolveAccountOption } from './resolveAccountOption';

import type { AccountOption } from '@pops/ui';

const EVERYDAY: AccountOption = { id: 'a1', name: 'Up Everyday', kind: 'checking' };
const AMEX: AccountOption = { id: 'a2', name: 'Amex', kind: 'credit-card' };

describe('resolveAccountOption', () => {
  it('returns undefined when the accounts list has not loaded yet', () => {
    expect(resolveAccountOption(undefined, 'a1')).toBeUndefined();
  });

  it('matches by id', () => {
    expect(resolveAccountOption([EVERYDAY, AMEX], 'a2')).toBe(AMEX);
  });

  it('falls back to a case-insensitive name match when no id matches', () => {
    expect(resolveAccountOption([EVERYDAY, AMEX], 'amex')).toBe(AMEX);
  });

  it('prefers an id match over a name match', () => {
    const nameCollidesWithOtherId: AccountOption = { id: 'a2', name: 'a1', kind: 'cash' };
    expect(resolveAccountOption([EVERYDAY, nameCollidesWithOtherId], 'a1')).toBe(EVERYDAY);
  });

  it('returns undefined when nothing matches by id or name', () => {
    expect(resolveAccountOption([EVERYDAY, AMEX], 'Brand New Bank')).toBeUndefined();
  });
});
