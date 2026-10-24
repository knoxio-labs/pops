import { describe, expect, it } from 'vitest';

import { timingFindings } from './calendar-model';
import { canvasCalendar, canvasTimingRules } from './canvas-calendar';
import { initialCanvas } from './canvas-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';

function event(patch: Partial<TripRecord> = {}): TripRecord {
  return {
    id: 'new-event',
    title: 'New event',
    kind: 'event',
    placeId: 'curitiba',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes: '',
    schedule: { start: '2028-01-04' },
    ...patch,
  };
}

describe('canvas calendar adapter', () => {
  it('retains distinct flight legs while deriving current titles and purchases from source records', () => {
    const state = initialCanvas('default');
    const source = state.records.find((record) => record.id === 'flight');
    if (!source) throw new Error('Missing flight');
    source.title = 'Updated outbound';
    delete source.purchase;
    const bookings = canvasCalendar(state);
    const legs = bookings.filter((booking) => booking.recordId === 'flight');
    expect(legs.map((booking) => booking.id)).toEqual(['outbound-syd-dfw', 'outbound-dfw-gru']);
    expect(
      legs.every((booking) => booking.title === 'Updated outbound' && !booking.purchased)
    ).toBe(true);
    expect(bookings.find((booking) => booking.recordId === 'connection')?.purchased).toBe(false);
    expect(source.arrangement).toBe('Booked');
    expect(state.rentals[0]?.status).toBe('Reserved');
  });

  it('shifts both day and night instants with source date edits and applies explicit clock overrides last', () => {
    const state = initialCanvas('default');
    const concert = state.records.find((record) => record.id === 'ticket');
    const flight = state.records.find((record) => record.id === 'flight');
    if (!concert || !flight) throw new Error('Missing dated source');
    concert.schedule = { start: '2028-01-04', localTime: '20:30' };
    flight.schedule = { start: '2027-11-26', end: '2027-11-27' };
    const bookings = canvasCalendar(state);
    expect(bookings.find((booking) => booking.id === 'concert')).toMatchObject({
      startAt: '2028-01-04T20:30:00-03:00',
      endAt: '2028-01-04T23:00:00-03:00',
    });
    expect(bookings.find((booking) => booking.id === 'outbound-syd-dfw')).toMatchObject({
      startAt: '2027-11-26T10:00:00+11:00',
      endAt: '2027-11-26T08:15:00-06:00',
    });
    expect(bookings.find((booking) => booking.id === 'outbound-dfw-gru')?.endAt).toBe(
      '2027-11-27T00:30:00-03:00'
    );
    state.clockOverrides.concert = { startAt: '2028-01-04T21:15:00-03:00' };
    expect(canvasCalendar(state).find((booking) => booking.id === 'concert')?.startAt).toBe(
      '2028-01-04T21:15:00-03:00'
    );
  });

  it('uses source end dates and newly scheduled return dates independently of original fixture dates', () => {
    const state = initialCanvas('default');
    const hotel = state.records.find((record) => record.id === 'hotel');
    const returning = state.records.find((record) => record.id === 'return-flight');
    if (!hotel || !returning) throw new Error('Missing source');
    hotel.schedule = { start: '2027-12-30', end: '2028-01-04' };
    returning.schedule = { start: '2028-02-26', end: '2028-02-28' };
    expect(canvasCalendar(state).find((booking) => booking.recordId === 'hotel')).toMatchObject({
      startAt: '2027-12-30T14:00:00-03:00',
      endAt: '2028-01-04T11:00:00-03:00',
    });
    expect(
      canvasCalendar(state).find((booking) => booking.recordId === 'return-flight')
    ).toMatchObject({
      startAt: '2028-02-26T17:00:00-03:00',
      endAt: '2028-02-28T06:00:00+11:00',
    });
  });

  it('projects new date-only sources and rentals without invented clocks or duplicate rental records', () => {
    const state = initialCanvas('empty');
    state.records = [
      event(),
      event({ id: 'new-stay', kind: 'stay' }),
      event({ id: 'car', kind: 'transport', title: 'Source rental' }),
    ];
    state.rentals = [
      {
        id: 'car',
        provider: 'Provider',
        from: 'curitiba',
        to: 'family',
        start: '2028-01-03',
        end: '2028-01-04',
        status: 'Reserved',
      },
    ];
    const bookings = canvasCalendar(state);
    expect(bookings).toHaveLength(3);
    expect(bookings.every((booking) => booking.allDay)).toBe(true);
    expect(bookings.filter((booking) => booking.id === 'car')).toEqual([
      expect.objectContaining({ kind: 'rental', title: 'Source rental', purchased: false }),
    ]);
    expect(state.records[0]?.intention).toBe('Considering');
  });

  it('preserves invalid and reversed source dates so validation reports them instead of throwing', () => {
    const state = initialCanvas('default');
    const hotel = state.records.find((record) => record.id === 'hotel');
    if (!hotel) throw new Error('Missing hotel');
    hotel.schedule = { start: '2028-02-30', end: '2028-01-01' };
    state.records.push(event({ schedule: { start: '2028-01-05', end: '2028-01-04' } }));
    state.rentals[0] = {
      id: 'car',
      provider: 'Provider',
      from: '',
      to: '',
      start: '2028-01-05',
      end: '',
      status: 'Reserved',
    };
    const bookings = canvasCalendar(state);
    expect(bookings.find((booking) => booking.recordId === 'hotel')?.startAt).toContain(
      '2028-02-30'
    );
    expect(timingFindings(bookings, []).map((finding) => finding.recordIds[0])).toEqual(
      expect.arrayContaining(['hotel', 'new-event', 'car'])
    );
  });

  it('reads explicit zero and edited buffer values without mutating the fixture', () => {
    const state = initialCanvas('default');
    state.buffers = { 'dfw-connection': 0, 'dinner-airport': 240 };
    expect(canvasTimingRules(state).map((rule) => rule.minimumMinutes)).toEqual([0, 240]);
    expect(canvasTimingRules(initialCanvas('default')).map((rule) => rule.minimumMinutes)).toEqual([
      90, 180,
    ]);
  });
});
