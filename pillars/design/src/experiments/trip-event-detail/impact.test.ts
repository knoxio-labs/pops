import { describe, expect, it } from 'vitest';

import { moveCard } from '../trip-route-editing/canvas-actions';
import { initialCanvas } from '../trip-route-editing/canvas-model';
import { eventRouteImpact, eventVisitPlacement } from './impact';

import type { TripRecord } from '@/fixtures/trip-overview-model';

const city: TripRecord = {
  id: 'city',
  kind: 'city',
  placeId: 'place',
  intention: 'In plan',
  arrangement: 'Not needed',
  notes: '',
  timing: { arrival: '2028-01-21', departure: '2028-01-25' },
};
const event: TripRecord = {
  ...city,
  id: 'event',
  kind: 'event',
  visitId: city.id,
  timing: undefined,
  schedule: { start: '2028-01-22', end: '2028-01-24' },
};

function state() {
  return { ...initialCanvas('empty'), records: [city, event], order: [city.id] };
}

describe('eventRouteImpact', () => {
  it('surfaces arrival transport after inserting Minas without changing paid sources', () => {
    const source = initialCanvas('default');
    const festival = source.records.find((record) => record.id === 'festival');
    if (!festival) throw new Error('Expected the festival source fixture');
    const before = structuredClone(source.records);
    const moved = moveCard(source, 'minas', { after: 'recife' });
    const impact = eventRouteImpact(moved, festival);
    expect(impact.incomingMissingFrom).toBe('recife');
    expect(impact.missingTransport).toBe(false);
    for (const record of before.filter((record) => record.purchase === 'Purchased'))
      expect(moved.records.find((candidate) => candidate.id === record.id)).toEqual(record);
    expect(moved.records.find((record) => record.id === festival.id)).toEqual(festival);
  });

  it('does not invent incoming transport across an unresolved open segment', () => {
    const source = state();
    source.records.push(
      { ...city, id: 'previous', placeId: 'elsewhere' },
      { ...city, id: 'gap', kind: 'gap' }
    );
    source.order = ['previous', 'gap', city.id];
    expect(eventRouteImpact(source, event).incomingMissingFrom).toBeUndefined();
    source.order = ['previous', 'gap'];
    expect(eventRouteImpact(source, event).incomingMissingFrom).toBeUndefined();
  });
  it('checks partial event timing when the schedule has not been completed', () => {
    const partial: TripRecord = {
      ...event,
      schedule: undefined,
      timing: { departure: '2028-01-26' },
    };
    expect(eventRouteImpact(state(), partial).findings).toEqual([
      'Event ends after city departure.',
    ]);
    const arrival: TripRecord = { ...partial, timing: { arrival: '2028-01-20' } };
    expect(eventRouteImpact(state(), arrival).findings).toEqual([
      'Event starts before city arrival.',
    ]);
  });
  it('uses explicit association instead of matching title, place or intention', () => {
    const source = state();
    source.records.push({ ...city, id: 'another' });
    expect(eventRouteImpact(source, { ...event, visitId: 'missing' }).visit).toBeUndefined();
    expect(eventRouteImpact(source, event).visit?.id).toBe(city.id);
    expect(eventRouteImpact(source, event).placement).toBe('Working route');
  });

  it('reports explicit location and date conflicts without mutating purchased sources', () => {
    const purchased: TripRecord = {
      ...event,
      purchase: 'Purchased',
      placeId: 'elsewhere',
      schedule: { start: '2028-01-20', end: '2028-01-26', localTime: '20:00' },
    };
    const source = state();
    source.records[1] = purchased;
    const before = structuredClone(source);
    expect(eventRouteImpact(source, purchased).findings).toEqual([
      'Event location differs from the associated city.',
      'Event starts before city arrival.',
      'Event ends after city departure.',
    ]);
    expect(source).toEqual(before);
  });

  it('accepts date boundaries and catches reversed or invalid source ranges', () => {
    const boundary = {
      ...event,
      schedule: { start: '2028-01-21' as const, end: '2028-01-25' as const },
    };
    expect(eventRouteImpact(state(), boundary).findings).toEqual([]);
    expect(
      eventRouteImpact(state(), { ...event, schedule: { start: '2028-01-24', end: '2028-01-22' } })
        .findings
    ).toContain('Event ends before it starts.');
    expect(
      eventRouteImpact(state(), { ...event, schedule: { start: '2028-02-30' } }).findings
    ).toContain('Event contains an invalid date.');
  });

  it('counts accommodation only inside known visit bounds, never from event dates', () => {
    expect(eventRouteImpact(state(), event).gaps).toMatchObject([
      { start: '2028-01-21', end: '2028-01-25' },
    ]);
    const unknown = state();
    unknown.records[0] = { ...city, timing: {} };
    expect(eventRouteImpact(unknown, event).gaps).toEqual([]);
    unknown.records[0] = { ...city, timing: { arrival: '2028-01-21' } };
    expect(eventRouteImpact(unknown, event).gaps).toEqual([]);
  });

  it('keeps unbooked choices as gaps and excludes arranged coverage', () => {
    const source = state();
    const stay: TripRecord = {
      ...event,
      id: 'stay',
      kind: 'stay',
      arrangement: 'Not arranged',
      schedule: { start: '2028-01-21', end: '2028-01-25' },
    };
    source.records.push(stay);
    expect(eventRouteImpact(source, event).gaps).toHaveLength(1);
    source.records[source.records.length - 1] = { ...stay, arrangement: 'Booked' };
    expect(eventRouteImpact(source, event).gaps).toEqual([]);
  });

  it('selects relevant transport by endpoint and offers a slot only for a real root edge', () => {
    const source = state();
    const next = { ...city, id: 'next', placeId: 'elsewhere' };
    source.records.push(next);
    source.order.push(next.id);
    expect(eventRouteImpact(source, event).missingTransport).toBe(true);
    const transport: TripRecord = {
      ...event,
      id: 'train',
      kind: 'transport',
      arrangement: 'Booked',
    };
    source.records.push(transport);
    source.order.splice(1, 0, transport.id);
    source.transitLinks[transport.id] = { from: city.id, to: next.id };
    expect(eventRouteImpact(source, event).transport).toEqual([transport]);
    expect(eventRouteImpact(source, event).missingTransport).toBe(false);
    source.order = [next.id];
    expect(eventRouteImpact(source, event).missingTransport).toBe(false);
  });
});

