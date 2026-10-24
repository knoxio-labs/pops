import { describe, expect, it } from 'vitest';

import { calendarBookings, calendarRules } from './calendar-fixtures';
import { bookingDay, calendarEntries, flightWindow, timingFindings } from './calendar-model';

import type { CalendarBooking } from './calendar-model';

const first: CalendarBooking = {
  id: 'first',
  recordId: 'record-first',
  title: 'First',
  kind: 'event',
  location: 'Sydney',
  startAt: '2027-11-24T10:00:00+11:00',
  endAt: '2027-11-24T11:00:00+11:00',
  timeZone: 'Australia/Sydney',
  purchased: false,
};
const second: CalendarBooking = {
  ...first,
  id: 'second',
  recordId: 'record-second',
  title: 'Second',
  startAt: '2027-11-24T12:30:00+11:00',
  endAt: '2027-11-24T13:00:00+11:00',
};
const rule = {
  id: 'buffer',
  fromId: 'first',
  toId: 'second',
  minimumMinutes: 90,
  kind: 'connection',
} satisfies (typeof calendarRules)[number];

describe('calendar timing', () => {
  it('derives connection and airport buffers across zones and midnight', () => {
    expect(timingFindings(calendarBookings, calendarRules)).toEqual([
      expect.objectContaining({
        id: 'dfw-connection',
        recordIds: ['flight'],
        availableMinutes: 45,
        requiredMinutes: 90,
      }),
      expect.objectContaining({
        id: 'dinner-airport',
        recordIds: ['dinner', 'connection'],
        availableMinutes: 105,
        requiredMinutes: 180,
      }),
    ]);
  });

  it('accepts the exact configured boundary, flags one minute below and responds to configuration', () => {
    expect(timingFindings([first, second], [rule])).toEqual([]);
    expect(
      timingFindings([first, { ...second, startAt: '2027-11-24T12:29:00+11:00' }], [rule])
    ).toEqual([expect.objectContaining({ availableMinutes: 89 })]);
    expect(timingFindings([first, second], [{ ...rule, minimumMinutes: 91 }])).toEqual([
      expect.objectContaining({ availableMinutes: 90, requiredMinutes: 91 }),
    ]);
  });

  it('retains negative gaps and detects commitment overlaps, excluding stay occupancy', () => {
    const overlapping = { ...second, startAt: '2027-11-24T10:30:00+11:00' };
    expect(timingFindings([first, overlapping], [rule])).toEqual([
      expect.objectContaining({ id: 'buffer', availableMinutes: -30 }),
      expect.objectContaining({
        id: 'overlap-first-second',
        recordIds: ['record-first', 'record-second'],
      }),
    ]);
    expect(timingFindings([first, { ...overlapping, kind: 'stay' }], [])).toEqual([]);
    expect(timingFindings([first, { ...second, startAt: first.endAt ?? '' }], [])).toEqual([]);
  });

  it('reports missing linked entries and missing end times without manufacturing a gap', () => {
    expect(timingFindings([first], [rule])).toEqual([
      expect.objectContaining({
        message: 'buffer: missing linked booking',
        recordIds: ['record-first'],
      }),
    ]);
    const { endAt, ...point } = first;
    expect(endAt).toBeDefined();
    expect(timingFindings([point, second], [rule])).toEqual([
      expect.objectContaining({ message: 'First: end time required' }),
    ]);
  });

  it.each([
    { startAt: '2027-11-24T10:00:00' },
    { startAt: '2027-02-30T10:00:00+11:00' },
    { startAt: '2027-13-24T10:00:00+11:00' },
    { startAt: '' },
    { startAt: '2027-11-24T24:00:00+11:00' },
    { endAt: '2027-11-24T09:00:00+11:00' },
    { timeZone: 'Missing/Zone' },
    { endTimeZone: 'Missing/Zone' },
  ])('reports an invalid interval or zone: %j', (patch) => {
    const invalid = { ...first, ...patch };
    expect(timingFindings([invalid, second], [rule])).toEqual([
      expect.objectContaining({ id: 'invalid-first' }),
    ]);
    expect(calendarEntries([invalid], '2027-11-01', '2027-12-01')).toEqual([]);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid minimum %s',
    (minimumMinutes) => {
      expect(timingFindings([first, second], [{ ...rule, minimumMinutes }])).toEqual([
        expect.objectContaining({ message: 'buffer: invalid minimum minutes' }),
      ]);
    }
  );
});

describe('local calendar projection', () => {
  it('uses departure and arrival calendars across the date line', () => {
    expect(flightWindow(calendarBookings, 'flight')).toEqual({
      from: '2027-11-23',
      to: '2027-11-26',
    });
    expect(flightWindow(calendarBookings, 'return-flight')).toEqual({
      from: '2028-02-24',
      to: '2028-02-28',
    });
    expect(bookingDay('2027-11-24T10:00:00+11:00', 'Australia/Sydney')).toBe('2027-11-24');
    expect(() => flightWindow(calendarBookings, 'missing')).toThrow(
      'Invalid or missing flight interval'
    );
    expect(() =>
      flightWindow([{ ...first, kind: 'flight', startAt: '' }], first.recordId)
    ).toThrow();
  });

  it('includes both flight legs and arrival boundaries in a multi-day window', () => {
    const entries = calendarEntries(calendarBookings, '2027-11-24', '2027-11-25');
    expect(entries.map((entry) => [entry.booking.id, entry.day, entry.boundary])).toEqual([
      ['outbound-syd-dfw', '2027-11-24', 'start'],
      ['outbound-syd-dfw', '2027-11-24', 'end'],
      ['outbound-dfw-gru', '2027-11-24', 'start'],
      ['outbound-dfw-gru', '2027-11-25', 'end'],
    ]);
  });

  it('includes ongoing stays once and all event boundaries without repeating nights', () => {
    const entries = calendarEntries(calendarBookings, '2028-01-01', '2028-01-02');
    expect(entries.map((entry) => [entry.booking.id, entry.boundary])).toEqual([
      ['olinda-first', 'continuing'],
      ['concert', 'start'],
      ['concert', 'end'],
    ]);
    const boundaries = calendarEntries(calendarBookings, '2027-12-29', '2028-01-05').filter(
      (entry) => entry.booking.kind === 'stay'
    );
    expect(boundaries.map((entry) => [entry.booking.id, entry.day, entry.boundary])).toEqual([
      ['olinda-first', '2027-12-29', 'start'],
      ['olinda-first', '2028-01-03', 'end'],
      ['olinda-second', '2028-01-03', 'start'],
      ['olinda-second', '2028-01-05', 'end'],
    ]);
  });

  it('keeps midnight departure on its own local day and returns no reversed-range entries', () => {
    expect(
      calendarEntries(calendarBookings, '2027-12-29', '2027-12-29').map((entry) => entry.booking.id)
    ).toEqual(['poa-rec', 'poa-rec', 'olinda-first']);
    expect(calendarEntries(calendarBookings, '2028-01-02', '2028-01-01')).toEqual([]);
  });
});

describe('all-day source dates', () => {
  it('preserves floating dates regardless of the display zone and does not claim a timed conflict', () => {
    const allDay: CalendarBooking = {
      ...first,
      allDay: true,
      startAt: '2027-11-24T00:00:00Z',
      endAt: '2027-11-25T00:00:00Z',
      timeZone: 'America/Sao_Paulo',
    };
    expect(calendarEntries([allDay], '2027-11-24', '2027-11-25').map((entry) => entry.day)).toEqual(
      ['2027-11-24', '2027-11-25']
    );
    expect(timingFindings([allDay, second], [rule])).toEqual([]);
    expect(timingFindings([first, { ...second, allDay: true }], [rule])).toEqual([]);
  });
});
