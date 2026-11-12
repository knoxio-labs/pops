import { describe, expect, it } from 'vitest';

import { JourneyLegSchema } from '../../contract/journey-schemas.js';
import { JourneyTimingSchema } from '../../contract/journey-timing.js';
import { deriveJourneyTiming } from '../journey-timing.js';

import type { JourneyLeg } from '../../contract/journey-schemas.js';

function leg(id: number, input: Partial<JourneyLeg> = {}): JourneyLeg {
  return JourneyLegSchema.parse({
    id,
    journeyId: 1,
    from: {},
    to: {},
    mode: null,
    intention: null,
    arrangement: null,
    purchase: null,
    operator: null,
    service: null,
    reference: null,
    notes: '',
    sourceLinks: [],
    createdAt: '2028-01-01T00:00:00Z',
    updatedAt: '2028-01-01T00:00:00Z',
    ...input,
  });
}
const endpoint = (local: string) => ({ local, timeZone: 'UTC' });

describe('Source-only journey timing projection', () => {
  it('retains day precision, including contradictory source days, without an instant, duration or window', () => {
    const source = leg(1, {
      from: { date: '2028-03-01', timeZone: 'Pacific/Kiritimati' },
      to: { date: '2028-02-29' },
    });
    const before = structuredClone(source);
    expect(deriveJourneyTiming(1, [source])).toEqual({
      journeyId: 1,
      legs: [
        {
          legId: 1,
          departure: null,
          arrival: null,
          elapsedMinutes: null,
          departureSource: { date: '2028-03-01', precision: 'day' },
          arrivalSource: { date: '2028-02-29', precision: 'day' },
        },
      ],
      connections: [],
      window: null,
      findings: [],
    });
    expect(source).toEqual(before);
  });
  it('derives signed elapsed and available time across the date line and overnight without mutating sources', () => {
    const legs = [
      leg(1, {
        mode: 'Explicit source mode',
        purchase: 'Purchased',
        reference: 'Source reference',
        from: { local: '2028-01-15T10:00', timeZone: 'Australia/Sydney' },
        to: { local: '2028-01-15T08:15', timeZone: 'America/Chicago' },
      }),
      leg(2, {
        from: { local: '2028-01-16T09:00', timeZone: 'America/Chicago' },
        to: { local: '2028-01-17T00:30', timeZone: 'America/Sao_Paulo' },
        sourceLinks: [{ uri: 'pops:documents/document/unavailable' }],
      }),
    ];
    const before = structuredClone(legs);
    Object.freeze(legs);
    legs.forEach(Object.freeze);
    const timing = JourneyTimingSchema.parse(deriveJourneyTiming(1, legs));
    expect(timing.legs.map((item) => item.elapsedMinutes)).toEqual([915, 750]);
    expect(timing.connections).toEqual([
      { previousLegId: 1, nextLegId: 2, availableMinutes: 1485 },
    ]);
    expect(timing.window).toEqual({
      from: '2028-01-13T13:00:00Z',
      toExclusive: '2028-01-19T03:00:00Z',
    });
    expect(timing.findings).toEqual([]);
    expect(legs).toEqual(before);
  });

  it('keeps empty and independently partial source clocks unknown without filler findings', () => {
    expect(deriveJourneyTiming(1, [])).toEqual({
      journeyId: 1,
      legs: [],
      connections: [],
      window: null,
      findings: [],
    });
    const timing = deriveJourneyTiming(1, [
      leg(1, { from: { local: '2028-01-01T10:00' }, to: { timeZone: 'UTC' } }),
      leg(2),
    ]);
    expect(timing.legs).toEqual([
      {
        legId: 1,
        departure: null,
        arrival: null,
        elapsedMinutes: null,
        departureSource: { date: '2028-01-01', precision: 'local' },
        arrivalSource: { date: null, precision: 'unknown' },
      },
      {
        legId: 2,
        departure: null,
        arrival: null,
        elapsedMinutes: null,
        departureSource: { date: null, precision: 'unknown' },
        arrivalSource: { date: null, precision: 'unknown' },
      },
    ]);
    expect(timing.connections[0]?.availableMinutes).toBeNull();
    expect(timing.window).toBeNull();
    expect(timing.findings).toEqual([]);
  });

  it.each(['2028-03-12T02:30', '2028-11-05T01:30', '2028-01-01T10:00:00.1234567891'])(
    'reports an unresolved complete clock %s without inventing a chronology',
    (local) => {
      const source = leg(1, {
        from: { local, timeZone: 'America/Chicago' },
        to: endpoint('2028-01-01T11:00'),
      });
      const timing = deriveJourneyTiming(1, [source]);
      expect(timing.legs[0]?.departure).toBeNull();
      expect(timing.legs[0]?.elapsedMinutes).toBeNull();
      expect(timing.window).toBeNull();
      expect(timing.findings).toEqual([
        {
          id: 'leg:1:from:clock',
          kind: 'conflict',
          code: 'clock_unresolved',
          legIds: [1],
          endpoint: 'from',
        },
      ]);
      expect(source.from.local).toBe(local);
    }
  );

  it('preserves reversed chronology and negative windows without sorting source legs or correcting clocks', () => {
    const first = leg(1, { from: endpoint('2028-01-20T10:00'), to: endpoint('2028-01-20T11:00') });
    const second = leg(2, { from: endpoint('2028-01-10T10:00'), to: endpoint('2028-01-10T09:00') });
    const timing = deriveJourneyTiming(1, [first, second]);
    expect(timing.legs[1]?.elapsedMinutes).toBe(-60);
    expect(timing.connections[0]?.availableMinutes).toBe(-14_460);
    expect(timing.window).toBeNull();
    expect(timing.findings.map((item) => item.code)).toEqual([
      'arrival_before_departure',
      'departure_before_previous_arrival',
    ]);
    expect(timing.findings[1]?.legIds).toEqual([1, 2]);
    expect(first.from.local).toBe('2028-01-20T10:00');
    expect(second.to.local).toBe('2028-01-10T09:00');
  });

  it('keeps adjacent zero availability nonconflicting and detects a one-nanosecond overlap', () => {
    const first = leg(1, { from: endpoint('2028-01-01T09:00'), to: endpoint('2028-01-01T10:00') });
    expect(
      deriveJourneyTiming(1, [first, leg(2, { from: first.to })]).connections[0]?.availableMinutes
    ).toBe(0);
    expect(deriveJourneyTiming(1, [first, leg(2, { from: first.to })]).findings).toEqual([]);
    const overlap = deriveJourneyTiming(1, [
      first,
      leg(2, { from: endpoint('2028-01-01T09:59:59.999999999') }),
    ]);
    expect(overlap.connections[0]?.availableMinutes).toBe(-1 / 60_000_000_000);
    expect(overlap.findings[0]?.code).toBe('departure_before_previous_arrival');
  });

  it('does not infer timing safety or transport/location semantics from source text, identity or purchase choices', () => {
    const first = leg(1, {
      from: endpoint('2028-01-01T09:00'),
      to: { ...endpoint('2028-01-01T10:00'), placeId: 1, sourceLabel: 'Airport' },
    });
    const second = leg(2, {
      from: { ...endpoint('2028-01-01T10:01'), placeId: 2, sourceLabel: 'Airport' },
    });
    const before = deriveJourneyTiming(1, [first, second]);
    const changed = deriveJourneyTiming(1, [
      { ...first, mode: 'flight', purchase: 'Purchased' },
      { ...second, mode: 'train', arrangement: 'Booked', from: { ...second.from, placeId: 1 } },
    ]);
    expect(changed).toEqual(before);
    expect(before.findings).toEqual([]);
    expect(before.connections[0]?.availableMinutes).toBe(1);
  });

  it('derives local-calendar window boundaries across DST and preserves unresolved skipped-midnight boundaries', () => {
    const timed = leg(1, {
      from: { local: '2028-03-12T10:00', timeZone: 'America/Chicago' },
      to: { local: '2028-03-12T11:00', timeZone: 'America/Chicago' },
    });
    expect(deriveJourneyTiming(1, [timed]).window).toEqual({
      from: '2028-03-11T06:00:00Z',
      toExclusive: '2028-03-14T05:00:00Z',
    });
    const skipped = leg(2, {
      from: { local: '2011-12-31T10:00', timeZone: 'Pacific/Apia' },
      to: { local: '2011-12-31T11:00', timeZone: 'Pacific/Apia' },
    });
    expect(deriveJourneyTiming(1, [skipped]).window).toBeNull();
    expect(deriveJourneyTiming(1, [skipped]).legs[0]?.elapsedMinutes).toBe(60);
  });

  it.each(['0000-01-01T10:00', '9999-12-31T10:00'])(
    'projects boundary calendar year %s without imposing an invented source range',
    (local) => {
      const projection = deriveJourneyTiming(1, [
        leg(1, { from: endpoint(local), to: endpoint(local) }),
      ]);
      expect(projection.window).not.toBeNull();
      expect(JourneyTimingSchema.parse(projection)).toEqual(projection);
    }
  );
});
