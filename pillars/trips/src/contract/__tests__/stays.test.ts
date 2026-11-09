import { describe, expect, it } from 'vitest';

import { StayInputSchema, StayTimingSchema } from '../stay-schemas.js';

describe('Stay source contracts', () => {
  it('accepts empty and independent partial facts without defaults or dependencies', () => {
    expect(StayInputSchema.parse({})).toEqual({});
    for (const source of [
      {},
      { arrival: '2028-02-29' },
      { departure: '0000-01-01' },
      { checkIn: '00:00' },
      { checkOut: '23:59' },
      { timeZone: 'UTC' },
      { arrival: '9999-12-31', departure: '0000-01-01' },
      { arrival: '2028-03-12', checkIn: '02:30', timeZone: 'America/Chicago' },
      { arrival: '2028-11-05', checkIn: '01:30', timeZone: 'America/Chicago' },
    ])
      expect(StayTimingSchema.parse(source)).toEqual(source);
  });

  it.each([
    { arrival: '2027-02-29' },
    { departure: '2028-02-30' },
    { arrival: '' },
    { checkIn: '24:00' },
    { checkOut: '12:60' },
    { checkIn: '9:00' },
    { checkIn: '12:30:00' },
    { checkOut: '12:30Z' },
    { checkOut: '' },
    { timeZone: '' },
    { timeZone: 'Missing/Zone' },
    { timeZone: '+03:00' },
  ])('rejects malformed typed timing %j without correcting the source', (timing) => {
    expect(StayInputSchema.safeParse({ timing }).success).toBe(false);
  });

  it('retains approved kind/status combinations without inferring purchase or arrangement', () => {
    for (const kind of [null, 'hotel', 'friend', 'family', 'other']) {
      for (const status of [null, 'Considering', 'Agreed', 'Reserved', 'Purchased']) {
        expect(StayInputSchema.parse({ kind, status })).toEqual({ kind, status });
      }
    }
    for (const source of [{ kind: 'hostel' }, { status: 'Booked' }, { name: '  ' }, { visitId: 0 }])
      expect(StayInputSchema.safeParse(source).success).toBe(false);
  });

  it('accepts opaque links in separate source arrays and nullable clearing', () => {
    const source = {
      visitId: null,
      name: null,
      kind: null,
      status: null,
      address: null,
      reference: null,
      sourceLinks: [{ uri: 'https://source.example/booking', label: 'Original source' }],
      hostLinks: [{ uri: 'pops:contacts/person/unavailable', label: 'Source host' }],
      documentLinks: [{ uri: 'pops:documents/document/unavailable' }],
      timing: {},
      notes: '',
    };
    expect(StayInputSchema.parse(source)).toEqual(source);
    for (const key of ['sourceLinks', 'hostLinks', 'documentLinks']) {
      expect(StayInputSchema.safeParse({ [key]: [{ uri: 'javascript:alert(1)' }] }).success).toBe(
        false
      );
    }
  });
});
