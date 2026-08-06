import { describe, expect, it } from 'vitest';

import { calendarDateOf, isWithinWindow, settlementWindowFor, unionOfWindows } from '../window.js';

describe('calendarDateOf', () => {
  it('takes the UTC date of an instant', () => {
    expect(calendarDateOf('2026-03-04T01:02:03Z')).toBe('2026-03-04');
  });

  it('does not shift the date by the host timezone', () => {
    // Late-UTC-evening instants are the ones a local-time truncation gets
    // wrong, and a container's timezone is not a property of the purchase.
    expect(calendarDateOf('2026-03-04T23:59:59Z')).toBe('2026-03-04');
    expect(calendarDateOf('2026-03-04T00:00:00Z')).toBe('2026-03-04');
  });

  it('returns null for an unparseable value rather than the epoch', () => {
    expect(calendarDateOf('nonsense')).toBeNull();
  });
});

describe('settlementWindowFor', () => {
  it('spans the given days either side of the order date, inclusive', () => {
    expect(settlementWindowFor('2026-03-04T12:00:00Z', 21)).toEqual({
      startDate: '2026-02-11',
      endDate: '2026-03-25',
    });
  });

  it('is symmetric, because a pre-authorisation lands before the order', () => {
    const window = settlementWindowFor('2026-03-15T00:00:00Z', 5);
    expect(window).toEqual({ startDate: '2026-03-10', endDate: '2026-03-20' });
  });

  it('crosses a month and a year boundary correctly', () => {
    expect(settlementWindowFor('2026-01-05T00:00:00Z', 10)).toEqual({
      startDate: '2025-12-26',
      endDate: '2026-01-15',
    });
  });

  it('handles a leap day', () => {
    expect(settlementWindowFor('2028-03-05T00:00:00Z', 5)).toEqual({
      startDate: '2028-02-29',
      endDate: '2028-03-10',
    });
  });

  it('collapses to the single day for a zero window', () => {
    expect(settlementWindowFor('2026-03-04T00:00:00Z', 0)).toEqual({
      startDate: '2026-03-04',
      endDate: '2026-03-04',
    });
  });

  it('does not throw on a non-finite window, which would abort a whole sweep', () => {
    // NaN reaches toISOString() as an invalid date and raises a RangeError,
    // so one bad source row would take down the sweep rather than one order.
    expect(settlementWindowFor('2026-03-04T00:00:00Z', Number.NaN)).toEqual({
      startDate: '2026-03-04',
      endDate: '2026-03-04',
    });
    expect(settlementWindowFor('2026-03-04T00:00:00Z', Number.POSITIVE_INFINITY)).toEqual({
      startDate: '2026-03-04',
      endDate: '2026-03-04',
    });
  });

  it('truncates a fractional day rather than shifting the boundary', () => {
    expect(settlementWindowFor('2026-03-04T00:00:00Z', 2.9)).toEqual(
      settlementWindowFor('2026-03-04T00:00:00Z', 2)
    );
  });

  it('treats a negative window as zero', () => {
    expect(settlementWindowFor('2026-03-04T00:00:00Z', -5)).toEqual({
      startDate: '2026-03-04',
      endDate: '2026-03-04',
    });
  });

  it('returns null for an unparseable order date', () => {
    expect(settlementWindowFor('not-a-date', 21)).toBeNull();
  });
});

describe('isWithinWindow', () => {
  const window = { startDate: '2026-03-01', endDate: '2026-03-31' };

  it('includes both boundary days', () => {
    // Exclusive bounds silently drop a whole day of candidates at each end.
    expect(isWithinWindow('2026-03-01', window)).toBe(true);
    expect(isWithinWindow('2026-03-31', window)).toBe(true);
  });

  it('excludes the days just outside', () => {
    expect(isWithinWindow('2026-02-28', window)).toBe(false);
    expect(isWithinWindow('2026-04-01', window)).toBe(false);
  });

  it('rejects a timestamp rather than coercing it', () => {
    // '2026-03-31T00:00:00Z' sorts AFTER '2026-03-31', so coercing by
    // string comparison would drop a transaction on the window's last day.
    expect(isWithinWindow('2026-03-15T00:00:00Z', window)).toBe(false);
    expect(isWithinWindow('', window)).toBe(false);
  });
});

describe('unionOfWindows', () => {
  it('spans the outermost bounds of a batch', () => {
    expect(
      unionOfWindows([
        { startDate: '2026-03-01', endDate: '2026-03-10' },
        { startDate: '2026-02-20', endDate: '2026-03-05' },
        { startDate: '2026-03-08', endDate: '2026-03-20' },
      ])
    ).toEqual({ startDate: '2026-02-20', endDate: '2026-03-20' });
  });

  it('returns null for an empty batch, so nothing is asked of finance', () => {
    expect(unionOfWindows([])).toBeNull();
  });

  it('returns the single window unchanged', () => {
    const only = { startDate: '2026-03-01', endDate: '2026-03-10' };
    expect(unionOfWindows([only])).toEqual(only);
  });
});
