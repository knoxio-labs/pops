/**
 * The DST edges are the whole point of computing this in the owner's
 * timezone rather than UTC. `Australia/Sydney` observes AEDT (+11) from the
 * first Sunday of October to the first Sunday of April and AEST (+10)
 * otherwise, so a month boundary computed as a fixed UTC offset would be
 * off by an hour for roughly half the year.
 */
import { describe, expect, it } from 'vitest';

import { monthBounds, previousMonthKey } from '../month-window.js';

describe('monthBounds', () => {
  it('opens a standard-time month (AEST, +10) at local midnight', () => {
    expect(monthBounds('2026-08')).toEqual({
      from: '2026-07-31T14:00:00.000Z',
      to: '2026-08-31T13:59:59.999Z',
    });
  });

  it('opens a daylight-time month (AEDT, +11) at local midnight', () => {
    // October 2026 itself starts in AEST (the clocks go forward on the
    // first Sunday, the 4th), but its upper bound is drawn from November's
    // local midnight, which is AEDT — so this pins both offsets at once.
    expect(monthBounds('2026-10')).toEqual({
      from: '2026-09-30T14:00:00.000Z',
      to: '2026-10-31T12:59:59.999Z',
    });
  });

  it('draws a month that starts in daylight time and ends past the autumn changeover', () => {
    // April 2026: the 1st is still AEDT (+11, clocks go back the 5th), and
    // the upper bound is drawn from May's local midnight, which is AEST
    // (+10) — an hour that is wrong if this month's own offset were reused.
    expect(monthBounds('2026-04')).toEqual({
      from: '2026-03-31T13:00:00.000Z',
      to: '2026-04-30T13:59:59.999Z',
    });
  });

  it('rolls a December month into next January', () => {
    const bounds = monthBounds('2026-12');
    expect(bounds.from.startsWith('2026-11-30')).toBe(true);
    expect(bounds.to.startsWith('2026-12-31')).toBe(true);
  });
});

describe('previousMonthKey', () => {
  it('steps back one calendar month', () => {
    expect(previousMonthKey('2026-08')).toBe('2026-07');
  });

  it('rolls a January back into the previous December', () => {
    expect(previousMonthKey('2026-01')).toBe('2025-12');
  });
});
