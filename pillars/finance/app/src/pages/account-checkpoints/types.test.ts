import { describe, expect, it } from 'vitest';

import { isInconsistent } from './types';

describe('isInconsistent', () => {
  it('is false when deltaCents is null — the earliest checkpoint has nothing to compare against', () => {
    expect(isInconsistent({ deltaCents: null })).toBe(false);
  });

  it('is false for an exact-agreement checkpoint (delta zero, not absent)', () => {
    expect(isInconsistent({ deltaCents: 0 })).toBe(false);
  });

  it('is true for a positive delta', () => {
    expect(isInconsistent({ deltaCents: 480 })).toBe(true);
  });

  it('is true for a negative delta', () => {
    expect(isInconsistent({ deltaCents: -480 })).toBe(true);
  });
});
