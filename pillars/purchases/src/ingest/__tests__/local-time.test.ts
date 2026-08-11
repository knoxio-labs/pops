import { afterEach, describe, expect, it } from 'vitest';

import { instantFromLocalParts, isKnownTimeZone, storeTimeZone } from '../local-time.js';

const ZONE_VAR = 'PURCHASES_TIME_ZONE';

afterEach(() => {
  delete process.env[ZONE_VAR];
});

describe('storeTimeZone', () => {
  it('defaults to Australia/Sydney when unset', () => {
    expect(storeTimeZone()).toBe('Australia/Sydney');
  });

  it('defaults to Australia/Sydney when set to the empty string', () => {
    process.env[ZONE_VAR] = '';
    expect(storeTimeZone()).toBe('Australia/Sydney');
  });

  it('honours an override', () => {
    process.env[ZONE_VAR] = 'America/Chicago';
    expect(storeTimeZone()).toBe('America/Chicago');
  });
});

describe('isKnownTimeZone', () => {
  it('accepts a real IANA zone', () => {
    expect(isKnownTimeZone('Australia/Sydney')).toBe(true);
  });

  it('accepts an alias that links to a real zone', () => {
    expect(isKnownTimeZone('Australia/Canberra')).toBe(true);
  });

  it('rejects null, undefined and the empty string without asking the runtime', () => {
    expect(isKnownTimeZone(null)).toBe(false);
    expect(isKnownTimeZone(undefined)).toBe(false);
    expect(isKnownTimeZone('')).toBe(false);
  });

  it('rejects an invented zone', () => {
    expect(isKnownTimeZone('Nowhere/Imaginary')).toBe(false);
  });
});

describe('instantFromLocalParts', () => {
  it('resolves a Sydney reading to its UTC instant (east of Greenwich)', () => {
    const instant = instantFromLocalParts(
      { year: 2026, month: 8, day: 1, hour: 14, minute: 32 },
      'Australia/Sydney'
    );
    expect(instant).toBe('2026-08-01T04:32:00.000Z');
  });

  it('resolves a New York reading to its UTC instant (west of Greenwich)', () => {
    const instant = instantFromLocalParts(
      { year: 2026, month: 8, day: 1, hour: 9, minute: 0 },
      'America/New_York'
    );
    expect(instant).toBe('2026-08-01T13:00:00.000Z');
  });

  it('resolves a UTC reading unchanged (the "GMT" longOffset name)', () => {
    const instant = instantFromLocalParts(
      { year: 2026, month: 8, day: 1, hour: 9, minute: 0 },
      'UTC'
    );
    expect(instant).toBe('2026-08-01T09:00:00.000Z');
  });

  it('rejects a receipt hour that does not round-trip (25:00)', () => {
    expect(instantFromLocalParts({ year: 2026, month: 8, day: 1, hour: 25, minute: 0 })).toBeNull();
  });

  it('rejects a receipt date that does not round-trip (31 February)', () => {
    expect(instantFromLocalParts({ year: 2026, month: 2, day: 31, hour: 9, minute: 0 })).toBeNull();
  });

  it('uses storeTimeZone() when no zone is given', () => {
    process.env[ZONE_VAR] = 'UTC';
    const instant = instantFromLocalParts({ year: 2026, month: 8, day: 1, hour: 9, minute: 0 });
    expect(instant).toBe('2026-08-01T09:00:00.000Z');
  });

  it('crosses a DST boundary correctly (Sydney AEST → AEDT, 6 Oct 2026)', () => {
    // 2:30am local does not exist on the day clocks spring forward — the
    // wall-clock reading only makes sense under one of the two offsets, and
    // this is exactly the correction the two-pass derivation exists for.
    const before = instantFromLocalParts(
      { year: 2026, month: 10, day: 3, hour: 9, minute: 0 },
      'Australia/Sydney'
    );
    const after = instantFromLocalParts(
      { year: 2026, month: 10, day: 10, hour: 9, minute: 0 },
      'Australia/Sydney'
    );
    expect(before).toBe('2026-10-02T23:00:00.000Z');
    expect(after).toBe('2026-10-09T22:00:00.000Z');
  });
});
