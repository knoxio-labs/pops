import { describe, expect, it } from 'vitest';

import { initialCanvas } from '../trip-route-editing/canvas-model';
import { visitDay, visitDayDates } from './day-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from '../trip-route-editing/canvas-model';

const visit: TripRecord = {
  id: 'recife',
  kind: 'city',
  placeId: 'recife-olinda',
  intention: 'In plan',
  arrangement: 'Not needed',
  notes: '',
  timing: { arrival: '2027-12-29', departure: '2028-01-06' },
};

function stateWith(records: TripRecord[]): CanvasState {
  return { ...initialCanvas('empty'), records: [visit, ...records] };
}

function item(id: string, kind: TripRecord['kind'], schedule?: TripRecord['schedule']): TripRecord {
  return { ...visit, id, kind, visitId: visit.id, schedule, timing: undefined };
}

describe('visitDay', () => {
  it('switches accommodation on checkout day and exposes the uncovered night', () => {
    const first = {
      ...item('first', 'stay', { start: '2027-12-29', end: '2028-01-03' }),
      arrangement: 'Booked' as const,
    };
    const second = {
      ...item('second', 'stay', { start: '2028-01-03', end: '2028-01-05' }),
      arrangement: 'Agreed' as const,
    };
    const state = stateWith([first, second]);
    expect(visitDay(state, visit, '2028-01-02').accommodation?.stays).toEqual([first]);
    expect(visitDay(state, visit, '2028-01-03').accommodation?.stays).toEqual([second]);
    expect(visitDay(state, visit, '2028-01-05').accommodation).toMatchObject({
      stays: [],
      missing: true,
    });
    expect(visitDay(state, visit, '2028-01-06').accommodation).toBeUndefined();
  });

  it('keeps explicit wall time, date-only activities and undated ideas distinct', () => {
    const state = stateWith([
      item('friends-local', 'person', { start: '2028-01-03', localTime: '18:00' }),
      item('day-only', 'event', { start: '2028-01-03' }),
      item('walk-local', 'idea'),
      { ...item('other-visit', 'event', { start: '2028-01-03' }), visitId: 'elsewhere' },
    ]);
    const projection = visitDay(state, visit, '2028-01-03');
    expect(projection.entries.map((entry) => [entry.record.id, entry.time, entry.zone])).toEqual([
      ['day-only', undefined, undefined],
      ['friends-local', '18:00', undefined],
    ]);
    expect(projection.undated.map((record) => record.id)).toEqual(['walk-local']);
    expect(visitDay(state, visit, '2028-01-04').entries).toEqual([]);
  });

  it('uses local arrival dates and only linked visit endpoints for multi-leg flights', () => {
    const state = initialCanvas('default');
    const arrival = state.records.find((record) => record.id === 'arrival');
    const origin = state.records.find((record) => record.id === 'sydney-out');
    if (!arrival || !origin) throw new Error('Expected route visits');
    expect(visitDay(state, arrival, '2027-11-24').entries).toEqual([]);
    expect(visitDay(state, arrival, '2027-11-25').entries).toMatchObject([
      { record: { id: 'flight' }, direction: 'Arrive', time: '00:30', zone: 'America/Sao_Paulo' },
    ]);
    expect(visitDay(state, origin, '2027-11-24').entries).toMatchObject([
      { record: { id: 'flight' }, direction: 'Depart', time: '10:00', zone: 'Australia/Sydney' },
    ]);
    state.transitLinks = {};
    expect(visitDay(state, arrival, '2027-11-25').entries).toEqual([]);
  });

  it('reflects precise clock overrides rather than stale fixture instants', () => {
    const state = initialCanvas('default');
    state.clockOverrides['poa-rec'] = { endAt: '2027-12-30T02:10:00-03:00' };
    expect(visitDay(state, visit, '2027-12-29').entries.filter((entry) => entry.direction)).toEqual(
      []
    );
    expect(
      visitDay(state, visit, '2027-12-30').entries.filter((entry) => entry.direction)
    ).toMatchObject([{ record: { id: 'connection' }, direction: 'Arrive', time: '02:10' }]);
  });

  it('retains date-only transit boundaries without inventing a clock or an arrival date', () => {
    const transport = item('train', 'transport', { start: '2028-01-03', end: '2028-01-04' });
    const state = stateWith([transport]);
    state.transitLinks.train = { from: visit.id, to: 'destination' };
    expect(visitDay(state, visit, '2028-01-03').entries).toMatchObject([
      { direction: 'Depart', time: undefined, zone: undefined },
    ]);
    state.transitLinks.train = { from: 'origin', to: visit.id };
    expect(visitDay(state, visit, '2028-01-03').entries).toEqual([]);
    expect(visitDay(state, visit, '2028-01-04').entries).toMatchObject([
      { direction: 'Arrive', time: undefined },
    ]);
    state.records = [visit, { ...transport, schedule: { start: '2028-01-03' } }];
    expect(visitDay(state, visit, '2028-01-03').entries).toEqual([]);
  });

  it('does not treat an unarranged stay as coverage or include invalid intervals', () => {
    const state = stateWith([
      item('considering', 'stay', { start: '2027-12-29', end: '2028-01-06' }),
      item('invalid', 'event', { start: '2028-02-30' }),
    ]);
    expect(visitDay(state, visit, '2028-01-03').accommodation).toMatchObject({ missing: true });
    expect(visitDay(state, visit, '2028-02-30').entries).toEqual([]);
  });

  it('shows both real hotel-switch times separately from exclusive night coverage', () => {
    const projection = visitDay(initialCanvas('default'), visit, '2028-01-03');
    expect(projection.entries.filter((entry) => entry.stayBoundary)).toMatchObject([
      { record: { id: 'hotel' }, stayBoundary: 'Check-out', time: '11:00' },
      { record: { id: 'hotel-second' }, stayBoundary: 'Check-in', time: '14:00' },
    ]);
    expect(projection.accommodation?.stays.map((record) => record.id)).toEqual(['hotel-second']);
  });

  it('shows rental pickup and return only on their own dates and continuing hire between', () => {
    const state = stateWith([]);
    state.rentals = [
      {
        id: 'local',
        provider: 'Local hire',
        from: visit.id,
        to: visit.id,
        start: '2027-12-30',
        end: '2028-01-04',
        status: 'Reserved',
      },
    ];
    expect(visitDay(state, visit, '2027-12-29').rentals).toEqual([]);
    expect(visitDay(state, visit, '2027-12-30').rentals.map((entry) => entry.boundary)).toEqual([
      'Pickup',
    ]);
    expect(visitDay(state, visit, '2028-01-03').rentals.map((entry) => entry.boundary)).toEqual([
      'Continuing',
    ]);
    expect(visitDay(state, visit, '2028-01-04').rentals.map((entry) => entry.boundary)).toEqual([
      'Return',
    ]);
    expect(visitDay(state, visit, '2028-01-05').rentals).toEqual([]);
  });
});

