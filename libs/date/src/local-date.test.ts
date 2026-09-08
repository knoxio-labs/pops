// Every case below sets `process.env.TZ` immediately before constructing any
// `Date`, and asserts the resulting offset as a canary before trusting
// anything else in that case. Node re-reads `TZ` per `Date` construction, so
// this works within a single process — but a runtime that ignored the
// override, or a case whose Sydney/Honolulu tz data went stale, would
// otherwise pass every assertion below by accident (both zones' calendar
// arithmetic is internally consistent even at the wrong offset). The canary
// makes that failure loud instead of silent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  endOfLocalDay,
  startOfLocalDay,
  startOfMonthISODate,
  startOfWeekISODate,
  toISODate,
  todayISODate,
} from './local-date';

interface ZoneCase {
  /** IANA zone name, assigned to `process.env.TZ` for the case. */
  readonly zone: string;
  /** `Date.prototype.getTimezoneOffset()` at `instant`, in this zone — the canary. */
  readonly tzOffsetMinutes: number;
  /** A fixed UTC instant, deliberately not local midday. */
  readonly instant: string;
  /** `instant`'s local calendar day. */
  readonly localISODate: string;
  /** The first instant of `instant`'s local calendar day, as UTC. */
  readonly startOfLocalDayISO: string;
  /** The last instant (`23:59:59.999`) of `instant`'s local calendar day, as UTC. */
  readonly endOfLocalDayISO: string;
  /** The ISO-Monday starting `instant`'s local calendar week. */
  readonly weekStartISODate: string;
  /** The first day of `instant`'s local calendar month. */
  readonly monthStartISODate: string;
}

const ZONE_CASES: readonly ZoneCase[] = [
  {
    // East of UTC: for the hours after local midnight but before UTC
    // midnight, the local date is a day AHEAD of the UTC date.
    zone: 'Australia/Sydney',
    tzOffsetMinutes: -600,
    instant: '2026-09-05T14:30:00Z', // 00:30 AEST on 6 Sept — 5 Sept in UTC
    localISODate: '2026-09-06',
    startOfLocalDayISO: '2026-09-05T14:00:00.000Z',
    endOfLocalDayISO: '2026-09-06T13:59:59.999Z',
    weekStartISODate: '2026-08-31', // the local day is a Sunday
    monthStartISODate: '2026-09-01',
  },
  {
    // Offset zero: local and UTC agree on every field. Included as the
    // control case a buggy `toISOString()`-based implementation would also
    // pass — the point of the other two rows is that they wouldn't.
    zone: 'UTC',
    tzOffsetMinutes: 0,
    instant: '2026-06-17T12:00:00Z',
    localISODate: '2026-06-17',
    startOfLocalDayISO: '2026-06-17T00:00:00.000Z',
    endOfLocalDayISO: '2026-06-17T23:59:59.999Z',
    weekStartISODate: '2026-06-15',
    monthStartISODate: '2026-06-01',
  },
  {
    // West of UTC, and fixed offset year-round (no DST to complicate the
    // arithmetic). For the hours before local midnight but after UTC
    // midnight, the local date is a day BEHIND the UTC date — and here it's
    // behind by enough to also cross a month and a year boundary, which a
    // start-of-month derived from UTC fields would get wrong twice over.
    zone: 'Pacific/Honolulu',
    tzOffsetMinutes: 600,
    instant: '2026-01-01T05:00:00Z', // 19:00 HST on 31 Dec 2025 — 1 Jan 2026 in UTC
    localISODate: '2025-12-31',
    startOfLocalDayISO: '2025-12-31T10:00:00.000Z',
    endOfLocalDayISO: '2026-01-01T09:59:59.999Z',
    weekStartISODate: '2025-12-29',
    monthStartISODate: '2025-12-01',
  },
];

describe.each(ZONE_CASES)('in $zone', (zoneCase) => {
  let originalTz: string | undefined;

  beforeEach(() => {
    originalTz = process.env['TZ'];
    process.env['TZ'] = zoneCase.zone;
  });

  afterEach(() => {
    if (originalTz === undefined) delete process.env['TZ'];
    else process.env['TZ'] = originalTz;
    vi.useRealTimers();
  });

  it('is running at the expected UTC offset, or nothing below discriminates', () => {
    expect(new Date(zoneCase.instant).getTimezoneOffset()).toBe(zoneCase.tzOffsetMinutes);
  });

  it('toISODate reads the local calendar day', () => {
    expect(toISODate(new Date(zoneCase.instant))).toBe(zoneCase.localISODate);
  });

  it("todayISODate is the viewer's own date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(zoneCase.instant));
    expect(todayISODate()).toBe(zoneCase.localISODate);
  });

  it('startOfLocalDay is the first instant of the local calendar day', () => {
    expect(startOfLocalDay(new Date(zoneCase.instant)).toISOString()).toBe(
      zoneCase.startOfLocalDayISO
    );
  });

  it('endOfLocalDay is the last instant of the local calendar day', () => {
    expect(endOfLocalDay(new Date(zoneCase.instant)).toISOString()).toBe(zoneCase.endOfLocalDayISO);
  });

  it('startOfWeekISODate is the ISO Monday of the local calendar week', () => {
    expect(startOfWeekISODate(new Date(zoneCase.instant))).toBe(zoneCase.weekStartISODate);
  });

  it('startOfMonthISODate is the first day of the local calendar month', () => {
    expect(startOfMonthISODate(new Date(zoneCase.instant))).toBe(zoneCase.monthStartISODate);
  });
});

describe('toISODate', () => {
  it('zero-pads a single-digit month and day', () => {
    // Constructed from local fields directly, so this is independent of TZ:
    // `getMonth() + 1` and `getDate()` are `1` and `4`, not `01`/`04`, until
    // `padStart` runs.
    expect(toISODate(new Date(2026, 0, 4))).toBe('2026-01-04');
  });
});

describe('default arguments', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('startOfLocalDay defaults to now', () => {
    process.env['TZ'] = 'UTC';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T08:00:00Z'));
    expect(startOfLocalDay().toISOString()).toBe('2026-03-10T00:00:00.000Z');
  });

  it('endOfLocalDay defaults to now', () => {
    process.env['TZ'] = 'UTC';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T08:00:00Z'));
    expect(endOfLocalDay().toISOString()).toBe('2026-03-10T23:59:59.999Z');
  });

  it('startOfWeekISODate defaults to now', () => {
    process.env['TZ'] = 'UTC';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00Z'));
    expect(startOfWeekISODate()).toBe('2026-06-15');
  });

  it('startOfMonthISODate defaults to now', () => {
    process.env['TZ'] = 'UTC';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00Z'));
    expect(startOfMonthISODate()).toBe('2026-06-01');
  });
});
