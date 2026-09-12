/**
 * Window arithmetic for the spend summary (POPS-3589).
 *
 * The cases that matter here are the ones a plausible implementation gets
 * wrong, not the ones it gets right by construction:
 *
 * - `setUTCMonth(m - 1)` on a 31st overflows into the month being compared
 *   against (2026-03-31 → 2026-03-03), so a March-to-date summary would
 *   compare against three days of March and call them February.
 * - A rolling window computed by subtracting one from the month, rather than
 *   by day count, produces a previous period of the wrong length whenever the
 *   two months differ in length.
 * - February in a leap year is the only place a year-to-date comparison can
 *   silently slide by a day.
 */
import { describe, expect, it } from 'vitest';

import { monthsInRange, resolveSummaryWindow } from '../services/summary-window.js';

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('resolveSummaryWindow — rolling windows', () => {
  it('covers 30 inclusive days ending today, and the 30 before them', () => {
    expect(resolveSummaryWindow('30d', at('2026-09-12'))).toEqual({
      key: '30d',
      start: '2026-08-14',
      end: '2026-09-12',
      previous: { start: '2026-07-15', end: '2026-08-13' },
    });
  });

  it('crosses a month boundary by day count, not by month arithmetic', () => {
    // 2026-03-01 minus 29 days is 2026-01-31: February has 28 days, so any
    // implementation that decremented the month instead would land in February.
    expect(resolveSummaryWindow('30d', at('2026-03-01'))).toEqual({
      key: '30d',
      start: '2026-01-31',
      end: '2026-03-01',
      previous: { start: '2026-01-01', end: '2026-01-30' },
    });
  });

  it('crosses a year boundary', () => {
    expect(resolveSummaryWindow('90d', at('2026-01-15')).start).toBe('2025-10-18');
    expect(resolveSummaryWindow('90d', at('2026-01-15')).previous).toEqual({
      start: '2025-07-20',
      end: '2025-10-17',
    });
  });

  it('gives the previous period exactly the same length as the current one', () => {
    for (const today of ['2026-01-31', '2026-03-01', '2026-03-31', '2027-02-28']) {
      const { start, end, previous } = resolveSummaryWindow('30d', at(today));
      expect(previous).not.toBeNull();
      expect(days(previous?.start ?? '', previous?.end ?? '')).toBe(days(start ?? '', end));
    }
  });
});

describe('resolveSummaryWindow — calendar windows', () => {
  it('compares month-to-date against the same elapsed days of the previous month', () => {
    expect(resolveSummaryWindow('month', at('2026-09-12'))).toEqual({
      key: 'month',
      start: '2026-09-01',
      end: '2026-09-12',
      previous: { start: '2026-08-01', end: '2026-08-12' },
    });
  });

  it('clamps to the previous month rather than overflowing past its last day', () => {
    // The trap: 31 elapsed days of March have no 31st of February to reach.
    // Naive month arithmetic answers 2026-03-03 — three days of the very
    // month being measured, counted as the baseline it is measured against.
    expect(resolveSummaryWindow('month', at('2026-03-31')).previous).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  it('compares the first day of a month against the first day of the previous one', () => {
    expect(resolveSummaryWindow('month', at('2026-03-01')).previous).toEqual({
      start: '2026-02-01',
      end: '2026-02-01',
    });
  });

  it('steps back across a year boundary in January', () => {
    expect(resolveSummaryWindow('month', at('2026-01-09')).previous).toEqual({
      start: '2025-12-01',
      end: '2025-12-09',
    });
  });

  it('compares year-to-date against the same elapsed days of the previous year', () => {
    expect(resolveSummaryWindow('year', at('2026-03-01'))).toEqual({
      key: 'year',
      start: '2026-01-01',
      end: '2026-03-01',
      previous: { start: '2025-01-01', end: '2025-03-01' },
    });
  });

  it('lands on 29 February when the previous year is a leap year', () => {
    // 2025-03-01 is the 60th day of 2025; the 60th day of 2024 is 29 February.
    expect(resolveSummaryWindow('year', at('2025-03-01')).previous).toEqual({
      start: '2024-01-01',
      end: '2024-02-29',
    });
  });

  it('clamps 31 December of a leap year to 31 December of a common one', () => {
    expect(resolveSummaryWindow('year', at('2024-12-31')).previous).toEqual({
      start: '2023-01-01',
      end: '2023-12-31',
    });
  });
});

describe('resolveSummaryWindow — all time', () => {
  it('has no lower bound and no previous period', () => {
    expect(resolveSummaryWindow('all', at('2026-09-12'))).toEqual({
      key: 'all',
      start: null,
      end: '2026-09-12',
      previous: null,
    });
  });
});

describe('monthsInRange', () => {
  it('is dense across a year boundary', () => {
    expect(monthsInRange({ start: '2025-11-30', end: '2026-02-01' })).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('is a single month when the range sits inside one', () => {
    expect(monthsInRange({ start: '2026-02-03', end: '2026-02-27' })).toEqual(['2026-02']);
  });
});

function days(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
}
