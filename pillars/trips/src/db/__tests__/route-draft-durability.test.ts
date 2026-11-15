import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { openTripsDb } from '../index.js';
import { createPlace, createTrip, createVisit, listVisits } from '../services/records.js';
import { operateRouteDraft } from '../services/route-draft-operations.js';
import { previewRouteDraftDeletion } from '../services/route-draft-snapshot.js';
import { operateTripRoute } from '../services/route-operations.js';
import { getTripRoute } from '../services/route-queries.js';
import { deletionRequest } from './route-draft-test-utils.js';

import type { OpenedTripsDb } from '../index.js';

function withDiskDatabase(run: (filename: string) => void): void {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(join(scratch, 'trips-draft-'));
  try {
    run(join(directory, 'trips.db'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function diskDraft(opened: OpenedTripsDb) {
  const { db } = opened;
  const trip = createTrip(db, { name: 'Durable draft' });
  const place = createPlace(db, { name: 'Original library Place' });
  const visit = createVisit(db, trip.id, { placeId: place.id });
  const gapResult = operateTripRoute(db, trip.id, {
    operationId: randomUUID(),
    expectedRevision: getTripRoute(db, trip.id).revision,
    command: { kind: 'gap.create', before: null },
  });
  const gap = gapResult.current.order.find((item) => item.kind === 'gap');
  if (gap === undefined) throw new Error('Expected gap');
  const created = operateTripRoute(db, trip.id, {
    operationId: randomUUID(),
    expectedRevision: gapResult.current.revision,
    command: {
      kind: 'path.create',
      title: 'Delete this draft',
      gapId: gap.id,
      members: [{ kind: 'visit', id: visit.id }],
    },
  });
  const path = created.current.paths[0];
  if (path === undefined) throw new Error('Expected path');
  return {
    trip,
    visit,
    path,
    request: deletionRequest(previewRouteDraftDeletion(db, trip.id, path.id, {})),
  };
}

it('persists original receipt, source removal and Undo across database reopen without replaying deletion', () => {
  withDiskDatabase((filename) => {
    let opened: OpenedTripsDb | undefined = openTripsDb(filename);
    try {
      const fixture = diskDraft(opened);
      const original = operateRouteDraft(opened.db, fixture.trip.id, fixture.request);
      opened.raw.close();
      opened = undefined;
      opened = openTripsDb(filename);
      const retry = operateRouteDraft(opened.db, fixture.trip.id, fixture.request);
      expect(retry).toMatchObject({ receipt: original.receipt, replayed: true, undone: false });
      expect(listVisits(opened.db, fixture.trip.id)).toEqual([]);
      const undoRequest = {
        operationId: randomUUID(),
        expectedRevision: retry.current.revision,
        command: { kind: 'undo' as const, targetOperationId: fixture.request.operationId },
      };
      const restored = operateRouteDraft(opened.db, fixture.trip.id, undoRequest);
      expect(restored.current.paths).toEqual([fixture.path]);
      expect(listVisits(opened.db, fixture.trip.id)).toMatchObject([{ id: fixture.visit.id }]);
      opened.raw.close();
      opened = undefined;
      opened = openTripsDb(filename);
      expect(operateRouteDraft(opened.db, fixture.trip.id, undoRequest)).toMatchObject({
        receipt: restored.receipt,
        replayed: true,
      });
      expect(operateRouteDraft(opened.db, fixture.trip.id, fixture.request)).toMatchObject({
        receipt: original.receipt,
        undone: true,
        replayed: true,
      });
      expect(getTripRoute(opened.db, fixture.trip.id).paths).toEqual([fixture.path]);
    } finally {
      opened?.raw.close();
    }
  });
});

it('serializes competing connections and never exposes an uncommitted route/source partial outcome', () => {
  withDiskDatabase((filename) => {
    const primary = openTripsDb(filename);
    let observer: OpenedTripsDb | undefined;
    try {
      const fixture = diskDraft(primary);
      observer = openTripsDb(filename);
      const second = observer;
      second.raw.pragma('busy_timeout = 0');
      primary.db.transaction(
        (tx) => {
          expect(() => operateRouteDraft(second.db, fixture.trip.id, fixture.request)).toThrow(
            /locked/u
          );
          operateRouteDraft(tx, fixture.trip.id, fixture.request);
          expect(getTripRoute(second.db, fixture.trip.id).paths).toEqual([fixture.path]);
          expect(listVisits(second.db, fixture.trip.id)).toEqual([fixture.visit]);
        },
        { behavior: 'immediate' }
      );
      expect(operateRouteDraft(second.db, fixture.trip.id, fixture.request)).toMatchObject({
        replayed: true,
        undone: false,
      });
      expect(getTripRoute(second.db, fixture.trip.id).paths).toEqual([]);
      expect(listVisits(second.db, fixture.trip.id)).toEqual([]);
    } finally {
      observer?.raw.close();
      primary.raw.close();
    }
  });
});
