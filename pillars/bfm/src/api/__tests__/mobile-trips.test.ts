import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MobileTripDetailSchema,
  MobileTripsPageSchema,
} from '../../contract/mobile-trips-detail-schemas.js';
import { tripsFixture } from '../trips/__tests__/fixtures.js';
import { getMobileTrips, mobileTripsReader, openMobileTrips } from './mobile-trips-harness.js';

import type { TestApp } from './harness.js';

const apps: TestApp[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.cleanup();
});
function open(...args: Parameters<typeof openMobileTrips>) {
  const app = openMobileTrips(...args);
  apps.push(app);
  return app;
}

describe('native Trips read routes', () => {
  it.each(['/mobile/trips', '/mobile/trips/7'])(
    'requires device auth and the exact read capability on %s',
    async (path) => {
      const listTrips = vi.fn(mobileTripsReader().listTrips);
      const getTrip = vi.fn(mobileTripsReader().getTrip);
      const { app, token } = open(mobileTripsReader({ listTrips, getTrip }), ['session.read']);
      expect((await getMobileTrips(app, null, path)).status).toBe(401);
      const denied = await getMobileTrips(app, token, path);
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({
        code: 'capability_not_granted',
        capability: 'trips.read',
      });
      expect(listTrips).not.toHaveBeenCalled();
      expect(getTrip).not.toHaveBeenCalled();
    }
  );

  it('returns exact source facts and a complete typed aggregate', async () => {
    const getTrip = vi.fn(mobileTripsReader().getTrip);
    const { app, token } = open(mobileTripsReader({ getTrip }));
    const response = await getMobileTrips(app, token, '/mobile/trips/7');
    expect(response.status).toBe(200);
    expect(MobileTripDetailSchema.parse(response.body)).toEqual(tripsFixture());
    expect(getTrip).toHaveBeenCalledWith(7);
  });

  it('uses declared list paging and returns an explicit invalid-cursor response after source change', async () => {
    const source = tripsFixture().trip;
    let rows = [source, { ...source, id: 8 }, { ...source, id: 9 }];
    const { app, token } = open(
      mobileTripsReader({ listTrips: () => Promise.resolve({ kind: 'ok', value: rows }) })
    );
    const first = await getMobileTrips(app, token, '/mobile/trips?limit=2');
    const page = MobileTripsPageSchema.parse(first.body);
    expect(page.items.map((trip) => trip.id)).toEqual([7, 8]);
    expect(page.totalCount).toBe(3);
    if (page.nextCursor === null) throw new Error('Expected continuation');
    const next = await getMobileTrips(
      app,
      token,
      `/mobile/trips?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`
    );
    expect(MobileTripsPageSchema.parse(next.body)).toMatchObject({
      items: [{ id: 9 }],
      nextCursor: null,
    });
    rows = [{ ...source, id: 6 }, ...rows];
    const stale = await getMobileTrips(
      app,
      token,
      `/mobile/trips?cursor=${encodeURIComponent(page.nextCursor)}`
    );
    expect(stale.status).toBe(400);
    expect(stale.body).toMatchObject({ code: 'invalid_cursor' });
  });

  it.each([
    '/mobile/trips?limit=0',
    '/mobile/trips?limit=101',
    '/mobile/trips?cursor=bad',
    '/mobile/trips/0',
    '/mobile/trips/not-an-id',
  ])('rejects invalid input before reading the source: %s', async (path) => {
    const listTrips = vi.fn(mobileTripsReader().listTrips);
    const getTrip = vi.fn(mobileTripsReader().getTrip);
    const { app, token } = open(mobileTripsReader({ listTrips, getTrip }));
    expect((await getMobileTrips(app, token, path)).status).toBe(400);
    expect(listTrips).not.toHaveBeenCalled();
    expect(getTrip).not.toHaveBeenCalled();
  });
});
