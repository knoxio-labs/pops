import { describe, expect, it } from 'vitest';

import { MobileTripDetailV2Schema } from '../../../contract/mobile-trips-detail-schemas.js';
import { MobileJourneyEndpointV2Schema } from '../../../contract/mobile-trips-journey-schemas.js';
import { MobileVisitTimingSchema } from '../../../contract/mobile-trips-schemas.js';
import { tripsFixture, tripsEventFixture } from './fixtures.js';
import { tripsClientOver } from './gateway.js';

describe('reader-first source alignment', () => {
  it('preserves Journey day-only precision through the actual reader without a clock or zone', async () => {
    const detail = MobileTripDetailV2Schema.parse(tripsFixture());
    const leg = detail.journeys[0]?.legs[0];
    if (!leg) throw new Error('Missing fixture leg');
    leg.from = { date: '2028-02-29' };
    leg.to = { date: '2028-03-01', timeZone: 'Pacific/Kiritimati' };
    const result = await tripsClientOver(detail).client.getTrip(7);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected canonical source snapshot');
    expect(result.value.journeys[0]?.legs[0]?.from).toEqual({ date: '2028-02-29' });
    expect(result.value.journeys[0]?.legs[0]?.to).toEqual({
      date: '2028-03-01',
      timeZone: 'Pacific/Kiritimati',
    });
    expect(MobileJourneyEndpointV2Schema.safeParse({ date: '2027-02-29' }).success).toBe(false);
    expect(
      MobileJourneyEndpointV2Schema.safeParse({ date: '2028-02-29', local: '2028-02-29T12:00' })
        .success
    ).toBe(false);
  });
  it('keeps v1/v2 detail unchanged and exposes persisted pins only in v3', async () => {
    const detail = tripsFixture();
    const { client } = tripsClientOver(detail);
    const [legacy, dayAware, mapped] = await Promise.all([
      client.getTrip(7),
      client.getTrip(7),
      client.getTripV3(7),
    ]);
    expect(legacy).toMatchObject({ kind: 'ok' });
    expect(dayAware).toMatchObject({ kind: 'ok' });
    expect(mapped).toMatchObject({
      kind: 'ok',
      value: {
        places: [
          { id: 11, pin: null },
          { id: 12, pin: null },
        ],
      },
    });
    if (legacy.kind === 'ok')
      expect(legacy.value.places.every((place) => !('pin' in place))).toBe(true);
    if (dayAware.kind === 'ok')
      expect(dayAware.value.places.every((place) => !('pin' in place))).toBe(true);
  });

  it('writes a complete pin only to a place referenced by the trip', async () => {
    const detail = tripsFixture();
    const { client, calls } = tripsClientOver(detail);
    const result = await client.updatePlacePin(7, 11, { latitude: -33.8688, longitude: 151.2093 });
    expect(result).toMatchObject({
      kind: 'ok',
      value: { id: 11, pin: { latitude: -33.8688, longitude: 151.2093 } },
    });
    expect(calls.at(-1)).toEqual({
      operation: 'places.update',
      input: { id: 11, pin: { latitude: -33.8688, longitude: 151.2093 } },
    });
    const journeyEndpoint = await client.updatePlacePin(7, 12, {
      latitude: -22.9068,
      longitude: -43.1729,
    });
    expect(journeyEndpoint).toMatchObject({
      kind: 'ok',
      value: { id: 12, pin: { latitude: -22.9068, longitude: -43.1729 } },
    });
    const foreign = await client.updatePlacePin(7, 13, { latitude: 0, longitude: 0 });
    expect(foreign).toMatchObject({ kind: 'not-found', status: 404 });
    expect(calls.filter(({ operation }) => operation === 'places.update')).toHaveLength(2);
  });
  it.each([{ min: 0 }, { min: 3 }, { max: 2 }, { min: 1, max: 4 }])(
    'preserves supplied duration bounds $min/$max',
    async (bounds) => {
      const detail = tripsFixture();
      const visit = detail.visits.at(0);
      expect(visit).toBeDefined();
      if (!visit) return;
      visit.timing = { duration: { ...bounds, unit: 'weeks' } };
      const result = await tripsClientOver(detail).client.getTrip(7);
      expect(result).toMatchObject({
        kind: 'ok',
        value: { visits: [{ timing: visit.timing }, detail.visits[1]] },
      });
      expect(MobileVisitTimingSchema.parse(visit.timing)).toEqual(visit.timing);
    }
  );
  it.each([{}, { min: -1 }, { max: -1 }, { min: 4, max: 2 }])(
    'rejects invalid duration without supplying missing bounds',
    (bounds) => {
      expect(
        MobileVisitTimingSchema.safeParse({ duration: { ...bounds, unit: 'days' } }).success
      ).toBe(false);
    }
  );
  it('requires an explicit duration unit', () => {
    expect(MobileVisitTimingSchema.safeParse({ duration: { min: 2 } }).success).toBe(false);
  });
  it('retains event optional precision, independent lifecycle and opaque links verbatim', async () => {
    const detail = tripsFixture();
    detail.events = [
      tripsEventFixture(),
      { ...tripsEventFixture(), id: 81, visitId: null, timing: {} },
    ];
    const before = structuredClone(detail);
    expect(await tripsClientOver(detail).client.getTrip(7)).toMatchObject({
      kind: 'ok',
      value: { events: detail.events },
    });
    expect(detail).toEqual(before);
  });
  it.each(['wrong owner', 'missing visit', 'duplicate identity'] as const)(
    'rejects event %s',
    async (fault) => {
      const detail = tripsFixture();
      const source = tripsEventFixture();
      if (fault === 'wrong owner') source.tripId = 8;
      if (fault === 'missing visit') source.visitId = 999;
      detail.events = fault === 'duplicate identity' ? [source, source] : [source];
      expect(await tripsClientOver(detail).client.getTrip(7)).toMatchObject({
        kind: 'contract-mismatch',
        status: 502,
      });
    }
  );
  it('rejects an omitted event collection rather than inventing an empty source', async () => {
    expect(
      await tripsClientOver(tripsFixture(), { events: { kind: 'ok', value: {} } }).client.getTrip(7)
    ).toMatchObject({ kind: 'contract-mismatch', status: 502 });
  });
});
