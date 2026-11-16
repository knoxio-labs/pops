import { describe, expect, it } from 'vitest';

import { calendarDaysBetween } from './workspace-date';

describe('workspace calendar nights', () => {
  it('counts valid checkout-exclusive dates across leap days', () => {
    expect(calendarDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it.each([
    ['2028-03-01', '2028-02-28'],
    ['2028-02-30', '2028-03-01'],
  ])('returns no nights for invalid or reversed interval %s → %s', (start, end) => {
    expect(calendarDaysBetween(start, end)).toBe(0);
  });
});
