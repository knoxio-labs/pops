import { describe, expect, it } from 'vitest';

import { getCurrentMonthRange } from './dateRange';

describe('getCurrentMonthRange', () => {
  it('returns the first and last day of a 31-day month', () => {
    const range = getCurrentMonthRange(new Date(2026, 0, 15));
    expect(range).toEqual({ startDate: '2026-01-01', endDate: '2026-01-31' });
  });

  it('returns the first and last day of a 30-day month', () => {
    const range = getCurrentMonthRange(new Date(2026, 3, 1));
    expect(range).toEqual({ startDate: '2026-04-01', endDate: '2026-04-30' });
  });

  it('handles February in a leap year', () => {
    const range = getCurrentMonthRange(new Date(2028, 1, 10));
    expect(range).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
  });

  it('handles February in a non-leap year', () => {
    const range = getCurrentMonthRange(new Date(2026, 1, 10));
    expect(range).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
  });

  it('handles December correctly (year rollover for the next-month computation)', () => {
    const range = getCurrentMonthRange(new Date(2026, 11, 25));
    expect(range).toEqual({ startDate: '2026-12-01', endDate: '2026-12-31' });
  });
});
