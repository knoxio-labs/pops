import { describe, expect, it } from 'vitest';

import {
  CalendarDateSchema,
  CreateTripBody,
  SourceLinkSchema,
  VisitTimingSchema,
} from '../schemas.js';

describe('Trips source contracts', () => {
  it.each(['2028-02-29', '2028-12-31'])('accepts real calendar date %s', (value) => {
    expect(CalendarDateSchema.parse(value)).toBe(value);
  });

  it.each([
    '2027-02-29',
    '2028-02-30',
    '2028-13-01',
    '2028-01-00',
    '2028-1-1',
    '2028-01-01T00:00Z',
  ])('rejects invalid calendar date %s', (value) => {
    expect(CalendarDateSchema.safeParse(value).success).toBe(false);
  });

  it('retains absent, single-bound, approximate and contradictory source timing', () => {
    for (const timing of [
      {},
      { arrival: '2028-01-20' },
      { departure: '2028-01-10' },
      {
        month: { year: 2028, month: 1, part: 'late' },
        duration: { min: 1.5, max: 4, unit: 'weeks' },
      },
      { arrival: '2028-01-20', departure: '2028-01-10', month: { year: 2028, month: 2 } },
    ])
      expect(VisitTimingSchema.parse(timing)).toEqual(timing);
    expect(CreateTripBody.parse({})).toEqual({});
  });

  it.each([
    { month: { year: 2028, month: 0 } },
    { month: { year: 2028, month: 13 } },
    { month: { year: 2028, month: 1.5 } },
    { month: { year: 2028.5, month: 1 } },
    { duration: { min: 3, max: 2, unit: 'days' } },
    { duration: { min: 0, max: 2, unit: 'days' } },
    { duration: { min: 1, max: 2, unit: 'months' } },
  ])('rejects malformed approximate timing %j', (timing) => {
    expect(VisitTimingSchema.safeParse(timing).success).toBe(false);
  });

  it.each([
    'https://source.example/booking',
    'http://source.example',
    'pops:documents/document/42',
    'pops:contacts/entity/a-b',
  ])('retains explicit source URI %s', (uri) => {
    expect(SourceLinkSchema.parse({ uri })).toEqual({ uri });
  });

  it.each([
    'javascript:alert(1)',
    'file:///private/file',
    '/relative',
    'pops:documents/42',
    'pops:documents/document/white space',
  ])('rejects unsupported source URI %s', (uri) => {
    expect(SourceLinkSchema.safeParse({ uri }).success).toBe(false);
  });
});
