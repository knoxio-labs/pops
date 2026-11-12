import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MobileTripDetailSchema,
  MobileTripDetailV2Schema,
} from '../../contract/mobile-trips-detail-schemas.js';
import { tripsFixture } from '../trips/__tests__/fixtures.js';
import { tripsClientOver } from '../trips/__tests__/gateway.js';
import { getMobileTrips, mobileTripsReader, openMobileTrips } from './mobile-trips-harness.js';

import type { TestApp } from './harness.js';

const apps: TestApp[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.cleanup();
});

function open(...args: Parameters<typeof openMobileTrips>) {
  const created = openMobileTrips(...args);
  apps.push(created);
  return created;
}

describe('versioned Journey source precision', () => {
  it('serves one canonical aggregate as legacy-compatible and explicitly day-aware detail without inventing clocks', async () => {
    const detail = MobileTripDetailV2Schema.parse(tripsFixture());
    detail.places = detail.places.filter((place) => place.id === 11 || place.id === 12);
    const leg = detail.journeys[0]?.legs[0];
    if (!leg) throw new Error('Missing fixture leg');
    leg.from = { placeId: 11, sourceLabel: 'Recorded departure', date: '2028-02-29' };
    leg.to = { date: '2028-03-01', timeZone: 'Pacific/Kiritimati' };
    const before = structuredClone(detail);
    const { client } = tripsClientOver(detail);
    const { app, token } = open(client);
    const legacy = await getMobileTrips(app, token, '/mobile/trips/7');
    const versioned = await getMobileTrips(app, token, '/mobile/v2/trips/7');
    expect(legacy.status).toBe(200);
    expect(versioned.status).toBe(200);
    expect(legacy.body).toEqual(MobileTripDetailSchema.parse(detail));
    expect(versioned.body).toEqual(detail);
    const oldRead = MobileTripDetailSchema.parse(legacy.body);
    expect(oldRead.journeys[0]?.legs[0]?.from).toEqual({
      placeId: 11,
      sourceLabel: 'Recorded departure',
    });
    expect(oldRead.journeys[0]?.legs[0]?.to).toEqual({ timeZone: 'Pacific/Kiritimati' });
    expect(detail).toEqual(before);
  });

  it('keeps the new read behind device authentication and the existing exact capability', async () => {
    const getTrip = vi.fn(mobileTripsReader().getTrip);
    const { app, token } = open(mobileTripsReader({ getTrip }), ['session.read']);
    expect((await getMobileTrips(app, null, '/mobile/v2/trips/7')).status).toBe(401);
    const denied = await getMobileTrips(app, token, '/mobile/v2/trips/7');
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ capability: 'trips.read', code: 'capability_not_granted' });
    expect(getTrip).not.toHaveBeenCalled();
  });

  it.each(['/mobile/v2/trips/0', '/mobile/v2/trips/not-an-id'])(
    'rejects invalid source identity before any aggregate read: %s',
    async (path) => {
      const getTrip = vi.fn(mobileTripsReader().getTrip);
      const { app, token } = open(mobileTripsReader({ getTrip }));
      expect((await getMobileTrips(app, token, path)).status).toBe(400);
      expect(getTrip).not.toHaveBeenCalled();
    }
  );
});
