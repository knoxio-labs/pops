import { isDeepStrictEqual } from 'node:util';

import { eq } from 'drizzle-orm';

import { journeys } from '../schema.js';
import { routeDraftCollection } from './route-draft-effects.js';
import {
  routeDraftRecordRemoved,
  routeDraftRecordSource,
  routeDraftSourceKey,
} from './route-draft-records.js';
import { routeDraftReferenceGuard } from './route-draft-references.js';
import { readRouteDraftSnapshot } from './route-draft-snapshot.js';
import { nextRouteDraftRevision, writeRouteDraftLifecycle } from './route-draft-write.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { TripsDb } from '../index.js';
import type { RouteDraftInverse } from '../schema/route-draft-types.js';
import type { RouteDraftSnapshot } from './route-draft-snapshot.js';

function assertRemovedRecordsOwned(
  snapshot: RouteDraftSnapshot,
  inverse: RouteDraftInverse,
  operationId: string
): void {
  for (const entry of inverse.records) {
    const source = routeDraftRecordSource(entry.after);
    const current = snapshot.records.find(
      (record) =>
        routeDraftSourceKey(routeDraftRecordSource(record)) === routeDraftSourceKey(source)
    );
    if (
      current === undefined ||
      !isDeepStrictEqual(current, entry.after) ||
      !routeDraftRecordRemoved(current) ||
      current.row.removalOperationId !== operationId ||
      routeDraftSourceKey(routeDraftRecordSource(entry.before)) !== routeDraftSourceKey(source)
    ) {
      throw new TripsServiceError('route_draft_undo_conflict');
    }
  }
}

function assertChangedCollections(snapshot: RouteDraftSnapshot, inverse: RouteDraftInverse): void {
  for (const collection of inverse.collections) {
    const current = routeDraftCollection(snapshot, collection.journeyId);
    if (
      current.revision !== collection.expectedRevision ||
      !isDeepStrictEqual(current.legIds, collection.afterLegIds)
    ) {
      throw new TripsServiceError('route_draft_undo_conflict');
    }
  }
}

function restoreRemovedSources(db: TripsDb, inverse: RouteDraftInverse): void {
  const now = new Date().toISOString();
  for (const entry of inverse.records)
    writeRouteDraftLifecycle(db, entry.after, { kind: 'restore' }, now);
  for (const collection of inverse.collections) {
    requireOwnedRecord(
      db
        .update(journeys)
        .set({ legRevision: nextRouteDraftRevision(collection.expectedRevision) })
        .where(eq(journeys.id, collection.journeyId))
        .returning()
        .get()
    );
  }
}

function assertBeforeCollectionsRestored(
  snapshot: RouteDraftSnapshot,
  inverse: RouteDraftInverse
): void {
  for (const collection of inverse.collections) {
    if (
      !isDeepStrictEqual(
        routeDraftCollection(snapshot, collection.journeyId).legIds,
        collection.beforeLegIds
      )
    ) {
      throw new TripsServiceError('route_draft_undo_conflict');
    }
  }
}

/** Restore only this operation's untouched source lifecycles, keeping all original IDs and independent facts. */
export function restoreRouteDraftEffects(
  db: TripsDb,
  snapshot: RouteDraftSnapshot,
  inverse: RouteDraftInverse,
  operationId: string
): RouteDraftSnapshot {
  const sources = inverse.records.map((entry) => routeDraftRecordSource(entry.after));
  if (routeDraftReferenceGuard(snapshot, sources) !== inverse.referenceGuard) {
    throw new TripsServiceError('route_draft_undo_conflict');
  }
  assertRemovedRecordsOwned(snapshot, inverse, operationId);
  assertChangedCollections(snapshot, inverse);
  restoreRemovedSources(db, inverse);
  const after = readRouteDraftSnapshot(db, snapshot.route.tripId);
  assertBeforeCollectionsRestored(after, inverse);
  return after;
}

/** Advance predecessor source guards only where this exact inverse proves their own prior after-state. */
export function acknowledgeRouteDraftInverse(
  predecessor: RouteDraftInverse,
  prior: RouteDraftInverse,
  restoredSnapshot: RouteDraftSnapshot
): RouteDraftInverse {
  return {
    ...predecessor,
    records: predecessor.records.map((entry) => {
      const matched = prior.records.some((changed) =>
        isDeepStrictEqual(changed.before, entry.after)
      );
      if (!matched) return entry;
      const source = routeDraftRecordSource(entry.after);
      const current = restoredSnapshot.records.find(
        (record) =>
          routeDraftSourceKey(routeDraftRecordSource(record)) === routeDraftSourceKey(source)
      );
      if (current === undefined) throw new TripsServiceError('route_draft_undo_conflict');
      return { ...entry, after: current };
    }),
    collections: predecessor.collections.map((entry) => {
      const matched = prior.collections.some(
        (changed) =>
          changed.journeyId === entry.journeyId &&
          changed.beforeRevision === entry.expectedRevision &&
          isDeepStrictEqual(changed.beforeLegIds, entry.afterLegIds)
      );
      return matched
        ? {
            ...entry,
            expectedRevision: routeDraftCollection(restoredSnapshot, entry.journeyId).revision,
          }
        : entry;
    }),
  };
}