describe('visitDayDates', () => {
  it('includes departure day and does not truncate long exact visits', () => {
    const dated = {
      ...visit,
      timing: { arrival: '2028-01-01', departure: '2028-12-31' },
    } satisfies TripRecord;
    const dates = visitDayDates(dated, stateWith([]));
    expect(dates).toHaveLength(366);
    expect(dates[0]).toBe('2028-01-01');
    expect(dates.at(-1)).toBe('2028-12-31');
  });

  it('derives absent bounds from retained records across a leap day', () => {
    const unknown = { ...visit, timing: undefined };
    const state = stateWith([
      item('retained', 'event', { start: '2028-02-28', end: '2028-03-01' }),
      { ...item('unrelated', 'event', { start: '2027-01-01' }), visitId: 'other' },
    ]);
    expect(visitDayDates(unknown, state)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(visitDayDates(unknown, stateWith([]))).toEqual([]);
  });

  it('does not assign intermediate flight-leg days to the arrival visit', () => {
    const state = initialCanvas('default');
    const arrival = state.records.find((record) => record.id === 'arrival');
    if (!arrival) throw new Error('Expected arrival visit');
    const unknown = { ...arrival, timing: undefined };
    state.records = state.records.filter(
      (record) => !record.visitId || record.kind === 'transport'
    );
    expect(visitDayDates(unknown, state)).toEqual(['2027-11-25']);
  });
});
