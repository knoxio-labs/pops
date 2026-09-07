import { describe, expect, it } from 'vitest';

import { ALL_TIME, parsePeriodSelection, periodToSpendPeriod, periodYears } from './period';

describe('parsePeriodSelection', () => {
  it('accepts all time', () => {
    expect(parsePeriodSelection('all')).toBe('all');
  });

  it('accepts a four-digit year', () => {
    expect(parsePeriodSelection('2024')).toBe('2024');
  });

  it('falls back to all time for anything unrecognised, rather than scoping spend away', () => {
    expect(parsePeriodSelection('')).toBe(ALL_TIME);
    expect(parsePeriodSelection('bogus')).toBe(ALL_TIME);
    expect(parsePeriodSelection('24')).toBe(ALL_TIME);
    expect(parsePeriodSelection('20245')).toBe(ALL_TIME);
    expect(parsePeriodSelection('-2024')).toBe(ALL_TIME);
  });
});

describe('periodYears', () => {
  it('offers five years, newest first, ending at the current year', () => {
    const now = new Date(Date.UTC(2026, 5, 1));
    expect(periodYears(now)).toEqual(['2026', '2025', '2024', '2023', '2022']);
  });
});

describe('periodToSpendPeriod', () => {
  it('covers everything for all time', () => {
    expect(periodToSpendPeriod(ALL_TIME)).toEqual({ from: null, to: null });
  });

  it('bounds a year from its first instant to its last', () => {
    expect(periodToSpendPeriod('2026')).toEqual({
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
    });
  });
});
