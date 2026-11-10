import { afterEach, describe, expect, it } from 'vitest';

import { getMobileTrips, mobileTripsReader, openMobileTrips } from './mobile-trips-harness.js';

import type { GatewayFailure } from '../pillars/gateway.js';
import type { TestApp } from './harness.js';

const apps: TestApp[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.cleanup();
});
const failures: { failure: GatewayFailure; expected: number }[] = [
  { failure: { kind: 'unavailable', pillar: 'trips', status: 503 }, expected: 503 },
  {
    failure: { kind: 'degraded', pillar: 'trips', reason: 'reconciling', status: 503 },
    expected: 503,
  },
  { failure: { kind: 'contract-mismatch', pillar: 'trips', status: 502 }, expected: 502 },
  { failure: { kind: 'gateway-misconfigured', pillar: 'trips', status: 502 }, expected: 502 },
  { failure: { kind: 'not-found', pillar: 'trips', status: 404 }, expected: 404 },
];

describe('native Trips read failures', () => {
  it.each(failures)(
    'maps resource $failure.kind without a success-shaped empty detail',
    async ({ failure, expected }) => {
      const created = openMobileTrips(
        mobileTripsReader({ getTrip: () => Promise.resolve(failure) })
      );
      apps.push(created);
      const response = await getMobileTrips(created.app, created.token, '/mobile/trips/7');
      expect(response.status).toBe(expected);
      expect(response.body).not.toHaveProperty('trip');
      expect(response.body).toMatchObject({ details: { upstream: { pillar: 'trips' } } });
    }
  );

  it('treats a missing producer collection route as a contract fault rather than an empty trip list', async () => {
    const created = openMobileTrips(
      mobileTripsReader({
        listTrips: () => Promise.resolve({ kind: 'not-found', pillar: 'trips', status: 404 }),
      })
    );
    apps.push(created);
    const response = await getMobileTrips(created.app, created.token, '/mobile/trips');
    expect(response.status).toBe(502);
    expect(response.body).not.toHaveProperty('items');
  });
});
