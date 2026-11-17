import { describe, expect, it } from 'vitest';

import {
  BookingReviewedTargetSchema,
  type BookingReviewedTarget,
} from '../booking-import-values.js';

describe('Reviewed booking targets', () => {
  it('retains explicitly ordered Journey legs and their independent source facts', () => {
    const target: BookingReviewedTarget = {
      mode: 'createJourney',
      input: { name: 'Two-stage journey', reference: 'SOURCE-42' },
      legs: [
        {
          mode: 'Rail',
          from: { sourceLabel: 'Harbour station', date: '2028-02-29' },
          to: { placeId: 7 },
          arrangement: 'Booked',
          purchase: null,
        },
        {
          mode: 'Ferry',
          from: { local: '2028-03-01T10:15', timeZone: 'UTC' },
          to: { sourceLabel: 'Island pier' },
          intention: 'Alternative',
          purchase: 'Purchased',
          reference: 'TICKET-8',
        },
      ],
    };

    expect(BookingReviewedTargetSchema.parse(target)).toEqual(target);
  });

  it('preserves omitted, empty and partial legs without filling missing facts', () => {
    for (const target of [
      { mode: 'createJourney', input: {} },
      { mode: 'createJourney', input: {}, legs: [] },
      { mode: 'createJourney', input: {}, legs: [{}, { from: { date: null } }] },
    ]) {
      expect(BookingReviewedTargetSchema.parse(target)).toEqual(target);
    }
  });

  it.each([
    { mode: '  ' },
    { from: { placeId: 0 } },
    { from: { date: '2027-02-29' } },
    { from: { local: '2028-02-29T24:00' } },
    { from: { date: '2028-02-29', local: '2028-02-29T10:00' } },
    { to: { timeZone: 'Missing/Zone' } },
    { arrangement: 'Reserved' },
    { purchase: true },
  ])('rejects invalid Journey leg facts rather than dropping them: %j', (leg) => {
    expect(
      BookingReviewedTargetSchema.safeParse({
        mode: 'createJourney',
        input: {},
        legs: [leg],
      }).success
    ).toBe(false);
  });

  it('preserves the existing Event, Stay and exact-link target variants', () => {
    for (const target of [
      {
        mode: 'createEvent',
        input: { name: 'Performance', timing: { start: '2028-02-29' }, purchase: null },
      },
      {
        mode: 'createStay',
        input: { name: 'Harbour stay', timing: { arrival: '2028-02-29' }, status: null },
      },
      ...['event', 'journey', 'stay'].map((kind) => ({
        mode: 'existing',
        target: { kind, id: 42 },
      })),
    ]) {
      expect(BookingReviewedTargetSchema.parse(target)).toEqual(target);
    }

    expect(
      BookingReviewedTargetSchema.safeParse({
        mode: 'existing',
        target: { kind: 'journey', id: 0 },
      }).success
    ).toBe(false);
  });
});
