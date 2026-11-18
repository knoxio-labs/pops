import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

import { expect, it } from 'vitest';

import {
  RouteDraftOperationResultSchema,
  RouteDraftPreviewSchema,
} from '../../contract/route-draft-schemas.js';
import { openTripsDb } from '../../db/index.js';
import { createPlace, createTrip, createVisit, listVisits } from '../../db/services/records.js';
import { operateTripRoute } from '../../db/services/route-operations.js';
import { getTripRoute } from '../../db/services/route-queries.js';
import { createTripsApiApp } from '../app.js';

it('isolates draft authority, previews without writes, and requires source-aware Undo even on replay', async () => {
  const opened = openTripsDb(':memory:');
  const trip = createTrip(opened.db, {});
  const place = createPlace(opened.db, { name: 'Draft stop' });
  const visit = createVisit(opened.db, trip.id, { placeId: place.id });
  const initial = getTripRoute(opened.db, trip.id);
  const gap = operateTripRoute(opened.db, trip.id, {
    operationId: randomUUID(),
    expectedRevision: initial.revision,
    command: { kind: 'gap.create', before: null },
  });
  const anchor = gap.current.order.at(-1);
  if (anchor?.kind !== 'gap') throw new Error('Expected gap');
  const created = operateTripRoute(opened.db, trip.id, {
    operationId: randomUUID(),
    expectedRevision: gap.current.revision,
    command: {
      kind: 'path.create',
      title: 'Draft',
      gapId: anchor.id,
      members: [{ kind: 'visit', id: visit.id }],
    },
  });
  const path = created.current.paths[0];
  if (path === undefined) throw new Error('Expected draft path');
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
    const base = `http://127.0.0.1:${address.port}/trips/${trip.id}/route`;
    const post = (suffix: string, body: unknown, key?: string) =>
      fetch(`${base}/${suffix}`, {
        method: 'POST',
        headers:
          key === undefined
            ? { 'content-type': 'application/json' }
            : { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body),
      });
    const previewPath = `paths/${path.id}/deletion-preview`;
    expect((await post(previewPath, {})).status).toBe(401);
    expect((await post(previewPath, {}, 'trips.route')).status).toBe(403);
    expect((await post(previewPath, {}, 'trips.visits')).status).toBe(403);
    expect(
      (await post(previewPath, { deleteSources: [{ kind: 'visit', id: 0 }] }, 'trips.routeDrafts'))
        .status
    ).toBe(400);
    const routeBefore = getTripRoute(opened.db, trip.id);
    const visitsBefore = listVisits(opened.db, trip.id);
    const response = await post(previewPath, {}, 'trips.routeDrafts.preview');
    expect(response.status).toBe(200);
    const preview = RouteDraftPreviewSchema.parse(await response.json());
    expect(preview).toMatchObject({
      tripId: trip.id,
      pathId: path.id,
      revision: created.current.revision,
    });
    expect(getTripRoute(opened.db, trip.id)).toEqual(routeBefore);
    expect(listVisits(opened.db, trip.id)).toEqual(visitsBefore);
    const request = {
      operationId: randomUUID(),
      expectedRevision: preview.revision,
      command: {
        kind: 'path.delete',
        pathId: path.id,
        expectedPreviewFingerprint: preview.fingerprint,
        deleteSources: preview.selection,
      },
    };
    expect((await post('draft-operations', request, 'trips.route')).status).toBe(403);
    expect((await post('draft-operations', request, 'trips.routeDrafts.preview')).status).toBe(403);
    expect((await post('operations', request, 'trips.route')).status).toBe(400);
    const stale = await post(
      'draft-operations',
      { ...request, command: { ...request.command, expectedPreviewFingerprint: '0'.repeat(64) } },
      'trips.routeDrafts'
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'trips.route.route_draft_conflict',
      retryable: false,
    });
    expect(getTripRoute(opened.db, trip.id)).toEqual(routeBefore);
    expect(listVisits(opened.db, trip.id)).toEqual(visitsBefore);
    const deletionResponse = await post('draft-operations', request, 'trips.routeDrafts.operate');
    expect(deletionResponse.status).toBe(200);
    const deletion = RouteDraftOperationResultSchema.parse(await deletionResponse.json());
    expect(deletion.current.paths).toEqual([]);
    expect(listVisits(opened.db, trip.id)).toEqual([]);
    expect(deletion.currentSources).toContainEqual(
      expect.objectContaining({ source: { kind: 'visit', id: visit.id }, state: 'removed' })
    );
    const replay = await post('draft-operations', request, 'trips.routeDrafts');
    expect(replay.status).toBe(200);
    expect(RouteDraftOperationResultSchema.parse(await replay.json())).toEqual({
      ...deletion,
      replayed: true,
    });
    const undo = {
      operationId: randomUUID(),
      expectedRevision: deletion.current.revision,
      command: { kind: 'undo', targetOperationId: request.operationId },
    };
    expect((await post('operations', undo, 'trips.route')).status).toBe(409);
    expect(listVisits(opened.db, trip.id)).toEqual([]);
    const undoResponse = await post('draft-operations', undo, 'trips.routeDrafts');
    expect(undoResponse.status).toBe(200);
    const undone = RouteDraftOperationResultSchema.parse(await undoResponse.json());
    expect(undone.current.paths).toEqual(created.current.paths);
    expect(listVisits(opened.db, trip.id).map((row) => row.id)).toEqual([visit.id]);
    expect((await post('operations', undo, 'trips.route')).status).toBe(409);
    const afterUndo = await post('draft-operations', request, 'trips.routeDrafts');
    expect(afterUndo.status).toBe(200);
    expect(RouteDraftOperationResultSchema.parse(await afterUndo.json())).toMatchObject({
      receipt: deletion.receipt,
      current: undone.current,
      undone: true,
      replayed: true,
    });
  } finally {
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    opened.raw.close();
  }
});
