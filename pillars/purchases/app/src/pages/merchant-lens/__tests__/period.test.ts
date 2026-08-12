import { describe, expect, it } from 'vitest';

import { ALL_TIME, parsePeriodSelection, periodRange, periodYears } from '../period';

/**
 * Every spelling of an instant the pillar's `IsoTimestampSchema` admits with a
 * `Z` suffix — no fraction through the full nine digits.
 */
function zSpellings(secondsPrecise: string): string[] {
  const base = secondsPrecise.replace(/Z$/u, '');
  return [
    `${base}Z`,
    `${base}.0Z`,
    `${base}.5Z`,
    `${base}.000Z`,
    `${base}.999Z`,
    `${base}.000000000Z`,
    `${base}.999999999Z`,
  ];
}

describe('periodRange', () => {
  it('sends no window for all time, so nothing is scoped away', () => {
    expect(periodRange(ALL_TIME)).toEqual({});
  });

  // The pillar filters with `gte`/`lte` on a TEXT column, so these bounds are
  // compared lexicographically against whatever spelling ingest happened to
  // store. Every assertion below is a string comparison for that reason — an
  // instant comparison would pass while the query dropped rows.
  describe('the lower bound', () => {
    it('sorts at or below every spelling of the year’s first instant', () => {
      const { from } = periodRange('2026');
      expect(from).toBeDefined();

      for (const stored of zSpellings('2026-01-01T00:00:00Z')) {
        expect(stored >= (from ?? '')).toBe(true);
      }
    });

    // The case Copilot caught on this PR, pinned: receipt ingest writes
    // millisecond timestamps, and `…00.000Z` sorts BELOW a bare `…00Z`,
    // because `.` is below `Z`. A bare lower bound silently drops a
    // New Year's-midnight order.
    it('does not drop a midnight order stored with milliseconds', () => {
      const { from } = periodRange('2026');
      expect('2026-01-01T00:00:00.000Z' >= (from ?? '')).toBe(true);
    });

    it('still sorts above everything in the preceding year', () => {
      const { from } = periodRange('2026');
      for (const stored of zSpellings('2025-12-31T23:59:59Z')) {
        expect(stored < (from ?? '')).toBe(true);
      }
    });
  });

  describe('the upper bound', () => {
    it('sorts at or above every spelling of the year’s final second', () => {
      const { to } = periodRange('2026');
      expect(to).toBeDefined();

      for (const stored of zSpellings('2026-12-31T23:59:59Z')) {
        expect(stored <= (to ?? '')).toBe(true);
      }
    });

    // The mirror image, and the reason the two ends are spelled differently:
    // a `.999999999Z` upper bound would sort BELOW a bare `…59Z` and drop it.
    it('does not drop a New Year’s-Eve order stored without a fraction', () => {
      const { to } = periodRange('2026');
      expect('2026-12-31T23:59:59Z' <= (to ?? '')).toBe(true);
    });

    it('cannot reach into the following year', () => {
      const { to } = periodRange('2026');
      for (const stored of zSpellings('2027-01-01T00:00:00Z')) {
        expect(stored > (to ?? '')).toBe(true);
      }
    });
  });
});

describe('periodYears', () => {
  it('offers the current UTC year first, newest to oldest', () => {
    expect(periodYears(new Date('2026-08-12T00:00:00Z'))).toEqual([
      '2026',
      '2025',
      '2024',
      '2023',
      '2022',
    ]);
  });

  // Read in UTC, not local time, so the offered years match the bounds
  // `periodRange` builds — which are UTC.
  it('reads the year in UTC rather than local time', () => {
    expect(periodYears(new Date('2026-12-31T23:30:00Z'))[0]).toBe('2026');
    expect(periodYears(new Date('2027-01-01T00:30:00Z'))[0]).toBe('2027');
  });
});

describe('parsePeriodSelection', () => {
  it('keeps a selection it recognises', () => {
    expect(parsePeriodSelection(ALL_TIME)).toBe(ALL_TIME);
    expect(parsePeriodSelection('2026')).toBe('2026');
  });

  // Falling back to all time shows more than was asked for. Falling back to a
  // year would silently scope spend away, which is the failure this view is
  // built against — so the direction of the default is the assertion here.
  it.each(['', '20261', '202', 'twenty-twenty-six', '2026-01', ' 2026'])(
    'falls back to all time rather than to a narrower window for %o',
    (value) => {
      expect(parsePeriodSelection(value)).toBe(ALL_TIME);
      expect(periodRange(parsePeriodSelection(value))).toEqual({});
    }
  );
});
