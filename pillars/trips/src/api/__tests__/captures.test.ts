import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  SourceOperationResultSchema,
  SourceWorkspaceSchema,
} from '../../contract/source-workspace.js';
import { openTripsDb } from '../../db/index.js';
import { sourceOperations } from '../../db/schema.js';
import { createTrip } from '../../db/services/records.js';
import { createTripsApiApp } from '../app.js';

describe('Capture HTTP actions, scopes and concurrent Undo', () => {
  it('projects distinct scopes, rejects foreign commands, and serialises competing Undo with durable replay', async () => {
    const opened = openTripsDb(':memory:');
    const trip = createTrip(opened.db, {});
    const other = createTrip(opened.db, {});
    const server = createTripsApiApp({
      tripsDb: opened,
      version: 'test',
      selfBaseUrl: 'http://localhost:3018',
      serviceAccountVerifier: async (key) => ({
        outcome: 'authenticated',
        principal: { id: 'capture-test', name: 'capture-test', scopes: [key] },
      }),
    }).listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
      const origin = `http://127.0.0.1:${address.port}`;
      const post = (path: string, body: unknown, scope: string | null = 'trips') =>
        fetch(`${origin}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(scope === null ? {} : { 'x-api-key': scope }),
          },
          body: JSON.stringify(body),
        });
      const path = `/trips/${trip.id}`;
      const operation = {
        operationId: randomUUID(),
        command: { kind: 'capture.create', input: { originalText: '  Exact source\n🌆  ' } },
      };
      expect((await post(`${path}/captures/create`, operation, null)).status).toBe(401);
      expect((await post(`${path}/captures/create`, operation, 'trips.ideas.update')).status).toBe(
        403
      );
      const createdResponse = await post(
        `${path}/captures/create`,
        operation,
        'trips.captures.create'
      );
      expect(createdResponse.status).toBe(200);
      const created = SourceOperationResultSchema.parse(await createdResponse.json());
      const capture = created.receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      expect(
        (
          await post(
            `${path}/captures/remove`,
            {
              operationId: randomUUID(),
              command: {
                kind: 'capture.remove',
                id: capture.id,
                expectedRevision: capture.revision,
              },
            },
            'trips.ideas.update'
          )
        ).status
      ).toBe(403);
      expect(
        (
          await post(
            `${path}/ideas/update`,
            {
              operationId: randomUUID(),
              command: { kind: 'capture.remove', id: capture.id, expectedRevision: 1 },
            },
            'trips.ideas.update'
          )
        ).status
      ).toBe(400);
      const undo = {
        operationId: randomUUID(),
        command: { kind: 'undo', targetOperationId: operation.operationId },
      };
      expect((await post(`${path}/ideas/undo`, undo, 'trips.ideas.undo')).status).toBe(409);
      expect(
        (
          await post(`/trips/${other.id}/captures/update`, {
            operationId: randomUUID(),
            command: {
              kind: 'capture.update',
              id: capture.id,
              expectedRevision: 1,
              input: { title: 'Foreign edit' },
            },
          })
        ).status
      ).toBe(404);
      const competing = await Promise.all([
        post(`${path}/captures/undo`, undo, 'trips.captures.undo'),
        post(
          `${path}/captures/undo`,
          { ...undo, operationId: randomUUID() },
          'trips.captures.undo'
        ),
      ]);
      expect(competing.map((response) => response.status).toSorted()).toEqual([200, 409]);
      const replayResponse = await post(
        `${path}/captures/create`,
        operation,
        'trips.captures.create'
      );
      const replay = SourceOperationResultSchema.parse(await replayResponse.json());
      expect(replay).toMatchObject({
        replayed: true,
        undone: true,
        receipt: created.receipt,
        current: { captures: [{ revision: 2, removedAt: expect.any(String) }] },
      });
      expect(opened.db.select().from(sourceOperations).all()).toHaveLength(2);
      const snapshot = await fetch(`${origin}${path}/capture-workspace`, {
        headers: { 'x-api-key': 'trips.captureWorkspace.get' },
      });
      expect(snapshot.status).toBe(200);
      expect(SourceWorkspaceSchema.parse(await snapshot.json()).captures).toEqual(
        replay.current.captures
      );
      expect(
        (
          await fetch(`${origin}${path}/capture-workspace`, {
            headers: { 'x-api-key': 'trips.ideas.update' },
          })
        ).status
      ).toBe(403);
      const spec: unknown = await (await fetch(`${origin}/openapi`)).json();
      expect(spec).toMatchObject({
        paths: {
          '/trips/{tripId}/ideas/update': { post: { operationId: 'ideas.update' } },
          '/trips/{tripId}/captures/remove': { post: { operationId: 'captures.remove' } },
        },
      });
    } finally {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      opened.raw.close();
    }
  });
});
