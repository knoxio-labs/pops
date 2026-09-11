import { describe, expect, it } from 'vitest';

import { previewOverrides } from '../rotation-scheduler-handlers.js';

describe('previewOverrides', () => {
  it('omits a knob entirely from `tuning` when the query never sent it, rather than setting it to `undefined`', () => {
    const overrides = previewOverrides({ ageExponent: 2 });
    expect(overrides.tuning).toEqual({ ageExponent: 2 });
    expect('ratingSpread' in (overrides.tuning ?? {})).toBe(false);
    expect('keepUnwatched' in (overrides.tuning ?? {})).toBe(false);
    expect('keepExponent' in (overrides.tuning ?? {})).toBe(false);
  });

  it('returns an empty `tuning` object, not one full of `undefined` keys, when no knob was sent', () => {
    const overrides = previewOverrides({});
    expect(overrides.tuning).toEqual({});
    expect(Object.keys(overrides.tuning ?? {})).toEqual([]);
  });

  it('carries every sent knob through to `tuning`', () => {
    const overrides = previewOverrides({
      ageExponent: 1,
      ratingSpread: 2,
      keepUnwatched: 3,
      keepExponent: 4,
    });
    expect(overrides.tuning).toEqual({
      ageExponent: 1,
      ratingSpread: 2,
      keepUnwatched: 3,
      keepExponent: 4,
    });
  });

  it('carries `graceDays` and `topCount` alongside `tuning`, not folded into it', () => {
    const overrides = previewOverrides({ graceDays: 10, topCount: 5 });
    expect(overrides.graceDays).toBe(10);
    expect(overrides.topCount).toBe(5);
    expect(overrides.tuning).toEqual({});
  });
});
