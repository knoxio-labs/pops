import { describe, expect, it } from 'vitest';

import { deriveFeatures } from '../../api/mobile/features.js';
import { BFM_SERVICE_ACCOUNT_SCOPES } from '../../api/pillars/service-account.js';
import { tripsFixture } from '../../api/trips/__tests__/fixtures.js';
import {
  DEFAULT_DEVICE_CAPABILITIES,
  GUEST_DEVICE_CAPABILITIES,
  MOBILE_CAPABILITY_SCOPES,
  resolveDeviceCapabilities,
} from '../capabilities.js';
import { MobileTripDetailSchema, MobileTripsQuerySchema } from '../mobile-trips-detail-schemas.js';
import { mobileTripsContract } from '../rest-mobile-trips.js';

describe('native Trips capability, discovery and source contract', () => {
  it('is grantable through existing operator pairing/default resolution without widening explicit or guest grants', () => {
    expect(DEFAULT_DEVICE_CAPABILITIES).toContain('trips.read');
    expect(
      resolveDeviceCapabilities({
        id: 'device',
        capabilities: '["session.read"]',
        capabilityMode: 'tracks-default',
      })
    ).toContain('trips.read');
    expect(
      resolveDeviceCapabilities({
        id: 'device',
        capabilities: '["session.read"]',
        capabilityMode: 'explicit',
      })
    ).not.toContain('trips.read');
    expect(GUEST_DEVICE_CAPABILITIES).not.toContain('trips.read');
    expect(mobileTripsContract.listTrips.metadata).toEqual({ capability: 'trips.read' });
    expect(mobileTripsContract.getTrip.metadata).toEqual({ capability: 'trips.read' });
  });

  it('declares only the precise producer read grants the aggregate actually calls', () => {
    const scopes = MOBILE_CAPABILITY_SCOPES['trips.read'];
    expect(scopes).toEqual([
      'trips.trips.list',
      'trips.trips.get',
      'trips.places.list',
      'trips.visits.list',
      'trips.journeys.list',
      'trips.journeyLegs.list',
      'trips.journeyGroups.list',
      'trips.stays.list',
      'trips.events.list',
      'trips.documentAssociations.list',
    ]);
    for (const scope of scopes) expect(BFM_SERVICE_ACCOUNT_SCOPES).toContain(scope);
    expect(BFM_SERVICE_ACCOUNT_SCOPES.filter((scope) => scope.startsWith('trips'))).toEqual(scopes);
  });

  it.each(['healthy', 'degraded', 'unavailable', 'contract-mismatch'] as const)(
    'advertises exact Trips reachability %s only to operator sessions',
    (reachability) => {
      const pillars = [{ id: 'trips', reachability, version: null }];
      expect(deriveFeatures(pillars, 'operator')).toContainEqual({ id: 'trips', reachability });
      expect(deriveFeatures(pillars, 'guest')).not.toContainEqual({ id: 'trips', reachability });
    }
  );

  it('retains source optional clocks, free When and independent source lifecycle fields', () => {
    const source = tripsFixture();
    expect(MobileTripDetailSchema.parse(source)).toEqual(source);
    expect(MobileTripsQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(MobileTripsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(MobileTripsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});
