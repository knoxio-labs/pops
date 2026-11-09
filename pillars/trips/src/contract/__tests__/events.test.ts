import { describe, expect, it } from 'vitest';

import { EventInputSchema, EventTimingSchema } from '../event-schemas.js';

describe('Event source contract', () => {
  it('retains independent date, clock, zone and purchase facts without completing them', () => {
    expect(EventInputSchema.parse({})).toEqual({});
    expect(EventInputSchema.parse({ intention: 'Considering', purchase: 'Purchased' })).toEqual({
      intention: 'Considering',
      purchase: 'Purchased',
    });
    expect(EventTimingSchema.parse({ start: '2028-02-29' })).toEqual({ start: '2028-02-29' });
    expect(EventTimingSchema.parse({ startTime: '01:30', timeZone: 'America/Chicago' })).toEqual({
      startTime: '01:30',
      timeZone: 'America/Chicago',
    });
    expect(EventTimingSchema.parse({ start: '2028-03-01', end: '2028-02-29' })).toEqual({
      start: '2028-03-01',
      end: '2028-02-29',
    });
  });

  it.each([
    { name: ' ' },
    { visitId: 0 },
    { timing: { start: '2027-02-29' } },
    { timing: { startTime: '24:00' } },
    { timing: { endTime: '12:60' } },
    { timing: { timeZone: 'Not/AZone' } },
    { purchase: 'Reserved' },
    { intention: 'Purchased' },
    { sourceUrl: 'javascript:alert(1)' },
    { ticketUrl: 'pops:documents/document/1' },
    { venueLinks: [{ uri: 'not a URI' }] },
  ])('rejects invalid source value %j', (input) => {
    expect(EventInputSchema.safeParse(input).success).toBe(false);
  });

  it('allows clearing links, timing and nullable facts independently', () => {
    const input = { visitId: null, purchase: null, ticketUrl: null, timing: {}, venueLinks: [] };
    expect(EventInputSchema.parse(input)).toEqual(input);
  });
});
