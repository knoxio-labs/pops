import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

import { describe, expect, it } from 'vitest';

import { SourceOperationResultSchema } from '../../contract/source-workspace.js';
import { openTripsDb } from '../../db/index.js';
import { journeyLegs, sourceOperations } from '../../db/schema.js';
import { listJourneys } from '../../db/services/journeys.js';
import { getJourneyLegSet } from '../../db/services/leg-set.js';
import { createTrip, listVisits } from '../../db/services/records.js';
import { readSourceWorkspace } from '../../db/services/source-queries.js';
import { createTripsApiApp } from '../app.js';

import type { SourceOperation } from '../../contract/source-workspace.js';
import type { TripsDb } from '../../db/index.js';

type Action = 'create' | 'organise';
type Post = (action: Action, operation: SourceOperation, scope?: string) => Promise<Response>;

async function withApi(
  run: (db: TripsDb, tripId: number, post: Post) => Promise<void>
): Promise<void> {
  const opened = openTripsDb(':memory:');
  const tripId = createTrip(opened.db, {}).id;
  const server = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    serviceAccountVerifier: async (key) => ({
      outcome: 'authenticated',
      principal: { id: 'leg-test', name: 'leg-test', scopes: [key] },
    }),
  }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
    const post: Post = (action, operation, scope = `trips.captures.${action}`) =>
      fetch(`http://127.0.0.1:${address.port}/trips/${tripId}/captures/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': scope },
        body: JSON.stringify(operation),
      });
    await run(opened.db, tripId, post);
  } finally {
    server.closeIdleConnections();
    try {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    } finally {
      opened.raw.close();
    }
  }
}

describe('Public Capture organisation with ordered Journey legs', () => {
  it('enforces the scope, preserves day/local source precision and replays exact persisted proof', async () =>
    withApi(async (db, tripId, post) => {
      const originalText = '  Verbatim fictional flight email\n✈  ';
      const rawResponse = await post('create', {
        operationId: randomUUID(),
        command: { kind: 'capture.create', input: { originalText } },
      });
      expect(rawResponse.status).toBe(200);
      const capture = SourceOperationResultSchema.parse(await rawResponse.json()).receipt
        .captures[0];
      if (capture === undefined) throw new Error('Expected original capture');
      const operation: SourceOperation = {
        operationId: randomUUID(),
        command: {
          kind: 'capture.organise',
          id: capture.id,
          expectedRevision: capture.revision,
          target: {
            mode: 'createJourney',
            input: { reference: 'BOOKING' },
            legs: [
              {
                mode: 'Flight',
                service: 'OUT',
                from: { date: '2028-01-06', sourceLabel: 'Original origin' },
                to: { local: '2028-01-07T02:10', timeZone: 'Europe/London' },
                arrangement: 'Booked',
              },
              {
                mode: 'Flight',
                service: 'RETURN',
                from: { date: '2028-01-21' },
                to: { sourceLabel: 'Unresolved destination' },
              },
            ],
          },
        },
      };
      expect((await post('organise', operation, 'trips.captures.create')).status).toBe(403);
      expect(listJourneys(db, tripId)).toEqual([]);
      expect(db.select().from(journeyLegs).all()).toEqual([]);
      expect(db.select().from(sourceOperations).all()).toHaveLength(1);
      const response = await post('organise', operation);
      expect(response.status).toBe(200);
      const result = SourceOperationResultSchema.parse(await response.json());
      const proof = result.receipt.journeyLegSets?.[0];
      if (proof === undefined) throw new Error('Expected public leg-set proof');
      expect(proof.revision).toBe(2);
      expect(proof.legs.map((leg) => leg.service)).toEqual(['OUT', 'RETURN']);
      expect(proof.legs[0]?.from).toEqual({ date: '2028-01-06', sourceLabel: 'Original origin' });
      expect(proof.legs[0]?.to).toEqual({ local: '2028-01-07T02:10', timeZone: 'Europe/London' });
      expect(result.current.journeyLegSets).toEqual([proof]);
      expect(getJourneyLegSet(db, tripId, proof.journeyId)).toEqual({
        revision: 2,
        legs: proof.legs,
      });
      const repeated = await post('organise', operation);
      expect(repeated.status).toBe(200);
      expect(SourceOperationResultSchema.parse(await repeated.json())).toEqual({
        ...result,
        replayed: true,
      });
      expect(listJourneys(db, tripId)).toHaveLength(1);
      expect(db.select().from(journeyLegs).all()).toHaveLength(2);
      expect(db.select().from(sourceOperations).all()).toHaveLength(2);
      expect(readSourceWorkspace(db, tripId).captures[0]?.originalText).toBe(originalText);
      expect(listVisits(db, tripId)).toEqual([]);
    }));

  it('rolls back the original, Journey, earlier valid leg and receipt when a later explicit endpoint is missing', async () =>
    withApi(async (db, tripId, post) => {
      const before = readSourceWorkspace(db, tripId);
      const response = await post('create', {
        operationId: randomUUID(),
        command: {
          kind: 'capture.create',
          input: { originalText: 'Fictional original' },
          target: {
            mode: 'createJourney',
            input: {},
            legs: [
              { service: 'VALID', from: { date: '2028-01-06' } },
              { service: 'INVALID', to: { placeId: 999999 } },
            ],
          },
        },
      });
      expect(response.status).toBe(404);
      expect(readSourceWorkspace(db, tripId)).toEqual(before);
      expect(listJourneys(db, tripId)).toEqual([]);
      expect(db.select().from(journeyLegs).all()).toEqual([]);
      expect(db.select().from(sourceOperations).all()).toEqual([]);
    }));
});
