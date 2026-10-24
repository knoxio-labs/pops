import { describe, expect, it } from 'vitest';

import { routeIssues, transportIssues, transportMissing } from './canvas-issues';
import { initialCanvas } from './canvas-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';

function city(
  id: string,
  start: `${number}-${number}-${number}`,
  end: `${number}-${number}-${number}`
): TripRecord {
  return {
    id,
    kind: 'city',
    placeId: id,
    intention: 'In plan',
    arrangement: 'Not arranged',
    notes: '',
    timing: { arrival: start, departure: end },
  };
}
function state() {
  const result = initialCanvas('empty');
  result.records = [
    city('a', '2028-01-01', '2028-01-03'),
    city('b', '2028-01-03', '2028-01-05'),
    city('c', '2028-01-05', '2028-01-07'),
  ];
  result.order = ['a', 'journey', 'b', 'c'];
  result.records.push({
    id: 'journey',
    kind: 'transport',
    placeId: 'a',
    intention: 'In plan',
    arrangement: 'Booked',
    notes: '',
    schedule: { start: '2028-01-03' },
  });
  result.transitLinks = { journey: { from: 'a', to: 'b' } };
  return result;
}

describe('canvas route findings', () => {
  it('uses preview order and treats an exact shared boundary as valid without changing source dates', () => {
    const current = state();
    expect(routeIssues(current)).toEqual({});
    const before = structuredClone(current.records);
    current.order = ['b', 'journey', 'a', 'c'];
    expect(routeIssues(current)).toMatchObject({
      a: ['2028-01-01 < 2028-01-05'],
      b: ['2028-01-01 < 2028-01-05'],
    });
    expect(current.records).toEqual(before);
  });

  it('includes wanted event dates as soft bounds without converting them to purchased commitments', () => {
    const current = state();
    const b = current.records.find((record) => record.id === 'b');
    if (!b) throw new Error('Missing visit');
    b.timing = {};
    const wanted: TripRecord = {
      id: 'wanted',
      title: 'Wanted event',
      kind: 'event',
      placeId: 'b',
      visitId: 'b',
      intention: 'Considering',
      arrangement: 'Not arranged',
      notes: '',
      schedule: { start: '2028-01-02' },
    };
    current.records.push(wanted);
    expect(routeIssues(current)).toMatchObject({
      a: ['2028-01-02 < 2028-01-03'],
      b: ['2028-01-02 < 2028-01-03'],
    });
    expect(wanted.purchase).toBeUndefined();
    expect(wanted.intention).toBe('Considering');
    expect(wanted.arrangement).toBe('Not arranged');
  });

  it('reports invalid and reversed visit ranges', () => {
    const current = state();
    current.records[0] = city('a', '2028-01-05', '2028-01-03');
    expect(routeIssues(current).a).toContain('Arrival is after departure');
    current.records[0] = city('a', '2028-02-30', '2028-03-03');
    expect(routeIssues(current).a).toContain('Invalid visit date');
  });
});

describe('fixed transport constraints', () => {
  it('retains explicit links when moved between the wrong visits and detects date mismatches', () => {
    const current = state();
    const journey = current.records.find((record) => record.id === 'journey');
    if (!journey) throw new Error('Missing journey');
    expect(transportIssues(current, journey)).toEqual([]);
    current.order = ['a', 'b', 'journey', 'c'];
    expect(transportIssues(current, journey)).toEqual([
      'Transport does not connect these visits',
      '2028-01-03 ≠ 2028-01-05',
      '2028-01-03 ≠ 2028-01-05',
    ]);
    expect(current.transitLinks.journey).toEqual({ from: 'a', to: 'b' });
    journey.schedule = { start: '2028-01-05', end: '2028-01-04' };
    expect(transportIssues(current, journey)).toContain('Invalid transport date range');
  });

  it('reports missing links and off-route transport rather than comparing against arbitrary neighbours', () => {
    const current = state();
    const journey = current.records.find((record) => record.id === 'journey');
    if (!journey) throw new Error('Missing journey');
    current.order = ['a', 'b', 'c'];
    expect(transportIssues(current, journey)).toEqual(['Transport does not connect these visits']);
    current.transitLinks = {};
    expect(transportIssues(current, journey)).toEqual(['Transport endpoints are missing']);
  });
});

