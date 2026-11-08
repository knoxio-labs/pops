import { once } from 'node:events';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PlaceSchema, TripSchema, VisitSchema } from '../../contract/schemas.js';
import { openTripsDb, type OpenedTripsDb } from '../../db/index.js';
import { createTripsApiApp } from '../app.js';
import { buildTripsManifest } from '../manifest.js';

import type { Server } from 'node:http';

let opened: OpenedTripsDb;
let server: Server;
let origin: string;

beforeEach(async () => {
  opened = openTripsDb(':memory:');
  server = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    serviceAccountVerifier: async (key) =>
      key === 'rejected'
        ? { outcome: 'rejected' }
        : {
            outcome: 'authenticated',
            principal: {
              id: 'test',
              name: 'test',
              scopes: key === 'scoped' ? ['trips'] : ['trips.trips'],
            },
          },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
  origin = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  opened.raw.close();
});

function call(path: string, method = 'GET', body?: unknown, key: string | null = 'scoped') {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(key === null ? {} : { 'x-api-key': key }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('Trips HTTP contract', () => {
  it('serves discovery without credentials and publishes its actual operations', async () => {
    expect((await call('/health', 'GET', undefined, null)).status).toBe(200);
    expect((await call('/pillars', 'GET', undefined, null)).status).toBe(200);
    expect(await (await call('/manifest.json', 'GET', undefined, null)).json()).toEqual(
      buildTripsManifest('test')
    );
    const spec: unknown = await (await call('/openapi', 'GET', undefined, null)).json();
    expect(spec).toMatchObject({
      openapi: '3.0.2',
      paths: { '/trips/{tripId}/visit-order': { put: { operationId: 'visits.reorder' } } },
    });
    expect((await call('/not-a-route')).status).toBe(404);
  });

  it('requires credentials and the matching projected domain grant', async () => {
    expect((await call('/trips', 'GET', undefined, null)).status).toBe(401);
    expect((await call('/trips', 'GET', undefined, 'rejected')).status).toBe(401);
    expect((await call('/places', 'GET', undefined, 'trips-only')).status).toBe(403);
    expect((await call('/trips', 'GET', undefined, 'trips-only')).status).toBe(200);
  });

  it('captures, reads and updates source facts and reorders without replacing them', async () => {
    const tripResponse = await call('/trips', 'POST', {});
    expect(tripResponse.status).toBe(201);
    const trip = TripSchema.parse(await tripResponse.json());
    const placeResponse = await call('/places', 'POST', { name: 'Example city' });
    expect(placeResponse.status).toBe(201);
    const place = PlaceSchema.parse(await placeResponse.json());
    const route = `/trips/${trip.id}/visits`;
    const firstResponse = await call(route, 'POST', {
      placeId: place.id,
      timing: { departure: '2028-01-10', arrival: '2028-01-20' },
      sourceLinks: [{ uri: 'pops:documents/document/42' }],
    });
    expect(firstResponse.status).toBe(201);
    const first = VisitSchema.parse(await firstResponse.json());
    const second = VisitSchema.parse(
      await (await call(route, 'POST', { placeId: place.id })).json()
    );
    const reordered = await call(`/trips/${trip.id}/visit-order`, 'PUT', {
      visitIds: [second.id, first.id],
    });
    expect(reordered.status).toBe(200);
    expect(await reordered.json()).toEqual({ visits: [second, first] });
    expect(await (await call(`${route}/${first.id}`)).json()).toEqual(first);
    expect(
      (await call(`${route}/${first.id}`, 'PATCH', { timing: {}, notes: 'Original text' })).status
    ).toBe(200);
    expect(await (await call(`${route}/${first.id}`)).json()).toMatchObject({
      timing: {},
      notes: 'Original text',
      sourceLinks: first.sourceLinks,
    });
    expect((await call(`/trips/${trip.id}`, 'PATCH', { name: 'Example trip' })).status).toBe(200);
    expect(await (await call(`/trips/${trip.id}`)).json()).toMatchObject({ name: 'Example trip' });
    expect((await call(`/places/${place.id}`, 'PATCH', { name: 'Renamed city' })).status).toBe(200);
    expect(await (await call(`/places/${place.id}`)).json()).toMatchObject({
      name: 'Renamed city',
    });
    expect(await (await call('/places')).json()).toMatchObject({ places: [{ id: place.id }] });
    expect(await (await call('/trips')).json()).toMatchObject({ trips: [{ id: trip.id }] });
  });

  it('returns stable errors for invalid values, missing references and invalid route membership', async () => {
    const trip = TripSchema.parse(await (await call('/trips', 'POST', {})).json());
    const place = PlaceSchema.parse(await (await call('/places', 'POST', { name: 'City' })).json());
    for (const body of [
      { placeId: place.id, timing: { arrival: '2027-02-29' } },
      { placeId: place.id, timing: { month: { year: 2028, month: 13 } } },
      { placeId: place.id, sourceLinks: [{ uri: 'javascript:alert(1)' }] },
    ]) {
      const response = await call(`/trips/${trip.id}/visits`, 'POST', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'trips.request.invalid',
        message: expect.any(String),
        retryable: false,
        requestId: expect.any(String),
        details: { issues: expect.any(Array) },
      });
    }
    expect((await call(`/trips/${trip.id}/visits`, 'POST', { placeId: 99999 })).status).toBe(404);
    expect((await call(`/trips/${trip.id}/visit-order`, 'PUT', { visitIds: [99999] })).status).toBe(
      400
    );
    for (const path of [
      '/trips/99999',
      '/places/99999',
      `/trips/${trip.id}/visits/99999`,
      '/trips/99999/visits',
    ])
      expect((await call(path)).status).toBe(404);
    expect((await call('/trips/invalid')).status).toBe(400);
    expect(await (await call(`/trips/${trip.id}/visits`)).json()).toEqual({ visits: [] });
  });
});
