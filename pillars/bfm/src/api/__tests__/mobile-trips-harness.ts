import {
  DEFAULT_DEVICE_CAPABILITIES,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { tripsFixture } from '../trips/__tests__/fixtures.js';
import { createTestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { MobileCapability } from '../../contract/capabilities.js';
import type { MobileTripsClient } from '../trips/client.js';
import type { TestApp } from './harness.js';

/** Typed source reader for route tests; error overrides never bypass the real device perimeter. */
export function mobileTripsReader(overrides: Partial<MobileTripsClient> = {}): MobileTripsClient {
  return {
    createTrip:
      overrides.createTrip ?? (() => Promise.resolve({ kind: 'ok', value: tripsFixture().trip })),
    updateTrip:
      overrides.updateTrip ?? (() => Promise.resolve({ kind: 'ok', value: tripsFixture().trip })),
    listTrips:
      overrides.listTrips ?? (() => Promise.resolve({ kind: 'ok', value: [tripsFixture().trip] })),
    getRoute:
      overrides.getRoute ??
      ((tripId) =>
        Promise.resolve({
          kind: 'ok',
          value: { tripId, revision: 0, order: [], paths: [], missingSources: [] },
        })),
    getTrip: overrides.getTrip ?? (() => Promise.resolve({ kind: 'ok', value: tripsFixture() })),
  };
}
/** Opens a real authenticated BFM app over an injected source reader and isolated migrated database. */
export function openMobileTrips(
  trips: MobileTripsClient,
  capabilities: readonly MobileCapability[] = DEFAULT_DEVICE_CAPABILITIES
): TestApp & { token: string } {
  const created = createTestApp({ trips });
  const row = deviceRow({
    capabilityMode: 'explicit',
    capabilities: serialiseDeviceCapabilities(capabilities),
  });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);
  return { ...created, token };
}
/** Sends a read through the actual Express listener rather than invoking a handler directly. */
export function getMobileTrips(
  app: Express,
  token: string | null,
  path: string
): ReturnType<typeof requestOn> {
  return requestOn(app, (request) =>
    token === null ? request.get(path) : request.get(path).set('Authorization', `Bearer ${token}`)
  );
}
