import { once } from 'node:events';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JourneyGroupSchema } from '../../contract/journey-groups.js';
import { JourneySchema, JourneyLegSchema } from '../../contract/journey-schemas.js';
import { PlaceSchema, TripSchema, VisitSchema } from '../../contract/schemas.js';
import { openTripsDb, type OpenedTripsDb } from '../../db/index.js';
import { createTripsApiApp } from '../app.js';
import { buildTripsManifest } from '../manifest.js';

import type { Server } from 'node:http';

let opened: OpenedTripsDb;
let server: Server;
let origin: string;
const testScopes = new Map<string, string[]>([
  ['scoped', ['trips']],
  ['journeys-only', ['trips.journeys']],
  ['legs-only', ['trips.journeyLegs']],
  ['groups-only', ['trips.journeyGroups']],
]);

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
              scopes: testScopes.get(key) ?? ['trips.trips'],
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

describe('Journey HTTP source contract', () => {
  it('persists empty/partial journeys and separate source facts, explicitly reorders and clears, then removes records', async () => {
    const trip = TripSchema.parse(await (await call('/trips', 'POST', {})).json());
    const base = `/trips/${trip.id}/journeys`;
    const created = await call(base, 'POST', {
      buffers: { minimumConnectionMinutes: 0.5 },
      sourceLinks: [{ uri: 'pops:documents/document/unavailable' }],
    });
    expect(created.status).toBe(201);
    const journey = JourneySchema.parse(await created.json());
    expect(journey).toMatchObject({
      name: null,
      reference: null,
      buffers: { minimumConnectionMinutes: 0.5 },
    });
    const legs = `${base}/${journey.id}/legs`;
    const firstResponse = await call(legs, 'POST', {
      mode: 'User source mode',
      from: {
        local: '2028-11-05T01:30',
        timeZone: 'America/Chicago',
        sourceLabel: 'Source airport',
      },
      to: { local: '2028-03-12T02:30', timeZone: 'America/Chicago' },
      arrangement: 'Agreed',
      intention: 'Alternative',
      purchase: 'Purchased',
      reference: 'SOURCE',
    });
    expect(firstResponse.status).toBe(201);
    const first = JourneyLegSchema.parse(await firstResponse.json());
    const second = JourneyLegSchema.parse(await (await call(legs, 'POST', {})).json());
    expect(second).toMatchObject({
      mode: null,
      from: {},
      to: {},
      arrangement: null,
      purchase: null,
    });
    expect(
      await (
        await call(`${base}/${journey.id}/leg-order`, 'PUT', { legIds: [second.id, first.id] })
      ).json()
    ).toEqual({ legs: [second, first] });
    expect(await (await call(`${legs}/${first.id}`)).json()).toEqual(first);
    const patch = await call(`${legs}/${first.id}`, 'PATCH', { from: {}, purchase: null });
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({
      from: {},
      to: first.to,
      purchase: null,
      arrangement: 'Agreed',
      intention: 'Alternative',
      reference: 'SOURCE',
    });
    expect(
      (await call(`${base}/${journey.id}`, 'PATCH', { buffers: {}, name: 'Named journey' })).status
    ).toBe(200);
    expect(await (await call(`${base}/${journey.id}`)).json()).toMatchObject({
      name: 'Named journey',
      buffers: {},
      sourceLinks: journey.sourceLinks,
    });
    expect(await (await call(base)).json()).toMatchObject({ journeys: [{ id: journey.id }] });
    expect(await (await call(legs)).json()).toMatchObject({
      legs: [{ id: second.id }, { id: first.id }],
    });
    expect((await call(`${legs}/${second.id}`, 'DELETE')).status).toBe(204);
    expect((await call(`${legs}/${second.id}`)).status).toBe(404);
    expect((await call(`${base}/${journey.id}`, 'DELETE')).status).toBe(204);
    expect((await call(`${base}/${journey.id}`)).status).toBe(404);
    expect((await call(legs)).status).toBe(404);
  });

  it('enforces scoped authentication, owned references and complete permutations without source mutation', async () => {
    const trip = TripSchema.parse(await (await call('/trips', 'POST', {})).json());
    const other = TripSchema.parse(await (await call('/trips', 'POST', {})).json());
    const base = `/trips/${trip.id}/journeys`;
    expect((await call(base, 'GET', undefined, null)).status).toBe(401);
    expect((await call(base, 'GET', undefined, 'trips-only')).status).toBe(403);
    const journey = JourneySchema.parse(await (await call(base, 'POST', {})).json());
    const legs = `${base}/${journey.id}/legs`;
    expect((await call(legs, 'GET', undefined, 'trips-only')).status).toBe(403);
    expect((await call(base, 'GET', undefined, 'journeys-only')).status).toBe(200);
    expect((await call(legs, 'GET', undefined, 'journeys-only')).status).toBe(403);
    expect((await call(legs, 'GET', undefined, 'legs-only')).status).toBe(200);
    expect((await call(base, 'GET', undefined, 'legs-only')).status).toBe(403);
    const first = JourneyLegSchema.parse(
      await (await call(legs, 'POST', { purchase: 'Purchased' })).json()
    );
    const missingPlace = await call(legs, 'POST', { from: { placeId: 99999 } });
    expect(missingPlace.status).toBe(404);
    const badOrder = await call(`${base}/${journey.id}/leg-order`, 'PUT', {
      legIds: [first.id, first.id],
    });
    expect(badOrder.status).toBe(400);
    expect(await badOrder.json()).toMatchObject({
      code: 'trips.route.order_invalid',
      retryable: false,
    });
    for (const path of [
      `/trips/${other.id}/journeys/${journey.id}`,
      `/trips/${other.id}/journeys/${journey.id}/legs`,
      `${legs}/99999`,
      '/trips/99999/journeys',
    ])
      expect((await call(path)).status).toBe(404);
    expect((await call(`/trips/${other.id}/journeys/${journey.id}`, 'DELETE')).status).toBe(404);
    expect(
      (
        await call(`/trips/${other.id}/journeys/${journey.id}/legs/${first.id}`, 'PATCH', {
          purchase: null,
        })
      ).status
    ).toBe(404);
    expect(await (await call(legs)).json()).toEqual({ legs: [first] });
  });

  it('rejects malformed typed source facts with the stable validation envelope', async () => {
    const trip = TripSchema.parse(await (await call('/trips', 'POST', {})).json());
    const base = `/trips/${trip.id}/journeys`;
    const journey = JourneySchema.parse(await (await call(base, 'POST', {})).json());
    for (const body of [
      { mode: ' ' },
      { arrangement: 'Reserved' },
      { purchase: true },
      { from: { local: '2028-02-30T10:00' } },
      { to: { timeZone: 'Missing/Zone' } },
      { sourceLinks: [{ uri: 'javascript:alert(1)' }] },
    ]) {
      const response = await call(`${base}/${journey.id}/legs`, 'POST', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'trips.request.invalid',
        retryable: false,
        requestId: expect.any(String),
        details: { issues: expect.any(Array) },
      });
    }
    expect((await call(base, 'POST', { buffers: { airportBufferMinutes: -1 } })).status).toBe(400);
    const spec: unknown = await (await call('/openapi')).json();
    expect(spec).toMatchObject({
      openapi: '3.0.2',
      paths: {
        '/trips/{tripId}/journeys/{journeyId}/leg-order': {
          put: { operationId: 'journeyLegs.reorder' },
        },
      },
    });
  });
});

