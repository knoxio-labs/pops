// The runner's own zone is UTC, where every instant's UTC date and local date
// agree — so a test built from local `Date` fields there is satisfied just as
// well by the `toISOString()` read this module exists to replace, and could
// never fail against it. The zone is therefore fixed to one ahead of UTC
// before any `Date` is constructed, and asserted below so that a runtime
// which ignored the override fails loudly instead of going vacuous.
process.env['TZ'] = 'Australia/Sydney';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { toISODate, todayISODate } from './local-date';

/** 00:30 on 6 Sept in AEST (+10) — still 5 Sept, 14:30, in UTC. */
const AFTER_LOCAL_MIDNIGHT = new Date('2026-09-05T14:30:00Z');

afterEach(() => {
  vi.useRealTimers();
});

describe('the fixture this suite depends on', () => {
  it('is running ten hours ahead of UTC, or nothing below discriminates', () => {
    expect(AFTER_LOCAL_MIDNIGHT.getTimezoneOffset()).toBe(-600);
  });

  it('is an instant whose UTC date really is the previous day', () => {
    expect(AFTER_LOCAL_MIDNIGHT.toISOString().slice(0, 10)).toBe('2026-09-05');
  });
});

describe('toISODate', () => {
  it('reads the local calendar date, not the UTC one', () => {
    expect(toISODate(AFTER_LOCAL_MIDNIGHT)).toBe('2026-09-06');
  });

  it('zero-pads month and day', () => {
    expect(toISODate(new Date('2026-01-04T22:00:00Z'))).toBe('2026-01-05');
  });
});

describe('todayISODate', () => {
  it("is the viewer's own date during the hours UTC is still on yesterday", () => {
    // The lived bug: the dialog's `max` and its "not in the future" rule both
    // refused a checkpoint dated today, every day, until UTC caught up.
    vi.useFakeTimers();
    vi.setSystemTime(AFTER_LOCAL_MIDNIGHT);
    expect(todayISODate()).toBe('2026-09-06');
  });
});
