import { describe, expect, it } from 'vitest';

import { canvasCalendar } from './canvas-calendar';
import { initialCanvas } from './canvas-model';
import { localDateTime, zonedInstant } from './canvas-zoned-time';

describe('IANA wall-clock conversion', () => {
  it('formats the actual instant in its declared zone rather than slicing a stale source offset', () => {
    expect(localDateTime('2028-06-15T10:00:00+11:00', 'Australia/Sydney')).toBe('2028-06-15T09:00');
    expect(localDateTime('2028-01-15T10:00:00+11:00', 'Australia/Sydney')).toBe('2028-01-15T10:00');
  });

  it.each([
    ['2028-01-15T10:00', 'Australia/Sydney', '2028-01-15T10:00:00+11:00'],
    ['2028-06-15T10:00', 'Australia/Sydney', '2028-06-15T10:00:00+10:00'],
    ['2028-01-15T09:00', 'America/Chicago', '2028-01-15T09:00:00-06:00'],
    ['2028-06-15T09:00', 'America/Chicago', '2028-06-15T09:00:00-05:00'],
    ['2028-03-12T01:30', 'America/Chicago', '2028-03-12T01:30:00-06:00'],
    ['2028-03-12T03:30', 'America/Chicago', '2028-03-12T03:30:00-05:00'],
  ])('resolves %s in %s', (local, zone, expected) => {
    expect(zonedInstant(local, zone)).toBe(expected);
  });

  it.each([
    ['2028-03-12T02:30', 'America/Chicago'],
    ['2028-10-01T02:30', 'Australia/Sydney'],
    ['2028-11-05T01:30', 'America/Chicago'],
    ['2028-02-30T10:00', 'Australia/Sydney'],
    ['', 'Australia/Sydney'],
    ['2028-01-15T10:00', 'Missing/Zone'],
  ])('rejects invalid, skipped or ambiguous %s in %s', (local, zone) => {
    expect(zonedInstant(local, zone)).toBeUndefined();
  });

  it('recomputes each flight endpoint offset independently when source dates cross DST seasons', () => {
    const state = initialCanvas('default');
    const source = state.records.find((record) => record.id === 'flight');
    if (!source) throw new Error('Missing outbound flight');
    source.schedule = { start: '2028-06-15', end: '2028-06-16' };
    const bookings = canvasCalendar(state);
    expect(bookings.find((booking) => booking.id === 'outbound-syd-dfw')).toMatchObject({
      startAt: '2028-06-15T10:00:00+10:00',
      endAt: '2028-06-15T08:15:00-05:00',
    });
    expect(bookings.find((booking) => booking.id === 'outbound-dfw-gru')).toMatchObject({
      startAt: '2028-06-15T09:00:00-05:00',
      endAt: '2028-06-16T00:30:00-03:00',
    });
  });
});
