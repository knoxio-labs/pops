import { describe, expect, it } from 'vitest';

import {
  boundaryLabel,
  bucketFor,
  filteredRecords,
  parentTitle,
  placeTitle,
  tripTitle,
} from './model';

import type { Place, Trip, Visit } from '../api/types';
import type { HomeRecord } from './model';

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 1,
    name: null,
    destination: '',
    when: '',
    parentId: null,
    tagId: null,
    notes: '',
    sourceLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function visit(timing: Visit['timing'], id = 1): Visit {
  return {
    id,
    tripId: 1,
    placeId: id,
    revision: 0,
    timing,
    notes: '',
    sourceLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function record(visits: Visit[] | undefined, overrides: Partial<Trip> = {}): HomeRecord {
  return { trip: trip(overrides), visits };
}

const today = '2026-11-09';
const places: Place[] = [
  {
    id: 1,
    name: 'Montréal',
    sourceLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

describe('tripTitle', () => {
  it('uses trimmed name, destination and supplied display fallback without persisting it', () => {
    expect(tripTitle(trip({ name: ' Holiday ', destination: 'Elsewhere' }), 'Trip')).toBe(
      'Holiday'
    );
    expect(tripTitle(trip({ name: ' ', destination: ' France ' }), 'Trip')).toBe('France');
    const source = trip();
    expect(tripTitle(source, 'Voyage')).toBe('Voyage');
    expect(source.name).toBeNull();
  });
});

describe('bucketFor', () => {
  it.each([
    { timing: { arrival: today, departure: today }, expected: 'current' },
    { timing: { arrival: '2026-11-01', departure: today }, expected: 'current' },
    { timing: { arrival: today, departure: '2026-11-20' }, expected: 'current' },
    { timing: { arrival: '2026-11-10' }, expected: 'upcoming' },
    { timing: { departure: '2026-11-08' }, expected: 'past' },
    { timing: { arrival: '2026-11-08' }, expected: 'other' },
    { timing: { departure: '2026-11-10' }, expected: 'other' },
    { timing: { arrival: '2026-12-01', departure: '2026-10-01' }, expected: 'other' },
    { timing: {}, expected: 'other' },
  ])('classifies $timing as $expected', ({ timing, expected }) => {
    expect(bucketFor(record([visit(timing)]), today)).toBe(expected);
  });

  it('fails safely for invalid reference dates and treats invalid source bounds as unknown', () => {
    expect(bucketFor(record([visit({ arrival: '2026-11-10' })]), 'invalid')).toBe('other');
    expect(bucketFor(record([visit({ arrival: '2026-11-10' })]), '2026-02-30')).toBe('other');
    expect(
      bucketFor(record([visit({ arrival: '2026-02-30', departure: '2026-11-08' })]), today)
    ).toBe('past');
    expect(bucketFor(record([visit({ arrival: '2026-11-10', departure: 'invalid' })]), today)).toBe(
      'upcoming'
    );
    expect(boundaryLabel([visit({ arrival: '2026-02-30' })], 'en-AU')).toBe('… → …');
  });

  it('keeps unavailable and empty routes unknown without parsing When', () => {
    for (const visits of [undefined, []]) {
      expect(bucketFor(record(visits, { when: '2026-11-09 to 2026-11-10' }), today)).toBe('other');
    }
  });

  it('uses ordered outer endpoints instead of inner dates, extrema or sorting', () => {
    const visits = [
      visit({ departure: '2026-11-01' }, 8),
      visit({ arrival: '2026-11-01', departure: '2026-11-20' }, 1),
      visit({ arrival: '2026-11-20' }, 3),
    ];
    expect(bucketFor(record(visits), today)).toBe('other');
    expect(visits.map(({ id }) => id)).toEqual([8, 1, 3]);
  });
});

describe('filteredRecords', () => {
  it.each(['éTé', ' qUeBeC ', ' later ', 'pArEnT', 'montreal'])(
    'searches source text for %s',
    (query) => {
      const source = record([visit({})], {
        name: 'Été',
        destination: 'Québec',
        when: 'Later',
        parentId: 2,
      });
      expect(
        filteredRecords({
          records: [source],
          allTrips: [trip({ id: 2, name: 'Parent' })],
          places,
          query,
          bucket: 'all',
          referenceDate: today,
        })
      ).toEqual([source]);
    }
  );

  it('combines bucket and query filters without inventing unavailable source labels', () => {
    expect(
      filteredRecords({
        records: [record(undefined, { parentId: 3 })],
        allTrips: [],
        places: [],
        query: 'unavailable',
        bucket: 'all',
        referenceDate: today,
      })
    ).toEqual([]);
    const future = record([visit({ arrival: '2026-11-10' })], { name: 'Plan' });
    expect(
      filteredRecords({
        records: [future],
        allTrips: [],
        places: [],
        query: 'Plan',
        bucket: 'past',
        referenceDate: today,
      })
    ).toEqual([]);
    expect(
      filteredRecords({
        records: [future],
        allTrips: [],
        places: [],
        query: 'missing',
        bucket: 'upcoming',
        referenceDate: today,
      })
    ).toEqual([]);
    expect(
      filteredRecords({
        records: [future],
        allTrips: [],
        places: [],
        query: 'Plan',
        bucket: 'upcoming',
        referenceDate: today,
      })
    ).toEqual([future]);
  });

  it('orders actual instants across fractional precision and keeps equal instants stable', () => {
    const whole = record([], { id: 1, updatedAt: '2026-11-09T00:00:00Z' });
    const fraction = record([], { id: 2, updatedAt: '2026-11-09T00:00:00.500Z' });
    const equal = record([], { id: 3, updatedAt: '2026-11-09T00:00:00.000Z' });
    const invalid = record([], { id: 4, updatedAt: 'invalid' });
    const secondInvalid = record([], { id: 5, updatedAt: '' });
    const sources = [invalid, whole, fraction, equal, secondInvalid];
    expect(
      filteredRecords({
        records: sources,
        allTrips: [],
        places: [],
        query: '',
        bucket: 'all',
        referenceDate: today,
      })
    ).toEqual([fraction, whole, equal, invalid, secondInvalid]);
    expect(sources).toEqual([invalid, whole, fraction, equal, secondInvalid]);
  });

  it('sorts newest first, preserves tie order and does not mutate inputs', () => {
    const older = record([], { id: 1 });
    const newer = record([], { id: 2, updatedAt: '2026-11-09T00:00:00Z' });
    const tied = record([], { id: 3, updatedAt: newer.trip.updatedAt });
    const sources = [older, newer, tied];
    expect(
      filteredRecords({
        records: sources,
        allTrips: [],
        places: [],
        query: ' ',
        bucket: 'all',
        referenceDate: today,
      })
    ).toEqual([newer, tied, older]);
    expect(sources).toEqual([older, newer, tied]);
  });
});

describe('source labels', () => {
  it('formats date-only values in the explicit locale and preserves missing endpoints', () => {
    expect(boundaryLabel([visit({ arrival: today })], 'en-AU')).toBe('9 Nov 2026 → …');
    expect(boundaryLabel([visit({ departure: today })], 'en-US')).toBe('… → Nov 9, 2026');
    expect(boundaryLabel([visit({})], 'en-AU')).toBe('… → …');
    expect(boundaryLabel([], 'en-AU')).toBeUndefined();
    expect(boundaryLabel(undefined, 'en-AU')).toBeUndefined();
  });

  it('does not repair contradictory source dates', () => {
    expect(
      boundaryLabel([visit({ arrival: '2026-11-10', departure: '2026-11-01' })], 'en-AU')
    ).toBe('10 Nov 2026 → 1 Nov 2026');
  });

  it('resolves only available parent and place identities', () => {
    expect(
      parentTitle(trip({ parentId: 2 }), [trip({ id: 2, destination: 'Paris' })], 'Trip')
    ).toBe('Paris');
    expect(parentTitle(trip({ parentId: 2 }), [], 'Trip')).toBeUndefined();
    expect(placeTitle(1, places, 'Unavailable')).toBe('Montréal');
    expect(placeTitle(2, places, 'Unavailable')).toBe('Unavailable');
  });
});
