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
      { duration: { min: 0, unit: 'days' } },
      { duration: { max: 1.5, unit: 'weeks' } },
      {
        month: { year: 2028, month: 1, part: 'late' },
        duration: { min: 1.5, max: 4, unit: 'weeks' },
      },
      { arrival: '2028-01-20', departure: '2028-01-10', month: { year: 2028, month: 2 } },
    ])
      expect(VisitTimingSchema.parse(timing)).toEqual(timing);
    expect(CreateTripBody.parse({})).toEqual({});
  });

  it('accepts zero duration and the upper month boundary without borrowing editor limits', () => {
    const timing = { month: { year: 2028, month: 12 }, duration: { min: 0, max: 0, unit: 'days' } };
    expect(VisitTimingSchema.parse(timing)).toEqual(timing);
  });

  it.each([
    { month: { year: 2028, month: 0 } },
    { month: { year: 2028, month: 13 } },
    { month: { year: 2028, month: 1.5 } },
    { month: { year: 2028.5, month: 1 } },
    { duration: { min: 3, max: 2, unit: 'days' } },
    { duration: { min: -1, max: 2, unit: 'days' } },
    { duration: { unit: 'days' } },
    { duration: { min: -1, unit: 'days' } },
    { duration: { max: -1, unit: 'days' } },
    { duration: { min: Infinity, unit: 'days' } },
    { duration: { max: Infinity, unit: 'days' } },
    { duration: { min: NaN, unit: 'days' } },
    { duration: { max: NaN, unit: 'days' } },
    { duration: { min: 1 } },
    { duration: { max: 1 } },
    { duration: { min: '1', unit: 'days' } },
    { duration: { max: null, unit: 'days' } },
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
