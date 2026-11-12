import { describe, expect, it } from 'vitest';

import {
  JourneyBuffersSchema,
  JourneyEndpointSchema,
  JourneyEndpointInputSchema,
  JourneyInputSchema,
  JourneyLegInputSchema,
} from '../journey-schemas.js';

describe('Journey source contracts', () => {
  it('accepts empty and independent partial endpoint facts without selecting missing values', () => {
    expect(JourneyInputSchema.parse({})).toEqual({});
    expect(JourneyLegInputSchema.parse({})).toEqual({});
    for (const source of [
      {},
      { placeId: 1 },
      { date: '2028-02-29' },
      { local: '2028-01-01T10:00' },
      { timeZone: 'UTC' },
      { sourceLabel: 'Source location', sourceLinks: [{ uri: 'pops:documents/document/42' }] },
    ])
      expect(JourneyEndpointSchema.parse(source)).toEqual(source);
  });

  it('distinguishes omitted, cleared and day-only writes without defaulting precision', () => {
    expect(JourneyEndpointInputSchema.parse({})).toEqual({});
    expect(JourneyEndpointInputSchema.parse({ date: null })).toEqual({ date: null });
    expect(JourneyEndpointInputSchema.parse({ date: '2028-02-29', timeZone: 'UTC' })).toEqual({
      date: '2028-02-29',
      timeZone: 'UTC',
    });
    expect(JourneyEndpointInputSchema.parse({ date: null, local: '2028-02-29T12:30' })).toEqual({
      date: null,
      local: '2028-02-29T12:30',
    });
    for (const date of ['2027-02-29', '2028-02-30', '2028-02-29T12:30', ''])
      expect(JourneyEndpointInputSchema.safeParse({ date }).success).toBe(false);
    expect(JourneyEndpointSchema.safeParse({ date: null }).success).toBe(false);
    for (const schema of [JourneyEndpointSchema, JourneyEndpointInputSchema])
      expect(schema.safeParse({ date: '2028-02-29', local: '2028-02-29T12:30' }).success).toBe(
        false
      );
  });

  it.each(['2028-02-29T10:00', '2028-01-01T23:59:59.123', '2028-03-12T02:30', '2028-11-05T01:30'])(
    'retains valid local source clock %s including unresolved DST gaps and overlaps',
    (local) => {
      expect(JourneyEndpointSchema.parse({ local, timeZone: 'America/Chicago' })).toEqual({
        local,
        timeZone: 'America/Chicago',
      });
    }
  );

  it.each([
    '2027-02-29T10:00',
    '2028-02-30T10:00',
    '2028-01-01T24:00',
    '2028-01-01T10:60',
    '2028-01-01T10:00Z',
    '2028-01-01T10:00+03:00',
    '2028-01-01',
    '',
  ])('rejects malformed or impossible typed source clock %s', (local) => {
    expect(JourneyEndpointSchema.safeParse({ local }).success).toBe(false);
  });

  it.each(['', 'Missing/Zone', '+03:00'])(
    'rejects invalid IANA zone %s without selecting a replacement',
    (timeZone) => {
      expect(JourneyEndpointSchema.safeParse({ timeZone }).success).toBe(false);
    }
  );

  it('retains every reservation and purchase combination without inferring intent or hardening a journey', () => {
    for (const arrangement of ['Booked', 'Agreed', 'Not arranged', 'Not needed']) {
      for (const purchase of [null, 'Purchased']) {
        const source = { arrangement, purchase };
        expect(JourneyLegInputSchema.parse(source)).toEqual(source);
      }
    }
    expect(
      JourneyLegInputSchema.parse({
        intention: 'Alternative',
        purchase: 'Purchased',
        mode: 'Any explicit transport',
      })
    ).toEqual({ intention: 'Alternative', purchase: 'Purchased', mode: 'Any explicit transport' });
    expect(JourneyLegInputSchema.safeParse({ mode: '  ' }).success).toBe(false);
    expect(JourneyLegInputSchema.safeParse({ purchase: false }).success).toBe(false);
    expect(JourneyLegInputSchema.safeParse({ arrangement: 'Reserved' }).success).toBe(false);
  });

  it('requires physical nonnegative configured minutes and has no implicit thresholds', () => {
    expect(JourneyBuffersSchema.parse({})).toEqual({});
    expect(
      JourneyBuffersSchema.parse({ minimumConnectionMinutes: 0, airportBufferMinutes: 0.5 })
    ).toEqual({ minimumConnectionMinutes: 0, airportBufferMinutes: 0.5 });
    for (const value of [-1, Infinity, NaN])
      expect(JourneyBuffersSchema.safeParse({ minimumConnectionMinutes: value }).success).toBe(
        false
      );
  });
});
