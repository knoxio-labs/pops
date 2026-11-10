import { once } from 'node:events';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { LegRemovalResultSchema, JourneyLegSetSchema } from '../../contract/leg-removal-schemas.js';
import { openTripsDb, type OpenedTripsDb } from '../../db/index.js';
import { createJourneyLeg } from '../../db/services/journey-legs.js';
import { createJourney } from '../../db/services/journeys.js';
import { createTrip } from '../../db/services/records.js';
import { createTripsApiApp } from '../app.js';

import type { Server } from 'node:http';

let opened: OpenedTripsDb;
let server: Server;
let base: string;
let legId: number;
beforeEach(async () => {
  opened = openTripsDb(':memory:');
  const trip = createTrip(opened.db, {});
  const journey = createJourney(opened.db, trip.id, {});
  legId = createJourneyLeg(opened.db, trip.id, journey.id, { notes: 'source' }).id;
  server = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://127.0.0.1',
    serviceAccountVerifier: async () => ({
      outcome: 'authenticated',
      principal: { id: 'test', name: 'test', scopes: ['trips'] },
    }),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  base = `http://127.0.0.1:${address.port}/trips/${trip.id}/journeys/${journey.id}`;
});
afterEach(async () => {
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  opened.raw.close();
});
function call(path: string, method = 'GET', body?: unknown): Promise<Response> {
  return fetch(base + path, {
    method,
    headers: { 'x-api-key': 'scoped', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const operationId = '11111111-1111-4111-8111-111111111111';
it('exposes coherent receipts, exact replay, stale errors and legacy DELETE over the owning HTTP contract', async () => {
  const initial = JourneyLegSetSchema.parse(await (await call('/legs')).json());
  expect(initial.revision).toBe(1);
  expect(
    (await call(`/legs/${legId}/removals`, 'POST', { operationId: 'invalid', expectedRevision: 1 }))
      .status
  ).toBe(400);
  const removed = await call(`/legs/${legId}/removals`, 'POST', {
    operationId,
    expectedRevision: 1,
  });
  expect(removed.status).toBe(200);
  const receipt = LegRemovalResultSchema.parse(await removed.json());
  expect(receipt).toMatchObject({
    revision: 2,
    legs: [],
    receipt: { legId, state: 'removed', removedRevision: 2 },
  });
  expect((await call(`/legs/${legId}`)).status).toBe(404);
  expect(
    await (
      await call(`/legs/${legId}/removals`, 'POST', { operationId, expectedRevision: 1 })
    ).json()
  ).toEqual(receipt);
  const stale = await call(`/leg-removals/${operationId}/restore`, 'POST', { expectedRevision: 1 });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ code: 'trips.journey_leg.leg_revision_conflict' });
  const restored = await call(`/leg-removals/${operationId}/restore`, 'POST', {
    expectedRevision: 2,
  });
  expect(restored.status).toBe(200);
  expect(LegRemovalResultSchema.parse(await restored.json())).toMatchObject({
    revision: 3,
    legs: initial.legs,
    receipt: { state: 'restored', restoredRevision: 3 },
  });
  expect((await call(`/legs/${legId}`, 'DELETE')).status).toBe(204);
  expect(JourneyLegSetSchema.parse(await (await call('/legs')).json())).toEqual({
    revision: 4,
    legs: [],
  });
  expect(
    (await call(`/leg-removals/${operationId}/restore`, 'POST', { expectedRevision: 2 })).status
  ).toBe(404);
});

it('allows exactly one concurrent order/removal writer at the same source revision', async () => {
  const results = await Promise.all([
    call('/leg-order', 'PUT', { legIds: [legId], expectedRevision: 1 }),
    call(`/legs/${legId}/removals`, 'POST', { operationId, expectedRevision: 1 }),
  ]);
  expect(results.map((response) => response.status).toSorted()).toEqual([200, 409]);
  const current = JourneyLegSetSchema.parse(await (await call('/legs')).json());
  expect(current.revision).toBe(2);
  if (results[1]?.status === 200) {
    expect(current.legs).toEqual([]);
    expect(
      (await call(`/leg-removals/${operationId}/restore`, 'POST', { expectedRevision: 2 })).status
    ).toBe(200);
  } else {
    expect(current.legs).toEqual([expect.objectContaining({ id: legId, notes: 'source' })]);
    expect(
      (await call(`/leg-removals/${operationId}/restore`, 'POST', { expectedRevision: 2 })).status
    ).toBe(404);
  }
});
