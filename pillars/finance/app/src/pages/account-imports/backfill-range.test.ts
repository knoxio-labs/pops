import { describe, expect, it } from 'vitest';

import { backfillOutcomeLine, monthOf, previousMonth, rangeIsUnusable } from './BackfillRange';

describe('monthOf', () => {
  it('spans the whole calendar month the date falls in', () => {
    expect(monthOf('2026-09-10')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('ends on the 31st for a 31-day month', () => {
    expect(monthOf('2026-01-15')).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('ends on the 29th in a leap February', () => {
    expect(monthOf('2028-02-05')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('ends on the 28th in a common February', () => {
    expect(monthOf('2026-02-05')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('previousMonth', () => {
  it('steps back one month, keeping the whole-month span', () => {
    expect(previousMonth(monthOf('2026-09-10'))).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    });
  });

  it('crosses the year boundary', () => {
    expect(previousMonth(monthOf('2026-01-10'))).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    });
  });

  it('lands on a short February rather than an invalid 31st', () => {
    expect(previousMonth(monthOf('2026-03-31'))).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  it('walks backwards repeatedly without drifting off the month boundary', () => {
    let range = monthOf('2026-03-31');
    for (let step = 0; step < 4; step += 1) range = previousMonth(range);
    expect(range).toEqual({ start: '2025-11-01', end: '2025-11-30' });
  });
});

describe('backfillOutcomeLine', () => {
  it('says nothing was there when every count is zero', () => {
    expect(backfillOutcomeLine(0, 0, 0)).toBe('Up had nothing in that range.');
  });

  it('reports a re-run month as staged nothing, already waiting', () => {
    expect(backfillOutcomeLine(0, 12, 0)).toBe('0 staged, 12 already waiting.');
  });

  it('separates rows already committed to the ledger from those still waiting', () => {
    expect(backfillOutcomeLine(3, 1, 8)).toBe(
      '3 staged, 1 already waiting, 8 already in the ledger.'
    );
  });

  it('says only what happened when nothing was skipped', () => {
    expect(backfillOutcomeLine(22, 0, 0)).toBe('22 staged.');
  });
});

describe('rangeIsUnusable', () => {
  it('accepts a normal range', () => {
    expect(rangeIsUnusable({ start: '2026-08-01', end: '2026-08-31' })).toBe(false);
  });

  it('accepts a single-day range', () => {
    expect(rangeIsUnusable({ start: '2026-08-01', end: '2026-08-01' })).toBe(false);
  });

  it('rejects a reversed range', () => {
    expect(rangeIsUnusable({ start: '2026-08-31', end: '2026-08-01' })).toBe(true);
  });

  it('rejects a missing end, which would otherwise 422 at the server', () => {
    expect(rangeIsUnusable({ start: '2026-08-01', end: '' })).toBe(true);
  });

  it('rejects a missing start', () => {
    expect(rangeIsUnusable({ start: '', end: '2026-08-31' })).toBe(true);
  });
});