describe('eventVisitPlacement', () => {
  it('uses only explicit flat route or alternative membership rather than intention', () => {
    const source = state();
    source.order = ['gap'];
    source.sections = [{ id: 'options', gapId: 'gap', title: 'Options', cards: [city.id] }];
    expect(eventVisitPlacement(source, city.id)).toBe('Alternative');
    expect(eventVisitPlacement(source, 'child')).toBe('Outside route');
    source.order = [];
    expect(eventVisitPlacement(source, city.id)).toBe('Outside route');
    source.order = [city.id];
    expect(eventVisitPlacement(source, city.id)).toBe('Working route');
    source.order = [];
    expect(eventVisitPlacement(source, city.id)).toBe('Outside route');
  });

  it('moves one alternative at an explicit anchor preserving bookings and other options', () => {
    const source = state();
    const gap: TripRecord = { ...city, id: 'gap', kind: 'gap', optionIds: [city.id, 'other'] };
    source.records.push(gap, { ...city, id: 'anchor' }, { ...city, id: 'other' });
    source.order = ['anchor', gap.id];
    source.sections = [
      { id: 'options', title: 'Options', gapId: gap.id, cards: [city.id, 'other'] },
    ];
    const moved = moveCard(source, city.id, { after: 'anchor' });
    expect(moved.order).toEqual(['anchor', city.id, gap.id]);
    expect(moved.sections[0]?.cards).toEqual(['other']);
    expect(moved.records.find((record) => record.id === event.id)).toEqual(event);
    expect(moved.records.find((record) => record.id === city.id)).toEqual(city);
  });
});
