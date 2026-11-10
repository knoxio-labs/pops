import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
} from '@pops/pillar-sdk/server';

import { sdkWireFactory } from '../../__tests__/sdk-wire.js';
import { createPillarGateway } from '../../pillars/gateway.js';
import { createMobileTripsClient } from '../client.js';
import { tripsFixture } from './fixtures.js';

import type { WireOperation } from '../../__tests__/sdk-wire.js';

const operations: WireOperation[] = [
  { operationId: 'trips.list', method: 'get', path: '/trips' },
  { operationId: 'trips.get', method: 'get', path: '/trips/{id}' },
  { operationId: 'places.list', method: 'get', path: '/places' },
  { operationId: 'visits.list', method: 'get', path: '/trips/{tripId}/visits' },
  { operationId: 'journeys.list', method: 'get', path: '/trips/{tripId}/journeys' },
  { operationId: 'journeyGroups.list', method: 'get', path: '/trips/{tripId}/journey-groups' },
  {
    operationId: 'documentAssociations.list',
    method: 'get',
    path: '/trips/{tripId}/document-associations',
  },
  { operationId: 'events.list', method: 'get', path: '/trips/{tripId}/events' },
  { operationId: 'stays.list', method: 'get', path: '/trips/{tripId}/stays' },
  {
    operationId: 'journeyLegs.list',
    method: 'get',
    path: '/trips/{tripId}/journeys/{journeyId}/legs',
  },
];

describe('Trips reads through the real SDK wire', () => {
  beforeEach(() => configureServerSdk({ apiKey: 'pops_sa_test_key' }));
  afterEach(() => {
    __resetServerSdkConfig();
    __resetServerPillarCache();
    __resetSharedPillarClient();
    __resetSharedOpenApiCache();
  });

  it('sends trip and journey identities as path parameters without query/body substitution', async () => {
    const detail = tripsFixture();
    const replies: Record<string, unknown> = {
      '/trips': { trips: [detail.trip] },
      '/trips/7': detail.trip,
      '/places': { places: detail.places },
      '/trips/7/visits': { visits: detail.visits },
      '/trips/7/journeys': { journeys: detail.journeys.map(({ legs, ...journey }) => journey) },
      '/trips/7/journey-groups': { groups: detail.journeyGroups },
      '/trips/7/stays': { stays: detail.stays },
      '/trips/7/events': { events: detail.events },
      '/trips/7/document-associations': { associations: detail.documentAssociations },
    };
    for (const journey of detail.journeys) {
      replies[`/trips/7/journeys/${journey.id}/legs`] = { legs: journey.legs };
    }
    const { factory, requests } = sdkWireFactory('trips', operations, (request) => ({
      status: replies[request.url] === undefined ? 404 : 200,
      body: replies[request.url] ?? {},
    }));
    const client = createMobileTripsClient(createPillarGateway(factory));
    expect(await client.listTrips()).toEqual({ kind: 'ok', value: [detail.trip] });
    expect(await client.getTrip(7)).toMatchObject({ kind: 'ok' });
    expect(requests).toEqual(
      [...Object.keys(replies)].map((url) => ({ method: 'GET', url, body: undefined }))
    );
  });
});
