import { describe, expect, it } from 'vitest';

import {
  journeyClockInstant,
  journeyDayBoundary,
  journeyElapsedMinutes,
  journeySourceDay,
} from '../journey-time.js';

describe('Explicit journey source clocks', () => {
  it('projects a supplied day independently of zone and never fabricates an instant or duration', () => {
    const source = { date: '2028-02-29', timeZone: 'Pacific/Kiritimati' };
    expect(journeySourceDay(source)).toEqual({ date: '2028-02-29', precision: 'day' });
    expect(journeySourceDay({ local: '2028-02-29T23:30' })).toEqual({
      date: '2028-02-29',
      precision: 'local',
    });
    expect(journeySourceDay({})).toEqual({ date: null, precision: 'unknown' });
    expect(journeyClockInstant(source)).toBeNull();
    expect(journeyElapsedMinutes(source, { date: '2028-03-01' })).toBeNull();
    expect(journeyDayBoundary(source, 1)).toBeNull();
  });
  it('resolves date-line and overnight endpoints from their independent source zones', () => {
    const departure = { local: '2028-01-15T10:00', timeZone: 'Australia/Sydney' };
    const arrival = { local: '2028-01-15T08:15', timeZone: 'America/Chicago' };
    expect(journeyClockInstant(departure)?.toString()).toBe('2028-01-14T23:00:00Z');
    expect(journeyClockInstant(arrival)?.toString()).toBe('2028-01-15T14:15:00Z');
    expect(journeyElapsedMinutes(departure, arrival)).toBe(915);
    expect(
      journeyElapsedMinutes(arrival, { local: '2028-01-16T09:00', timeZone: 'America/Chicago' })
    ).toBe(1485);
    expect(journeyElapsedMinutes(arrival, departure)).toBe(-915);
    expect(journeyElapsedMinutes(arrival, arrival)).toBe(0);
  });

  it.each([
    { local: '2028-03-12T02:30', timeZone: 'America/Chicago' },
    { local: '2028-11-05T01:30', timeZone: 'America/Chicago' },
    { local: '2024-10-06T02:15', timeZone: 'Australia/Lord_Howe' },
    { local: '2024-04-07T01:45', timeZone: 'Australia/Lord_Howe' },
    { local: '2011-12-30T10:00', timeZone: 'Pacific/Apia' },
  ])(
    'leaves skipped or repeated clocks unresolved without changing source $local in $timeZone',
    (source) => {
      Object.freeze(source);
      const before = { ...source };
      expect(journeyClockInstant(source)).toBeNull();
      expect(source).toEqual(before);
      expect(
        journeyElapsedMinutes(source, { local: '2028-01-01T10:00', timeZone: 'UTC' })
      ).toBeNull();
    }
  );

  it.each([
    {},
    { local: '2028-01-01T10:00' },
    { timeZone: 'UTC' },
    { local: '2028-02-30T10:00', timeZone: 'UTC' },
    { local: '2028-01-01T10:00', timeZone: 'Missing/Zone' },
    { local: '2028-01-01T10:00', timeZone: '+03:00' },
    { local: '2028-01-01T10:00Z', timeZone: 'UTC' },
    { local: '2028-01-01T10:00:00.1234567891', timeZone: 'UTC' },
  ])('does not infer an instant from incomplete, invalid or unsupported source %j', (source) => {
    expect(journeyClockInstant(source)).toBeNull();
  });

  it('preserves subsecond precision and accepts explicit non-hour IANA offsets', () => {
    expect(
      journeyClockInstant({ local: '2028-01-01T10:00:00.123456789', timeZone: 'UTC' })?.toString()
    ).toBe('2028-01-01T10:00:00.123456789Z');
    expect(
      journeyElapsedMinutes(
        { local: '2028-01-01T10:00:00.1', timeZone: 'UTC' },
        { local: '2028-01-01T10:00:00.6', timeZone: 'UTC' }
      )
    ).toBe(0.5 / 60);
    expect(
      journeyClockInstant({
        local: '2024-10-06T03:00',
        timeZone: 'Australia/Lord_Howe',
      })?.toString()
    ).toBe('2024-10-05T16:00:00Z');
  });

  it('resolves local-calendar boundaries across DST without adding fixed-length days', () => {
    const source = { local: '2028-03-12T10:00', timeZone: 'America/Chicago' };
    expect(journeyDayBoundary(source, -1)?.toString()).toBe('2028-03-11T06:00:00Z');
    expect(journeyDayBoundary(source, 2)?.toString()).toBe('2028-03-14T05:00:00Z');
    expect(
      journeyDayBoundary({ local: '2011-12-31T10:00', timeZone: 'Pacific/Apia' }, -1)
    ).toBeNull();
    expect(journeyDayBoundary({}, 1)).toBeNull();
    expect(
      journeyDayBoundary({ local: '2028-11-05T01:30', timeZone: 'America/Chicago' }, 1)
    ).toBeNull();
  });

  it('keeps boundary calendar years valid outside the source field’s four-digit year spelling', () => {
    expect(journeyDayBoundary({ local: '0000-01-01T10:00', timeZone: 'UTC' }, -1)?.toString()).toBe(
      '-000001-12-31T00:00:00Z'
    );
    expect(journeyDayBoundary({ local: '9999-12-31T10:00', timeZone: 'UTC' }, 2)?.toString()).toBe(
      '+010000-01-02T00:00:00Z'
    );
  });
});
