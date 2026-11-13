import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
} from '@pops/pillar-sdk/server';

import { MobileTripInputSchema } from '../../../contract/mobile-trip-write-schemas.js';
import { sdkWireFactory } from '../../__tests__/sdk-wire.js';
import { createPillarGateway } from '../../pillars/gateway.js';
import { createMobileTripsClient } from '../client.js';
import { tripsFixture } from './fixtures.js';

describe('canonical Trip metadata mobile writes', () => {
  beforeEach(() => configureServerSdk({ apiKey: 'pops_sa_test_key' }));
  afterEach(() => {
    __resetServerSdkConfig();
    __resetServerPillarCache();
    __resetSharedPillarClient();
    __resetSharedOpenApiCache();
  });
  it('preserves optional, empty and null metadata without parsing When as route dates', async () => {
    expect(MobileTripInputSchema.parse({})).toEqual({});
    expect(MobileTripInputSchema.safeParse({ name: '  ' }).success).toBe(false);
    const input = { name: null, destination: '', when: 'Christmas, maybe longer', notes: '' };
    const fixture = tripsFixture().trip;
    const { factory, requests } = sdkWireFactory(
      'trips',
      [
        { operationId: 'trips.create', method: 'post', path: '/trips', hasBody: true },
        { operationId: 'trips.update', method: 'patch', path: '/trips/{id}', hasBody: true },
      ],
      () => ({ status: 201, body: fixture })
    );
    const client = createMobileTripsClient(createPillarGateway(factory));
    expect(await client.createTrip(input)).toEqual({ kind: 'ok', value: fixture });
    expect(await client.updateTrip(7, { name: null, when: '' })).toEqual({
      kind: 'ok',
      value: fixture,
    });
    expect(requests).toEqual([
      { method: 'POST', url: '/trips', body: input },
      { method: 'PATCH', url: '/trips/7', body: { name: null, when: '' } },
    ]);
  });
  it('dispatches an uncertain create once without inventing a UUID or a name lookup', async () => {
    const { factory, requests } = sdkWireFactory(
      'trips',
      [{ operationId: 'trips.create', method: 'post', path: '/trips', hasBody: true }],
      () => ({
        status: 503,
        body: { code: 'unavailable', message: 'Response unavailable', retryable: true },
      })
    );
    expect(
      await createMobileTripsClient(createPillarGateway(factory)).createTrip({ when: 'Someday' })
    ).toMatchObject({ kind: 'unavailable' });
    expect(requests).toEqual([{ method: 'POST', url: '/trips', body: { when: 'Someday' } }]);
  });
  it('rejects update success for a different Trip instead of replacing the selected identity', async () => {
    const { factory } = sdkWireFactory(
      'trips',
      [{ operationId: 'trips.update', method: 'patch', path: '/trips/{id}', hasBody: true }],
      () => ({ status: 200, body: { ...tripsFixture().trip, id: 8 } })
    );
    expect(
      await createMobileTripsClient(createPillarGateway(factory)).updateTrip(7, { name: null })
    ).toMatchObject({ kind: 'contract-mismatch' });
  });
});
