import { once } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TripSchema } from '../../contract/schemas.js';
import { openTripsDb, type OpenedTripsDb } from '../../db/index.js';
import { createTrip, getTrip } from '../../db/services/records.js';
import { isKnownSharedTag, replaceSharedTagIds } from '../../db/services/trip-associations.js';
import { createTripsApiApp } from '../app.js';

import type { Server } from 'node:http';

const tagId = 'ac8bc979-9995-4f78-a0dc-b8fa34c74fc9';
let opened: OpenedTripsDb;
let server: Server;
let origin: string;
const fetchIds = vi.fn<() => Promise<readonly string[] | undefined>>();
beforeEach(async () => {
  fetchIds.mockReset().mockResolvedValue([tagId]);
  opened = openTripsDb(':memory:');
  server = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    fetchSharedTagIds: fetchIds,
    serviceAccountVerifier: async () => ({
      outcome: 'authenticated',
      principal: { id: 'test', name: 'test', scopes: ['trips.trips'] },
    }),
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
function call(
  path: string,
  body: unknown,
  method: 'POST' | 'PATCH' = 'POST',
  authenticated = true
): Promise<Response> {
  return fetch(origin + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { 'x-api-key': 'scoped' } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('Trip metadata HTTP contract', () => {
  it('creates source metadata, refreshes an unknown tag once, and patches without losing omitted fields', async () => {
    const parent = createTrip(opened.db, {});
    const input = {
      destination: ' Coast ',
      when: 'After graduation, around July',
      parentId: parent.id,
      tagId,
      sourceLinks: [{ uri: 'pops:documents/document/plan' }],
    };
    const response = await call('/trips', input);
    expect(response.status).toBe(201);
    const trip = TripSchema.parse(await response.json());
    expect(trip).toMatchObject({ ...input, name: null });
    expect(fetchIds).toHaveBeenCalledTimes(1);
    const updated = await call(`/trips/${trip.id}`, { notes: 'saved' }, 'PATCH');
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ ...input, notes: 'saved' });
    expect(fetchIds).toHaveBeenCalledTimes(1);
  });

  it('never calls Tags for omitted/cleared selections or known cached IDs even during an outage', async () => {
    fetchIds.mockResolvedValue(undefined);
    replaceSharedTagIds(opened.db, [tagId]);
    const trip = createTrip(opened.db, { tagId });
    for (const body of [{ destination: 'Independent' }, { tagId }, { tagId: null }])
      expect((await call(`/trips/${trip.id}`, body, 'PATCH')).status).toBe(200);
    expect((await call('/trips', {})).status).toBe(201);
    expect(fetchIds).not.toHaveBeenCalled();
  });

  it('reports unavailable and unknown explicit selections distinctly without partial source writes', async () => {
    const trip = createTrip(opened.db, { notes: 'original' });
    fetchIds.mockResolvedValue(undefined);
    const unavailable = await call(`/trips/${trip.id}`, { tagId, notes: 'lost' }, 'PATCH');
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({
      code: 'trips.trip.tags_unavailable',
      retryable: true,
    });
    expect(getTrip(opened.db, trip.id)).toEqual(trip);
    fetchIds.mockResolvedValue([]);
    const unknown = await call(`/trips/${trip.id}`, { tagId, notes: 'lost' }, 'PATCH');
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ code: 'trips.trip.tag_unknown' });
    expect(getTrip(opened.db, trip.id)).toEqual(trip);
  });

  it('rejects invalid fields, parent cycles and unauthorized callers without performing tag fetches', async () => {
    const trip = createTrip(opened.db, {});
    for (const body of [
      { tagId: '' },
      { tagId: 'not-uuid' },
      { parentId: '1' },
      { parentId: 0 },
      { name: '' },
      { name: '   ' },
    ])
      expect((await call('/trips', body)).status).toBe(400);
    expect(
      (await call(`/trips/${trip.id}`, { parentId: trip.id, notes: 'lost' }, 'PATCH')).status
    ).toBe(400);
    expect((await call('/trips', { tagId }, 'POST', false)).status).toBe(401);
    expect(fetchIds).not.toHaveBeenCalled();
    expect(getTrip(opened.db, trip.id)).toEqual(trip);
  });

  it('preserves the cache when Tags fails and never treats unavailability as an empty vocabulary', async () => {
    replaceSharedTagIds(opened.db, [tagId]);
    fetchIds.mockResolvedValue(undefined);
    expect((await call('/trips', { tagId: 'fe8a1d81-df61-44f0-bdf8-f7020bc30bd4' })).status).toBe(
      503
    );
    expect(isKnownSharedTag(opened.db, tagId)).toBe(true);
  });
});
