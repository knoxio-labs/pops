import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

import { expect, it } from 'vitest';

import { RouteOperationResultSchema, TripRouteReadSchema } from '../../contract/route-schemas.js';
import { openTripsDb } from '../../db/index.js';
import { createJourney } from '../../db/services/journeys.js';
import { createPlace, createTrip, createVisit } from '../../db/services/records.js';
import { createTripsApiApp } from '../app.js';

import type { RouteOperation } from '../../contract/route-schemas.js';

it('exposes the trip-owned authoritative route using actual Visit identities and a dedicated scope', async () => {
  const opened = openTripsDb(':memory:');
  const trip = createTrip(opened.db, {});
  const place = createPlace(opened.db, { name: 'Repeated town' });
  const first = createVisit(opened.db, trip.id, { placeId: place.id });
  const second = createVisit(opened.db, trip.id, { placeId: place.id });
  const server = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    serviceAccountVerifier: async (key) => ({
      outcome: 'authenticated',
      principal: { id: 'test', name: 'test', scopes: [key] },
    }),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
    const url = `http://127.0.0.1:${address.port}/trips/${trip.id}/route`;
    const response = await fetch(url, { headers: { 'x-api-key': 'trips.route' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tripId: trip.id,
      order: [
        { kind: 'visit', id: first.id },
        { kind: 'visit', id: second.id },
      ],
      paths: [],
    });
    expect((await fetch(url, { headers: { 'x-api-key': 'trips.stays' } })).status).toBe(403);
    expect((await fetch(url)).status).toBe(401);
    const request = (body: unknown, key = 'trips.route') =>
      fetch(`${url}/operations`, {
        method: 'POST',
        headers: { 'x-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const initial = TripRouteReadSchema.parse(
      await (await fetch(url, { headers: { 'x-api-key': 'trips.route' } })).json()
    );
    const gapRequest: RouteOperation = {
      operationId: randomUUID(),
      expectedRevision: initial.revision,
      command: { kind: 'gap.create', before: null },
    };
    expect((await request(gapRequest, 'trips.stays')).status).toBe(403);
    expect((await request({ ...gapRequest, expectedRevision: undefined })).status).toBe(400);
    const gapResponse = await request(gapRequest);
    expect(gapResponse.status).toBe(200);
    const gap = RouteOperationResultSchema.parse(await gapResponse.json());
    expect(RouteOperationResultSchema.parse(await (await request(gapRequest)).json())).toEqual({
      ...gap,
      replayed: true,
    });
    expect((await request({ ...gapRequest, operationId: randomUUID() })).status).toBe(409);
    expect(
      (await request({ ...gapRequest, command: { kind: 'route.reorder', order: [] } })).status
    ).toBe(409);
    const anchor = gap.current.order.at(-1);
    if (anchor?.kind !== 'gap') throw new Error('Expected actual gap');
    const journey = createJourney(opened.db, trip.id, { name: 'Explicit transport' });
    const createRequest: RouteOperation = {
      operationId: randomUUID(),
      expectedRevision: gap.current.revision,
      command: {
        kind: 'path.create',
        title: 'Full path',
        gapId: anchor.id,
        members: [
          { kind: 'visit', id: second.id },
          { kind: 'journey', id: journey.id },
        ],
      },
    };
    const createdResponse = await request(createRequest);
    expect(createdResponse.status).toBe(200);
    const created = RouteOperationResultSchema.parse(await createdResponse.json());
    const path = created.current.paths[0];
    if (path === undefined) throw new Error('Expected path');
    const applyRequest: RouteOperation = {
      operationId: randomUUID(),
      expectedRevision: created.current.revision,
      command: { kind: 'path.apply', pathId: path.id },
    };
    const appliedResponse = await request(applyRequest);
    expect(appliedResponse.status).toBe(200);
    const applied = RouteOperationResultSchema.parse(await appliedResponse.json());
    expect(applied.current.order).toEqual([
      { kind: 'visit', id: first.id },
      ...path.members,
      anchor,
    ]);
    expect(RouteOperationResultSchema.parse(await (await request(applyRequest)).json())).toEqual({
      ...applied,
      replayed: true,
    });
    const undoneResponse = await request({
      operationId: randomUUID(),
      expectedRevision: applied.current.revision,
      command: { kind: 'undo', targetOperationId: applyRequest.operationId },
    });
    expect(undoneResponse.status).toBe(200);
    const undone = RouteOperationResultSchema.parse(await undoneResponse.json());
    expect(undone.current).toEqual({ ...created.current, revision: applied.current.revision + 1 });
    expect(
      (
        await request({
          operationId: randomUUID(),
          expectedRevision: undone.current.revision,
          command: {
            kind: 'source.move',
            source: { kind: 'visit', id: Number.MAX_SAFE_INTEGER },
            destination: { kind: 'route', before: null },
          },
        })
      ).status
    ).toBe(404);
    const other = createTrip(opened.db, {});
    expect(
      (
        await fetch(url.replace(`/trips/${trip.id}/`, `/trips/${other.id}/`), {
          headers: { 'x-api-key': 'trips.route' },
        })
      ).status
    ).toBe(200);
    const spec = await (await fetch(url.replace(`/trips/${trip.id}/route`, '/openapi'))).text();
    expect(spec).toContain('route.operate');
  } finally {
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    opened.raw.close();
  }
});
