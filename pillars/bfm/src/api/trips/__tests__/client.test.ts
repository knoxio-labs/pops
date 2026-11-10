import { describe, expect, it } from 'vitest';

import { tripsFixture } from './fixtures.js';
import { tripsClientOver } from './gateway.js';

import type { TripsResponses } from './gateway.js';

describe('source-backed native Trips reader', () => {
  it('retains source identities, independent purchase fields, opaque references and producer order', async () => {
    const detail = tripsFixture();
    const before = structuredClone(detail);
    const { client, calls } = tripsClientOver(detail);
    const result = await client.getTrip(7);
    expect(result).toEqual({
      kind: 'ok',
      value: { ...detail, places: detail.places.filter((place) => place.id !== 13) },
    });
    expect(
      calls.filter((call) => call.operation === 'journeyLegs.list').map((call) => call.input)
    ).toEqual([
      { tripId: 7, journeyId: 40 },
      { tripId: 7, journeyId: 41 },
    ]);
    expect(detail).toEqual(before);
  });

  it('returns genuine empty source collections without inventing plans or relations', async () => {
    const detail = tripsFixture();
    detail.visits = [];
    detail.journeys = [];
    detail.stays = [];
    detail.journeyGroups = [];
    const result = await tripsClientOver(detail).client.getTrip(7);
    expect(result).toEqual({ kind: 'ok', value: { ...detail, places: [] } });
  });

  it.each([
    'places',
    'visits',
    'journeys',
    'groups',
    'stays',
    'legs',
    'events',
    'associations',
  ] as const)('does not turn an unavailable %s source into an empty success', async (operation) => {
    const responses: TripsResponses = { [operation]: { kind: 'unavailable', pillar: 'trips' } };
    const result = await tripsClientOver(tripsFixture(), responses).client.getTrip(7);
    expect(result).toMatchObject({ kind: 'unavailable', pillar: 'trips', status: 503 });
  });

  it.each([
    'places',
    'visits',
    'journeys',
    'groups',
    'stays',
    'legs',
    'events',
    'associations',
  ] as const)(
    'does not report the selected trip missing when its %s collection cannot be read',
    async (operation) => {
      const responses: TripsResponses = { [operation]: { kind: 'not-found', pillar: 'trips' } };
      const result = await tripsClientOver(tripsFixture(), responses).client.getTrip(7);
      expect(result).toMatchObject({ kind: 'contract-mismatch', status: 502, upstreamStatus: 404 });
    }
  );

  it('preserves upstream missing resources and service-account authentication failures', async () => {
    const missing = tripsClientOver(tripsFixture(), {
      trip: { kind: 'not-found', pillar: 'trips' },
    });
    expect(await missing.client.getTrip(7)).toMatchObject({ kind: 'not-found', status: 404 });
    expect(missing.calls.map((call) => call.operation)).toEqual(['trips.get']);
    const unauthorized = tripsClientOver(tripsFixture(), {
      trip: { kind: 'unauthorized', pillar: 'trips' },
    });
    expect(await unauthorized.client.getTrip(7)).toMatchObject({
      kind: 'gateway-misconfigured',
      status: 502,
    });
  });

  it('rejects malformed and duplicate list identities rather than merging equal names', async () => {
    const detail = tripsFixture();
    expect(
      await tripsClientOver(detail, {
        trips: { kind: 'ok', value: { trips: [detail.trip, detail.trip] } },
      }).client.listTrips()
    ).toMatchObject({ kind: 'contract-mismatch' });
    expect(
      await tripsClientOver(detail, {
        trips: { kind: 'ok', value: { trips: [{}] } },
      }).client.listTrips()
    ).toMatchObject({ kind: 'contract-mismatch' });
  });
});
