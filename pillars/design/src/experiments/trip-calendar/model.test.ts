import { describe, expect, it } from 'vitest';

import { localDateTime } from '../trip-route-editing/canvas-zoned-time';
import { createTripCalendarState } from './fixtures';
import {
  applyFlightWindow,
  calendarInputFindings,
  tripCalendarDays,
  tripCalendarFindings,
  validCalendarAvailability,
} from './model';

import type { CalendarBooking } from '../trip-route-editing/calendar-types';

describe('display calendar projection', () => {
  it('includes all source commitments and separate inclusive availability without assigning a clock', () => {
    const state = createTripCalendarState();
    const before = structuredClone(state);
    const days = tripCalendarDays(state);
    expect(days).toHaveLength(7);
    expect(days[0]?.availability[0]).toBe(state.availability[0]);
    expect(days.find((day) => day.day === '2027-12-28')?.availability).toHaveLength(1);
    expect(days.find((day) => day.day === '2027-12-29')?.availability).toEqual([]);
    expect(days.flatMap((day) => day.entries).some((entry) => !entry.booking.purchased)).toBe(true);
    expect(days[0]?.availability[0]).not.toHaveProperty('startAt');
    expect(state).toEqual(before);
  });

  it('projects stay and rental continuations per day while retaining source clocks and boundary types', () => {
    const state = createTripCalendarState();
    const stay = state.bookings.find((booking) => booking.id === 'olinda-first');
    if (!stay) throw new Error('Missing stay fixture');
    state.bookings.push({ ...stay, id: 'rental', recordId: 'rental', kind: 'rental' });
    state.from = '2027-12-30';
    state.to = '2028-01-01';
    const days = tripCalendarDays(state);
    expect(days.map((day) => day.entries.map((entry) => entry.boundary))).toEqual([
      ['continuing', 'continuing'],
      ['continuing', 'continuing'],
      ['continuing', 'continuing'],
    ]);
    expect(days[0]?.entries[0]?.booking).toBe(stay);
    expect(days[0]?.entries[0]?.at).toBe(stay.startAt);
    expect(days[0]?.entries[0]?.zone).toBe('America/Recife');
  });

  it('converts day placement and clocks into the chosen zone without changing source offsets', () => {
    const state = createTripCalendarState('date-line');
    const source = state.bookings.find((booking) => booking.id === 'return-fln-syd');
    if (!source) throw new Error('Missing return flight fixture');
    const entries = tripCalendarDays(state)
      .flatMap((day) => day.entries)
      .filter((entry) => entry.booking === source);
    expect(entries.map((entry) => [entry.day, entry.boundary])).toEqual([
      ['2028-02-26', 'start'],
      ['2028-02-27', 'end'],
    ]);
    expect(localDateTime(entries[0]?.at ?? '', state.timeZone)).toBe('2028-02-26T07:00');
    expect(source.startAt).toBe('2028-02-25T17:00:00-03:00');
    expect(source.timeZone).toBe('America/Sao_Paulo');
  });

  it('keeps floating all-day source dates independent of the selected zone', () => {
    const state = createTripCalendarState();
    state.from = '2028-01-01';
    state.to = '2028-01-01';
    state.timeZone = 'Pacific/Honolulu';
    state.bookings = [
      {
        id: 'all-day',
        recordId: 'all-day',
        title: 'Date only',
        kind: 'event',
        location: '',
        startAt: '2028-01-01T00:00:00Z',
        timeZone: 'UTC',
        purchased: false,
        allDay: true,
      },
    ];
    expect(tripCalendarDays(state)[0]?.entries[0]?.day).toBe('2028-01-01');
  });

  it('retains the approved floating rental dates and reservation tier across display zones', () => {
    const state = createTripCalendarState();
    const rental = state.bookings.find((booking) => booking.kind === 'rental');
    if (!rental) throw new Error('Missing source rental fixture');
    expect(rental).toMatchObject({
      allDay: true,
      purchased: false,
      startAt: '2027-12-14T00:00:00Z',
      endAt: '2027-12-29T00:00:00Z',
    });
    const source = structuredClone(rental);
    const project = () =>
      tripCalendarDays(state)
        .flatMap((day) => day.entries)
        .filter((entry) => entry.booking === rental)
        .map((entry) => [entry.day, entry.boundary]);
    const local = project();
    expect(local).toEqual([
      ['2027-12-28', 'continuing'],
      ['2027-12-29', 'end'],
    ]);
    state.timeZone = 'Pacific/Honolulu';
    expect(project()).toEqual(local);
    expect(rental).toEqual(source);
  });

  it.each(['flight', 'stay', 'event', 'rental', 'availability'] as const)(
    'filters explicit kind %s',
    (kind) => {
      const state = createTripCalendarState();
      state.kind = kind;
      const days = tripCalendarDays(state);
      expect(days.every((day) => day.entries.every((entry) => entry.booking.kind === kind))).toBe(
        true
      );
      if (kind !== 'availability') expect(days.every((day) => !day.availability.length)).toBe(true);
    }
  );

  it.each([
    { from: '2027-02-30' },
    { to: '' },
    { from: '2028-01-06' },
    { timeZone: 'Invalid/Zone' },
    { timeZone: '' },
    { timeZone: '+03:00' },
  ])('reports invalid controls %j without a fallback projection', (change) => {
    const state = { ...createTripCalendarState(), ...change };
    expect(calendarInputFindings(state).length).toBeGreaterThan(0);
    expect(tripCalendarDays(state)).toEqual([]);
  });

  it('allows an arbitrary inclusive leap-day range and sorts distinct offsets by actual instants', () => {
    const state = createTripCalendarState();
    state.from = '2028-02-28';
    state.to = '2028-03-01';
    state.timeZone = 'UTC';
    const source: CalendarBooking = {
      id: 'later',
      recordId: 'later',
      title: 'Later',
      kind: 'event',
      location: '',
      startAt: '2028-02-29T10:00:00-05:00',
      timeZone: 'America/New_York',
      purchased: true,
    };
    state.bookings = [
      source,
      {
        ...source,
        id: 'earlier',
        recordId: 'earlier',
        startAt: '2028-02-29T12:00:00Z',
        timeZone: 'UTC',
      },
    ];
    expect(tripCalendarDays(state).map((day) => day.day)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
    expect(tripCalendarDays(state)[1]?.entries.map((entry) => entry.booking.id)).toEqual([
      'earlier',
      'later',
    ]);
  });
});

describe('source findings and flight presets', () => {
  it.each([
    ['2028-02-29', '2028-02-29', true],
    ['2028-02-28', '2028-03-01', true],
    ['', '2028-03-01', false],
    ['2028-02-28', '', false],
    ['2027-02-29', '2027-03-01', false],
    ['2028-03-01', '2028-02-28', false],
  ])('validates floating availability %s through %s', (from, to, expected) => {
    const source = createTripCalendarState().availability[0];
    if (!source) throw new Error('Missing availability fixture');
    expect(validCalendarAvailability({ ...source, from, to })).toBe(expected);
  });

  it('scopes valid timing findings to visible sources, including tentative commitments', () => {
    const state = createTripCalendarState();
    expect(tripCalendarFindings(state).some((finding) => finding.id === 'dinner-airport')).toBe(
      true
    );
    expect(tripCalendarFindings(state).some((finding) => finding.id === 'dfw-connection')).toBe(
      false
    );
    state.kind = 'stay';
    expect(tripCalendarFindings(state)).toEqual([]);
    const flight = createTripCalendarState('flight-window');
    expect(tripCalendarFindings(flight).some((finding) => finding.id === 'dfw-connection')).toBe(
      true
    );
  });

  it('keeps invalid sources discoverable even when they have no visible projection', () => {
    const state = createTripCalendarState('missing-time');
    state.from = '2028-02-01';
    state.to = state.from;
    expect(tripCalendarDays(state)[0]?.entries).toEqual([]);
    expect(tripCalendarFindings(state).some((finding) => finding.id === 'invalid-poa-rec')).toBe(
      true
    );
    state.availability = state.availability.map((source) => ({ ...source, to: '2027-02-30' }));
    expect(tripCalendarFindings(state).some((finding) => finding.id === 'availability-v1')).toBe(
      true
    );
  });

  it('uses a display-zone flight window rather than departure/arrival source date labels', () => {
    const state = createTripCalendarState();
    state.timeZone = 'Australia/Sydney';
    const result = applyFlightWindow(state, 'flight');
    expect(result.error).toBeNull();
    expect([result.state.from, result.state.to]).toEqual(['2027-11-23', '2027-11-26']);
    expect(result.state.bookings).toBe(state.bookings);
    expect(result.state.rules).toBe(state.rules);
    expect(result.state.availability).toBe(state.availability);
    const returning = applyFlightWindow(state, 'return-flight');
    expect([returning.state.from, returning.state.to]).toEqual(['2028-02-25', '2028-02-28']);
    expect(state.from).toBe('2027-12-28');
  });

  it('rejects missing/invalid flight source clocks and invalid zones explicitly', () => {
    const state = createTripCalendarState('missing-time');
    for (const id of ['missing', 'connection']) {
      const result = applyFlightWindow(state, id);
      expect(result.state).toBe(state);
      expect(result.error).not.toBeNull();
    }
    state.timeZone = 'Invalid/Zone';
    expect(applyFlightWindow(state, 'flight')).toEqual({
      state,
      error: 'Choose a valid IANA display time zone.',
    });
  });

  it('creates independent empty and source fixtures', () => {
    const state = createTripCalendarState();
    state.bookings.splice(0, 1);
    state.availability.splice(0, 1);
    expect(createTripCalendarState().bookings).toHaveLength(9);
    expect(createTripCalendarState().availability).toHaveLength(1);
    expect(
      tripCalendarDays(createTripCalendarState('empty')).every(
        (day) => !day.entries.length && !day.availability.length
      )
    ).toBe(true);
    expect(calendarInputFindings(createTripCalendarState('invalid-range'))).toContainEqual({
      id: 'range',
      message: 'Start date must be on or before end date.',
    });
  });
});
