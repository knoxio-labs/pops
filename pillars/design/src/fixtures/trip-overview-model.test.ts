import { describe, expect, it } from 'vitest';

import { tripOverviewItems, tripOverviewRecords } from './trip-overview';
import { formatCityTiming, presentTripRecord, formatTripDate } from './trip-overview-format';
import { filterTripItems, isPurchasedArrangement, tripItemTier } from './trip-overview-model';

import type { TripOverviewItem, TripRecord } from './trip-overview-model';

function item(overrides: Partial<TripOverviewItem> = {}): TripOverviewItem {
  return {
    id: 'sample',
    title: 'Sample',
    kind: 'event',
    placeId: 'curitiba',
    where: 'Curitiba',
    when: '16 Dec',
    intention: 'In plan',
    arrangement: 'Not arranged',
    notes: '',
    ...overrides,
  };
}

describe('purchase constraints', () => {
  it.each(['transport', 'stay', 'event'] as const)('marks purchased %s as hard', (kind) => {
    const record = item({ kind, purchase: 'Purchased' });
    expect(isPurchasedArrangement(record)).toBe(true);
    expect(tripItemTier(record)).toBe('Purchased');
  });
  it.each(['city', 'person', 'idea', 'gap'] as const)(
    'never hardens %s from a purchase flag',
    (kind) => {
      expect(isPurchasedArrangement(item({ kind, purchase: 'Purchased' }))).toBe(false);
    }
  );
  it.each(['Booked', 'Agreed', 'Not arranged', 'Not needed'] as const)(
    'does not infer purchase from %s',
    (arrangement) => {
      expect(isPurchasedArrangement(item({ arrangement }))).toBe(false);
      expect(tripItemTier(item({ arrangement }))).toBe('Wanted · not purchased');
    }
  );
  it('keeps a reservation without payment soft', () => {
    const reservation = item({ kind: 'stay', arrangement: 'Booked' });
    expect(isPurchasedArrangement(reservation)).toBe(false);
    expect(tripItemTier(reservation)).toBe('Reserved · not purchased');
  });
  it('does not mark fixed birthday dates or city intentions purchased', () => {
    const birthday = tripOverviewItems.find((record) => record.id === 'birthday');
    const city = tripOverviewItems.find((record) => record.id === 'curitiba');
    expect(birthday).toBeDefined();
    expect(city).toBeDefined();
    expect(birthday && isPurchasedArrangement(birthday)).toBe(false);
    expect(city?.when).toBe('');
    expect(city && isPurchasedArrangement(city)).toBe(false);
  });
});

describe('automatic city detail', () => {
  it.each([
    [{}, 'Dates unset', ''],
    [{ month: { year: 2028, month: 1 } }, 'Approximate timing', 'Around January'],
    [{ afterVisitId: 'rio', beforeVisitId: 'sydney-return' }, 'Order only', ''],
    [{ departure: '2027-12-29' }, 'Planned dates', ' → 29 Dec'],
    [{ arrival: '2027-12-29', departure: '2028-01-06' }, 'Planned dates', '29 Dec → 6 Jan'],
  ] as const)('derives %s without hardening the visit', (timing, tier, label) => {
    const city = item({ kind: 'city', timing });
    expect(tripItemTier(city)).toBe(tier);
    expect(formatCityTiming(timing)).toBe(label);
    expect(isPurchasedArrangement(city)).toBe(false);
  });
  it('prefers supplied bounds to rough timing without inventing the missing bound', () => {
    expect(formatCityTiming({ arrival: '2027-11-25', month: { year: 2027, month: 11 } })).toBe(
      '25 Nov → '
    );
    expect(formatCityTiming({ afterVisitId: 'rio' })).toBe('');
    expect(formatCityTiming({ beforeVisitId: 'sydney-return' })).toBe('');
  });
});

describe('route search context', () => {
  it('retains the birthday city without adding unrelated cities', () => {
    expect(filterTripItems(tripOverviewItems, 'Birthday').map((record) => record.id)).toEqual([
      'curitiba',
      'birthday',
    ]);
  });
  it('retains the open segment for a matching alternative', () => {
    expect(filterTripItems(tripOverviewItems, 'Espírito Santo').map((record) => record.id)).toEqual(
      ['open-january', 'es']
    );
  });
  it('keeps the segment and city around an event in an alternative destination', () => {
    expect(
      filterTripItems(tripOverviewItems, 'Festival Horizonte').map((record) => record.id)
    ).toEqual(['open-january', 'minas', 'festival']);
  });
  it('handles no matches and blank searches', () => {
    expect(filterTripItems(tripOverviewItems, 'no-such-record')).toEqual([]);
    expect(filterTripItems(tripOverviewItems, '   ')).toBe(tripOverviewItems);
  });
});

describe('persisted fields and generated text', () => {
  it('does not store formatted dates or repeated location names in source records', () => {
    for (const record of tripOverviewRecords) {
      expect(Object.hasOwn(record, 'when')).toBe(false);
      expect(Object.hasOwn(record, 'where')).toBe(false);
    }
  });
  it('generates city labels and timing from references and ISO dates', () => {
    const record: TripRecord = {
      id: 'visit',
      kind: 'city',
      placeId: 'curitiba',
      timing: { arrival: '2027-12-14' },
      intention: 'In plan',
      arrangement: 'Not arranged',
      notes: '',
    };
    expect(presentTripRecord(record, [record])).toMatchObject({
      title: 'Curitiba',
      where: 'Curitiba',
      when: '14 Dec → ',
    });
  });
  it('formats month precision and numeric duration without a prose field', () => {
    expect(
      formatCityTiming({
        month: { year: 2028, month: 1, part: 'early' },
        duration: { min: 2, max: 3, unit: 'weeks' },
      })
    ).toBe('early January · 2–3 weeks');
  });
  it('derives stay nights across a year boundary and respects leap years', () => {
    const record: TripRecord = {
      id: 'stay',
      title: 'Hotel',
      kind: 'stay',
      placeId: 'curitiba',
      schedule: { start: '2027-12-29', end: '2028-01-03' },
      intention: 'In plan',
      arrangement: 'Booked',
      notes: '',
    };
    expect(presentTripRecord(record, []).when).toBe('29 Dec–3 Jan · 5 nights');
    expect(
      presentTripRecord({ ...record, schedule: { start: '2028-02-28', end: '2028-03-01' } }, [])
        .when
    ).toBe('28 Feb–1 Mar · 2 nights');
    expect(formatTripDate('2027-12-16')).toBe('16 Dec');
  });
  it('does not invent a location for an unresolved route reference', () => {
    expect(formatCityTiming({ afterVisitId: 'missing' })).toBe('');
  });
});

describe('generated trip identity', () => {
  it('uses the optional user name or the selected country and year', async () => {
    const { tripDisplayName, tripDateLabel, tripMetadata } = await import('./trip-metadata');
    expect(tripDisplayName(tripMetadata)).toBe('Brazil · 2027');
    expect(tripDisplayName({ ...tripMetadata, name: '  My trip  ' })).toBe('My trip');
    expect(tripDisplayName({ ...tripMetadata, name: '   ' })).toBe('Brazil · 2027');
    expect(tripDateLabel(tripMetadata)).toBe('24 Nov 2027');
    expect(tripDateLabel({ ...tripMetadata, returnDate: '2028-03-05' })).toBe(
      '24 Nov 2027 → 5 Mar'
    );
  });
});