describe('transport coverage', () => {
  it.each(['Booked', 'Agreed'] as const)(
    'accepts %s journeys, but rejects unarranged or missing journeys',
    (arrangement) => {
      const current = state();
      const journey = current.records.find((record) => record.id === 'journey');
      if (!journey) throw new Error('Missing journey');
      journey.arrangement = arrangement;
      expect(transportMissing(current, 'a', 'b')).toBe(false);
      journey.arrangement = 'Not arranged';
      expect(transportMissing(current, 'a', 'b')).toBe(true);
      expect(transportMissing(current, 'missing', 'also-missing')).toBe(true);
      current.records = current.records.filter((record) => record.id !== 'journey');
      expect(transportMissing(current, 'a', 'b')).toBe(true);
    }
  );

  it('ignores same-place journeys but rejects reversed or absent route endpoints', () => {
    const current = state();
    const b = current.records.find((record) => record.id === 'b');
    if (!b) throw new Error('Missing visit');
    b.placeId = 'a';
    expect(transportMissing(current, 'a', 'b')).toBe(false);
    expect(transportMissing(current, 'c', 'a')).toBe(true);
    current.order = ['a'];
    expect(transportMissing(current, 'a', 'c')).toBe(true);
  });

  it.each(['Reserved', 'Purchased'] as const)(
    'accepts %s hires only inside their forward endpoint bounds',
    (status) => {
      const current = state();
      current.transitLinks = {};
      current.rentals = [
        {
          id: 'hire',
          provider: 'Car',
          from: 'a',
          to: 'c',
          start: '2028-01-01',
          end: '2028-01-07',
          status,
        },
      ];
      expect(transportMissing(current, 'a', 'b')).toBe(false);
      expect(transportMissing(current, 'b', 'c')).toBe(false);
      const rental = current.rentals[0];
      if (!rental) throw new Error('Missing hire');
      rental.to = 'missing';
      expect(transportMissing(current, 'a', 'b')).toBe(true);
      rental.from = 'missing';
      rental.to = 'c';
      expect(transportMissing(current, 'a', 'b')).toBe(true);
      rental.from = 'c';
      rental.to = 'a';
      expect(transportMissing(current, 'a', 'b')).toBe(true);
      rental.from = 'a';
      rental.to = 'c';
      rental.status = 'Considering';
      expect(transportMissing(current, 'a', 'b')).toBe(true);
    }
  );
});

describe('placed and dated transport coverage', () => {
  it('does not count retained transport that is absent or placed outside its linked visits', () => {
    const current = state();
    expect(transportMissing(current, 'a', 'b')).toBe(false);
    current.order = ['a', 'b', 'c'];
    expect(current.records.some((record) => record.id === 'journey')).toBe(true);
    expect(transportMissing(current, 'a', 'b')).toBe(true);
    current.order = ['a', 'b', 'journey', 'c'];
    expect(transportMissing(current, 'a', 'b')).toBe(true);
    current.order = ['a', 'journey', 'b', 'c'];
    expect(transportMissing(current, 'a', 'b')).toBe(false);
  });

  it('requires known departure and arrival dates inside the rental, including exact boundaries', () => {
    const current = state();
    current.transitLinks = {};
    current.rentals = [
      {
        id: 'hire',
        provider: 'Car',
        from: 'a',
        to: 'c',
        start: '2028-01-01',
        end: '2028-01-05',
        status: 'Reserved',
      },
    ];
    current.records[0] = city('a', '2027-12-20', '2028-01-01');
    current.records[1] = city('b', '2028-01-05', '2028-01-20');
    expect(transportMissing(current, 'a', 'b')).toBe(false);
    current.records[0] = city('a', '2027-12-20', '2027-12-29');
    current.records[1] = city('b', '2027-12-29', '2028-01-20');
    expect(transportMissing(current, 'a', 'b')).toBe(true);
    current.records[0] = city('a', '2028-01-01', '2028-01-06');
    current.records[1] = city('b', '2028-01-06', '2028-01-20');
    expect(transportMissing(current, 'a', 'b')).toBe(true);
  });

  it('checks intermediate visit bounds for multi-span coverage while retaining unknown-date coverage', () => {
    const current = state();
    current.transitLinks = {};
    current.rentals = [
      {
        id: 'hire',
        provider: 'Car',
        from: 'a',
        to: 'c',
        start: '2028-01-01',
        end: '2028-01-07',
        status: 'Purchased',
      },
    ];
    expect(transportMissing(current, 'a', 'c')).toBe(false);
    current.records[1] = city('b', '2028-01-03', '2028-01-08');
    expect(transportMissing(current, 'a', 'c')).toBe(true);
    current.records = current.records.map((record) =>
      record.kind === 'city' ? { ...record, timing: {} } : record
    );
    expect(transportMissing(current, 'a', 'c')).toBe(false);
  });
});
