import { afterEach, describe, expect, it, vi } from 'vitest';

import { toISODate, todayISODate } from './local-date';

afterEach(() => {
  vi.useRealTimers();
});

describe('toISODate', () => {
  it('reads the local calendar fields, so the wall clock decides the date', () => {
    // 00:30 on 6 Sept local is 5 Sept in UTC anywhere east of Greenwich, and
    // 6 Sept in UTC anywhere west of it — the local fields are the only
    // TZ-independent answer, and the only one a date input agrees with.
    expect(toISODate(new Date(2026, 8, 6, 0, 30))).toBe('2026-09-06');
  });

  it('zero-pads month and day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('does not roll a late-evening date forward the way a UTC read would', () => {
    // The failing case in a +offset zone: 23:59 local, already tomorrow in
    // nothing but a westward conversion.
    expect(toISODate(new Date(2026, 8, 6, 23, 59))).toBe('2026-09-06');
  });
});

describe('todayISODate', () => {
  it("is the viewer's own calendar date at local midnight, not a UTC-shifted one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 6, 0, 30));
    expect(todayISODate()).toBe('2026-09-06');
  });
});
