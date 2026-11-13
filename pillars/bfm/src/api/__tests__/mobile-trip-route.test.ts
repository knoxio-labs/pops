import { afterEach, describe, expect, it, vi } from 'vitest';

import { tripRouteFixture } from '../trips/__tests__/route-fixture.js';
import { getMobileTrips, mobileTripsReader, openMobileTrips } from './mobile-trips-harness.js';

import type { GatewayFailure } from '../pillars/gateway.js';
import type { TestApp } from './harness.js';

const apps: TestApp[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.cleanup();
});

describe('mobile canonical route perimeter', () => {
  it('requires authenticated trips.read and refuses before touching the source', async () => {
    const getRoute = vi.fn(mobileTripsReader().getRoute);
    const created = openMobileTrips(mobileTripsReader({ getRoute }), ['session.read']);
    apps.push(created);
    const path = '/mobile/trips/7/route';
    expect((await getMobileTrips(created.app, null, path)).status).toBe(401);
    const response = await getMobileTrips(created.app, created.token, path);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'capability_not_granted',
      capability: 'trips.read',
    });
    expect(getRoute).not.toHaveBeenCalled();
  });

  it('uses the existing read grant and returns the canonical body verbatim', async () => {
    const value = tripRouteFixture();
    const getRoute = vi.fn(() => Promise.resolve({ kind: 'ok' as const, value }));
    const created = openMobileTrips(mobileTripsReader({ getRoute }), ['trips.read']);
    apps.push(created);
    const response = await getMobileTrips(created.app, created.token, '/mobile/trips/7/route');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(value);
    expect(getRoute).toHaveBeenCalledExactlyOnceWith(7);
  });

  it.each(['0', '-1', '1.5', '9007199254740992', 'invalid'])(
    'rejects invalid Trip identity %s before source access',
    async (id) => {
      const getRoute = vi.fn(mobileTripsReader().getRoute);
      const created = openMobileTrips(mobileTripsReader({ getRoute }), ['trips.read']);
      apps.push(created);
      expect(
        (await getMobileTrips(created.app, created.token, `/mobile/trips/${id}/route`)).status
      ).toBe(400);
      expect(getRoute).not.toHaveBeenCalled();
    }
  );

  const failures: { failure: GatewayFailure; status: number }[] = [
    { failure: { kind: 'not-found', pillar: 'trips', status: 404 }, status: 404 },
    { failure: { kind: 'unavailable', pillar: 'trips', status: 503 }, status: 503 },
    { failure: { kind: 'contract-mismatch', pillar: 'trips', status: 502 }, status: 502 },
    { failure: { kind: 'gateway-misconfigured', pillar: 'trips', status: 502 }, status: 502 },
  ];
  it.each(failures)(
    'preserves $failure.kind as an error, never false empty placement',
    async ({ failure, status }) => {
      const created = openMobileTrips(
        mobileTripsReader({ getRoute: () => Promise.resolve(failure) })
      );
      apps.push(created);
      const response = await getMobileTrips(created.app, created.token, '/mobile/trips/7/route');
      expect(response.status).toBe(status);
      expect(response.body).not.toHaveProperty('order');
      expect(response.body).toMatchObject({ details: { upstream: { pillar: 'trips' } } });
    }
  );
});
