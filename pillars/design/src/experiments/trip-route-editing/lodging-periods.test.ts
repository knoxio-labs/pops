import { describe, expect, it } from 'vitest';

import { accommodationPeriods } from './lodging-periods';

import type { TripDate, TripRecord } from '@/fixtures/trip-overview-model';

const visit: TripRecord = {
  id: 'visit',
  kind: 'city',
  placeId: 'city',
  intention: 'In plan',
  arrangement: 'Not needed',
  notes: '',
  timing: { arrival: '2026-05-01', departure: '2026-05-08' },
};

function stay(id: string, start: TripDate, end: TripDate): TripRecord {
  return {
    ...visit,
    id,
    kind: 'stay',
    visitId: visit.id,
    arrangement: 'Booked',
    schedule: { start, end },
    timing: undefined,
  };
}

function event(id: string, schedule?: TripRecord['schedule']): TripRecord {
  return { ...visit, id, kind: 'event', visitId: visit.id, schedule, timing: undefined };
}

describe('accommodationPeriods', () => {
  it('retains dated arrangements outside the visit in a flagged conflict period', () => {
    const outsideStay = stay('outside', '2026-05-09', '2026-05-10');
    const concert = {
      ...event('concert', { start: '2026-05-11' }),
      purchase: 'Purchased' as const,
    };
    const periods = accommodationPeriods(visit, [outsideStay, concert]);
    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ start: '2026-05-01', end: '2026-05-08', missing: true });
    expect(periods[1]).toMatchObject({
      stays: [outsideStay],
      activities: [concert],
      conflict: true,
      missing: false,
    });
    expect(periods[1]?.activities[0]).toBe(concert);
  });

  it('rolls day-only activities across leap days and month boundaries', () => {
    const leapVisit: TripRecord = {
      ...visit,
      timing: { arrival: '2028-02-28', departure: '2028-03-02' },
    };
    const beforeSwitch = stay('before', '2028-02-28', '2028-03-01');
    const afterSwitch = stay('after', '2028-03-01', '2028-03-02');
    const leapDay = event('leap-day', { start: '2028-02-29' });
    const periods = accommodationPeriods(leapVisit, [beforeSwitch, afterSwitch, leapDay]);
    expect(periods.map((period) => period.activities.map((item) => item.id))).toEqual([
      ['leap-day'],
      [],
    ]);
  });

  it('exposes beginning, internal and ending gaps around booked or agreed stays without purchase', () => {
    const first = stay('first', '2026-05-02', '2026-05-03');
    const second: TripRecord = {
      ...stay('second', '2026-05-04', '2026-05-05'),
      arrangement: 'Agreed',
    };
    const periods = accommodationPeriods(visit, [first, second]);
    expect(periods.map(({ start, end, missing }) => [start, end, missing])).toEqual([
      ['2026-05-01', '2026-05-02', true],
      ['2026-05-02', '2026-05-03', false],
      ['2026-05-03', '2026-05-04', true],
      ['2026-05-04', '2026-05-05', false],
      ['2026-05-05', '2026-05-08', true],
    ]);
    expect(periods[1]?.stays[0]).toBe(first);
    expect(periods[3]?.stays[0]).toBe(second);
  });

  it('assigns checkout-day activity to the next stay and splits overlapping stays', () => {
    const first = stay('first', '2026-05-01', '2026-05-04');
    const second = stay('second', '2026-05-04', '2026-05-08');
    const checkout = event('checkout', { start: '2026-05-04' });
    const before = event('before', { start: '2026-05-03' });
    const spanning = event('spanning', { start: '2026-05-03', end: '2026-05-05' });
    const periods = accommodationPeriods(visit, [first, second, checkout, before, spanning]);
    expect(periods.map((period) => period.activities.map((item) => item.id))).toEqual([
      ['before', 'spanning'],
      ['checkout', 'spanning'],
    ]);
    expect(periods.every((period) => !period.overlap && !period.missing)).toBe(true);
    const overlapping = accommodationPeriods(visit, [
      first,
      stay('overlap', '2026-05-03', '2026-05-08'),
    ]);
    expect(overlapping.map((period) => period.overlap)).toEqual([false, true, false]);
    expect(overlapping[1]?.stays.map((item) => item.id)).toEqual(['first', 'overlap']);
  });

  it('preserves unarranged options without counting them as coverage or overlaps', () => {
    const option: TripRecord = {
      ...stay('option', '2026-05-01', '2026-05-08'),
      arrangement: 'Not arranged',
    };
    expect(accommodationPeriods(visit, [option])[0]).toMatchObject({
      stays: [option],
      missing: true,
      overlap: false,
    });
    expect(
      accommodationPeriods(visit, [option, stay('booked', '2026-05-01', '2026-05-08')])[0]
    ).toMatchObject({ missing: false, overlap: false });
  });

  it('retains unknown visit bounds and shows only known bounded gaps between stays', () => {
    const unknown = { ...visit, timing: undefined };
    expect(accommodationPeriods(unknown, [])).toEqual([
      {
        id: 'visit:unknown:unknown',
        start: undefined,
        end: undefined,
        stays: [],
        activities: [],
        missing: true,
        overlap: false,
      },
    ]);
    const records = [
      stay('first', '2026-05-02', '2026-05-03'),
      stay('second', '2026-05-04', '2026-05-05'),
    ];
    expect(
      accommodationPeriods(unknown, records).map(({ start, end, missing }) => [start, end, missing])
    ).toEqual([
      ['2026-05-02', '2026-05-03', false],
      ['2026-05-03', '2026-05-04', true],
      ['2026-05-04', '2026-05-05', false],
    ]);
  });

  it('keeps partial visit bounds and clips stays to the known visit window', () => {
    expect(
      accommodationPeriods({ ...visit, timing: { arrival: '2026-05-01' } }, [
        stay('stay', '2026-05-02', '2026-05-03'),
      ]).map(({ start, end }) => [start, end])
    ).toEqual([
      ['2026-05-01', '2026-05-02'],
      ['2026-05-02', '2026-05-03'],
    ]);
    expect(
      accommodationPeriods({ ...visit, timing: { departure: '2026-05-08' } }, []).map(
        ({ start, end }) => [start, end]
      )
    ).toEqual([[undefined, '2026-05-08']]);
    const bounded: TripRecord = {
      ...visit,
      timing: { arrival: '2026-05-02', departure: '2026-05-04' },
    };
    expect(
      accommodationPeriods(bounded, [stay('stay', '2026-05-01', '2026-05-08')])[0]
    ).toMatchObject({ start: '2026-05-02', end: '2026-05-04', missing: false });
  });

  it('does not let invalid dates or zero and reversed stay ranges supply coverage', () => {
    const invalid = stay('invalid', '2026-02-30', '2026-05-08');
    const records = [
      invalid,
      stay('zero', '2026-05-02', '2026-05-02'),
      stay('reversed', '2026-05-04', '2026-05-03'),
    ];
    const periods = accommodationPeriods(visit, records);
    expect(periods[0]).toMatchObject({
      start: '2026-05-01',
      end: '2026-05-08',
      stays: [],
      missing: true,
    });
    expect(periods[1]).toMatchObject({ stays: records, missing: true, overlap: false });
    expect(
      accommodationPeriods(
        { ...visit, timing: { arrival: '2026-05-08', departure: '2026-05-01' } },
        []
      )[0]
    ).toMatchObject({ start: undefined, end: undefined });
  });

  it('separates undated and invalid activities and excludes transport and other visits', () => {
    const unscheduled = event('undated');
    const invalid = event('invalid', { start: '2026-05-04', end: '2026-05-03' });
    const transport: TripRecord = { ...event('transport'), kind: 'transport' };
    const other = { ...stay('other', '2026-05-01', '2026-05-08'), visitId: 'other' };
    const periods = accommodationPeriods(visit, [
      unscheduled,
      invalid,
      transport,
      other,
      { ...event('other-event'), visitId: 'other' },
    ]);
    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ stays: [], activities: [], missing: true });
    expect(periods[1]).toMatchObject({
      stays: [],
      activities: [unscheduled, invalid],
      missing: false,
    });
    expect(periods[1]?.start).toBeUndefined();
    expect(periods[1]?.end).toBeUndefined();
    expect(new Set(periods.map((period) => period.id)).size).toBe(periods.length);
  });
});
