import { once } from 'node:events';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TripDocumentAssociationSchema,
  type DocumentTargetKind,
} from '../../contract/document-associations.js';
import { openTripsDb, type OpenedTripsDb } from '../../db/index.js';
import { createEvent } from '../../db/services/events.js';
import { createJourney } from '../../db/services/journeys.js';
import { createPlace, createTrip, createVisit } from '../../db/services/records.js';
import { createStay } from '../../db/services/stays.js';
import { createTripsApiApp } from '../app.js';

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
    serviceAccountVerifier: async (key) => ({
      outcome: 'authenticated',
      principal: {
        id: 'test',
        name: 'test',
        scopes: key === 'documents-only' ? ['trips.documentAssociations'] : ['trips'],
      },
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

function call(path: string, method: string, body?: unknown, key = 'scoped'): Promise<Response> {
  return fetch(origin + path, {
    method,
    headers: {
      'x-api-key': key,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('Trip document association HTTP contract', () => {
  it('creates, lists and unlinks a reference without changing the source stay', async () => {
    const trip = createTrip(opened.db, {});
    const stay = createStay(opened.db, trip.id, {
      documentLinks: [{ uri: 'pops:documents/document/unavailable' }],
    });
    const path = `/trips/${trip.id}/document-associations`;
    const created = await call(path, 'POST', {
      documentId: 42,
      targetKind: 'stay',
      targetId: stay.id,
    });
    expect(created.status).toBe(201);
    const association = TripDocumentAssociationSchema.parse(await created.json());
    expect(association.documentId).toBe(42);
    const duplicate = await call(path, 'POST', {
      documentId: 42,
      targetKind: 'stay',
      targetId: stay.id,
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ code: 'trips.document.association_exists' });
    expect(await (await call(path, 'GET')).json()).toMatchObject({
      associations: [{ id: association.id, documentId: 42, targetKind: 'stay', targetId: stay.id }],
    });
    expect((await call(`${path}/${association.id}`, 'DELETE')).status).toBe(204);
    expect(await (await call(path, 'GET')).json()).toMatchObject({ associations: [] });
    expect((await call(`/trips/${trip.id}/stays/${stay.id}`, 'GET')).status).toBe(200);
  });

  it('rejects malformed identifiers and targets from another trip', async () => {
    const trip = createTrip(opened.db, {});
    const other = createTrip(opened.db, {});
    const place = createPlace(opened.db, { name: 'Place' });
    const visit = createVisit(opened.db, other.id, { placeId: place.id });
    const event = createEvent(opened.db, other.id, {});
    const path = `/trips/${trip.id}/document-associations`;
    expect(
      (await call(path, 'POST', { documentId: 0, targetKind: 'visit', targetId: visit.id })).status
    ).toBe(400);
    const foreign = await call(path, 'POST', {
      documentId: 42,
      targetKind: 'visit',
      targetId: visit.id,
    });
    expect(foreign.status).toBe(404);
    const foreignEvent = await call(path, 'POST', {
      documentId: 42,
      targetKind: 'event',
      targetId: event.id,
    });
    expect(foreignEvent.status).toBe(404);
  });

  it('supports explicit trip, visit, journey, stay and event targets', async () => {
    const trip = createTrip(opened.db, {});
    const place = createPlace(opened.db, { name: 'Place' });
    const visit = createVisit(opened.db, trip.id, { placeId: place.id });
    const journey = createJourney(opened.db, trip.id, {});
    const stay = createStay(opened.db, trip.id, {});
    const event = createEvent(opened.db, trip.id, {});
    const targets: Array<{ targetKind: DocumentTargetKind; targetId: number }> = [
      { targetKind: 'trip', targetId: trip.id },
      { targetKind: 'visit', targetId: visit.id },
      { targetKind: 'journey', targetId: journey.id },
      { targetKind: 'stay', targetId: stay.id },
      { targetKind: 'event', targetId: event.id },
    ];
    for (const [index, target] of targets.entries()) {
      const response = await call(`/trips/${trip.id}/document-associations`, 'POST', {
        documentId: index + 1,
        targetKind: target.targetKind,
        targetId: target.targetId,
      });
      expect(response.status).toBe(201);
      if (target.targetKind === 'event') {
        const duplicate = await call(`/trips/${trip.id}/document-associations`, 'POST', {
          documentId: index + 1,
          targetKind: target.targetKind,
          targetId: target.targetId,
        });
        expect(duplicate.status).toBe(409);
      }
    }
  });

  it('requires only the document-association scope for these routes', async () => {
    const trip = createTrip(opened.db, {});
    const base = `/trips/${trip.id}/document-associations`;
    expect(
      (
        await call(
          base,
          'POST',
          { documentId: 11, targetKind: 'trip', targetId: trip.id },
          'documents-only'
        )
      ).status
    ).toBe(201);
    expect((await call(`/trips/${trip.id}/stays`, 'GET', undefined, 'documents-only')).status).toBe(
      403
    );
  });
});
