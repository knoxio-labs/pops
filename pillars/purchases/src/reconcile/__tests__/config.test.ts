import { describe, expect, it } from 'vitest';

import { optionalIntervalMs, resolveSweepIntervals } from '../config.js';

describe('optionalIntervalMs', () => {
  it('returns undefined when unset, so the module default applies', () => {
    expect(optionalIntervalMs('X', {})).toBeUndefined();
    expect(optionalIntervalMs('X', { X: '' })).toBeUndefined();
    expect(optionalIntervalMs('X', { X: '   ' })).toBeUndefined();
  });

  it('reads a positive interval', () => {
    expect(optionalIntervalMs('X', { X: '2000' })).toBe(2000);
  });

  it('throws on a malformed value rather than falling back', () => {
    // Falling back would look exactly like the setting having worked, and
    // the operator would be running a cadence they did not choose.
    expect(() => optionalIntervalMs('X', { X: '30s' })).toThrow(/positive number/u);
    expect(() => optionalIntervalMs('X', { X: '0' })).toThrow(/positive number/u);
    expect(() => optionalIntervalMs('X', { X: '-1' })).toThrow(/positive number/u);
    expect(() => optionalIntervalMs('X', { X: 'Infinity' })).toThrow(/positive number/u);
  });

  it('names the offending variable in the message', () => {
    expect(() =>
      optionalIntervalMs('PURCHASES_SWEEP_POLL_MS', { PURCHASES_SWEEP_POLL_MS: 'nope' })
    ).toThrow(/PURCHASES_SWEEP_POLL_MS/u);
  });
});

describe('resolveSweepIntervals', () => {
  it('omits absent keys entirely, rather than setting them undefined', () => {
    // The runner uses `?? DEFAULT`, so an explicit undefined would work
    // too — but an empty object states the intent: nothing was configured.
    expect(resolveSweepIntervals({})).toEqual({});
  });

  it('reads both cadences', () => {
    expect(
      resolveSweepIntervals({
        PURCHASES_SWEEP_COALESCE_MS: '500',
        PURCHASES_SWEEP_POLL_MS: '1000',
      })
    ).toEqual({ coalesceMs: 500, pollMs: 1000 });
  });

  it('reads one without requiring the other', () => {
    expect(resolveSweepIntervals({ PURCHASES_SWEEP_POLL_MS: '1000' })).toEqual({ pollMs: 1000 });
  });
});