describe('Journey alternatives HTTP contract', () => {
  it('adopts explicit sources, previews without selecting, retains source facts and reverses selection', async () => {
    const trip = TripSchema.parse(await (await call('/trips', 'POST', {})).json());
    const sourceBase = `/trips/${trip.id}/journeys`;
    const current = JourneySchema.parse(
      await (
        await call(sourceBase, 'POST', {
          reference: 'Original source',
          buffers: { minimumConnectionMinutes: 137 },
          sourceLinks: [{ uri: 'pops:documents/document/42' }],
        })
      ).json()
    );
    const leg = JourneyLegSchema.parse(
      await (
        await call(`${sourceBase}/${current.id}/legs`, 'POST', {
          purchase: 'Purchased',
          arrangement: 'Agreed',
          from: { local: '2028-03-12T02:30', timeZone: 'America/Chicago' },
        })
      ).json()
    );
    const alternative = JourneySchema.parse(await (await call(sourceBase, 'POST', {})).json());
    const base = `/trips/${trip.id}/journey-groups`;
    const response = await call(base, 'POST', {
      currentJourneyId: current.id,
      alternativeJourneyIds: [alternative.id],
    });
    expect(response.status).toBe(201);
    const group = JourneyGroupSchema.parse(await response.json());
    const path = `${base}/${group.id}`;
    expect(await (await call(path)).json()).toEqual(group);
    expect(await (await call(base)).json()).toEqual({ groups: [group] });
    expect(await (await call(`${sourceBase}/${alternative.id}`)).json()).toEqual(alternative);
    const selectedResponse = await call(`${path}/selection`, 'PUT', {
      expectedRevision: 0,
      journeyId: alternative.id,
    });
    expect(selectedResponse.status).toBe(200);
    const selected = JourneyGroupSchema.parse(await selectedResponse.json());
    expect(selected).toMatchObject({
      currentJourneyId: alternative.id,
      alternativeJourneyIds: [current.id],
      revision: 1,
    });
    expect(
      await (
        await call(`${path}/selection`, 'PUT', { expectedRevision: 1, journeyId: alternative.id })
      ).json()
    ).toEqual(selected);
    const restored = await call(`${path}/selection`, 'PUT', {
      expectedRevision: 1,
      journeyId: current.id,
    });
    expect(await restored.json()).toMatchObject({
      currentJourneyId: current.id,
      alternativeJourneyIds: [alternative.id],
      revision: 2,
    });
    expect(await (await call(`${sourceBase}/${current.id}`)).json()).toEqual(current);
    expect(await (await call(`${sourceBase}/${current.id}/legs`)).json()).toEqual({ legs: [leg] });
    const blankResponse = await call(`${path}/alternatives`, 'POST', { expectedRevision: 2 });
    expect(blankResponse.status).toBe(201);
    const blank: unknown = await blankResponse.json();
    expect(blank).toMatchObject({
      group: {
        currentJourneyId: current.id,
        alternativeJourneyIds: [alternative.id, expect.any(Number)],
        revision: 3,
      },
      journey: {
        buffers: current.buffers,
        name: null,
        reference: null,
        sourceLinks: [],
        notes: '',
      },
    });
    expect((await call(`${sourceBase}/${current.id}`, 'DELETE')).status).toBe(409);
    expect((await call(path, 'DELETE', { expectedRevision: 3 })).status).toBe(204);
    expect((await call(path)).status).toBe(404);
    expect(await (await call(`${sourceBase}/${current.id}`)).json()).toEqual(current);
    expect(await (await call(`${sourceBase}/${current.id}/legs`)).json()).toEqual({ legs: [leg] });
  });

  it('enforces group scopes, validates explicit inputs and returns stable stale/missing-member errors without mutation', async () => {
    const trip = TripSchema.parse(await (await call('/trips', 'POST', {})).json());
    const otherTrip = TripSchema.parse(await (await call('/trips', 'POST', {})).json());
    const sourceBase = `/trips/${trip.id}/journeys`;
    const current = JourneySchema.parse(await (await call(sourceBase, 'POST', {})).json());
    const alternative = JourneySchema.parse(await (await call(sourceBase, 'POST', {})).json());
    const foreign = JourneySchema.parse(
      await (await call(`/trips/${otherTrip.id}/journeys`, 'POST', {})).json()
    );
    const base = `/trips/${trip.id}/journey-groups`;
    expect((await call(base, 'GET', undefined, null)).status).toBe(401);
    expect((await call(base, 'GET', undefined, 'rejected')).status).toBe(401);
    expect((await call(base, 'GET', undefined, 'journeys-only')).status).toBe(403);
    expect((await call(base, 'GET', undefined, 'groups-only')).status).toBe(200);
    expect((await call(sourceBase, 'GET', undefined, 'groups-only')).status).toBe(403);
    for (const body of [
      {},
      { currentJourneyId: current.id, alternativeJourneyIds: [current.id] },
      { currentJourneyId: current.id, alternativeJourneyIds: [alternative.id, alternative.id] },
    ]) {
      const response = await call(base, 'POST', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'trips.request.invalid',
        details: { issues: expect.any(Array) },
      });
    }
    expect((await call(base, 'POST', { currentJourneyId: foreign.id })).status).toBe(404);
    const group = JourneyGroupSchema.parse(
      await (
        await call(base, 'POST', {
          currentJourneyId: current.id,
          alternativeJourneyIds: [alternative.id],
        })
      ).json()
    );
    const path = `${base}/${group.id}`;
    for (const journeyId of [99999, foreign.id])
      expect(
        (await call(`${path}/selection`, 'PUT', { expectedRevision: 0, journeyId })).status
      ).toBe(404);
    expect((await call(`${path}/selection`, 'PUT', { journeyId: alternative.id })).status).toBe(
      400
    );
    expect((await call(`${path}/alternatives`, 'POST', { expectedRevision: -1 })).status).toBe(400);
    expect((await call(path, 'DELETE', {})).status).toBe(400);
    const stale = await call(`${path}/selection`, 'PUT', {
      expectedRevision: 1,
      journeyId: alternative.id,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'trips.group.revision_conflict',
      retryable: false,
      requestId: expect.any(String),
    });
    expect((await call(`${path}/alternatives`, 'POST', { expectedRevision: 1 })).status).toBe(409);
    expect((await call(path, 'DELETE', { expectedRevision: 1 })).status).toBe(409);
    expect((await call(`/trips/${otherTrip.id}/journey-groups/${group.id}`)).status).toBe(404);
    expect(
      (
        await call(`/trips/${otherTrip.id}/journey-groups/${group.id}/selection`, 'PUT', {
          expectedRevision: 0,
          journeyId: foreign.id,
        })
      ).status
    ).toBe(404);
    expect(await (await call(path)).json()).toEqual(group);
    expect(await (await call(sourceBase)).json()).toEqual({ journeys: [current, alternative] });
    const spec: unknown = await (await call('/openapi')).json();
    expect(spec).toMatchObject({
      openapi: '3.0.2',
      paths: {
        '/trips/{tripId}/journey-groups/{id}/selection': {
          put: { operationId: 'journeyGroups.select', responses: { '409': expect.any(Object) } },
        },
      },
    });
  });
});
