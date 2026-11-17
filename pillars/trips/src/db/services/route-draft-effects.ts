import { eq } from 'drizzle-orm';

import { journeys } from '../schema.js';
import { routeDraftRecordSource, routeDraftSourceKey } from './route-draft-records.js';
import { routeDraftReferenceGuard } from './route-draft-references.js';
import { readRouteDraftSnapshot } from './route-draft-snapshot.js';
import { nextRouteDraftRevision, writeRouteDraftLifecycle } from './route-draft-write.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { RouteDraftPreview } from '../../contract/route-draft-schemas.js';
import type { TripsDb } from '../index.js';
import type { RouteDraftInverse, RouteDraftRecord } from '../schema/route-draft-types.js';
import type { RouteDraftSnapshot } from './route-draft-snapshot.js';

/** Read one exact collection revision/order without dropping archived source identities from history. */
export function routeDraftCollection(
  snapshot: RouteDraftSnapshot,
  journeyId: number
): { revision: number; legIds: number[] } {
  const journey = snapshot.records.find(
    (record) => record.kind === 'journey' && record.row.id === journeyId
  );
  if (journey?.kind !== 'journey') throw new TripsServiceError('route_draft_conflict');
  const legs = snapshot.records.filter(
    (record) =>
      record.kind === 'journey-leg' &&
      record.row.journeyId === journeyId &&
      record.row.removedAt === null
  );
  const ordered = legs
    .flatMap((record) => (record.kind === 'journey-leg' ? [record.row] : []))
    .toSorted((left, right) => left.position - right.position || left.id - right.id);
  return { revision: journey.row.legRevision, legIds: ordered.map((row) => row.id) };
}

function removedRecords(
  snapshot: RouteDraftSnapshot,
  preview: RouteDraftPreview
): RouteDraftRecord[] {
  const selected = new Set(
    preview.candidates
      .filter((candidate) => candidate.disposition === 'remove')
      .map((candidate) => routeDraftSourceKey(candidate.source))
  );
  const records = snapshot.records.filter((record) =>
    selected.has(routeDraftSourceKey(routeDraftRecordSource(record)))
  );
  if (records.length !== selected.size) throw new TripsServiceError('route_draft_conflict');
  return records;
}

function beforeCollections(
  snapshot: RouteDraftSnapshot,
  records: RouteDraftRecord[]
): { journeyId: number; revision: number; legIds: number[] }[] {
  const journeyIds = new Set(
    records.flatMap((record) => (record.kind === 'journey-leg' ? [record.row.journeyId] : []))
  );
  return [...journeyIds].map((journeyId) => ({
    journeyId,
    ...routeDraftCollection(snapshot, journeyId),
  }));
}

function advanceJourneyCollections(
  db: TripsDb,
  collections: { journeyId: number; revision: number; legIds: number[] }[]
): void {
  for (const collection of collections) {
    requireOwnedRecord(
      db
        .update(journeys)
        .set({ legRevision: nextRouteDraftRevision(collection.revision) })
        .where(eq(journeys.id, collection.journeyId))
        .returning()
        .get()
    );
  }
}

function recordInverses(
  records: RouteDraftRecord[],
  after: RouteDraftSnapshot
): RouteDraftInverse['records'] {
  return records.map((before) => {
    const source = routeDraftRecordSource(before);
    const current = after.records.find(
      (record) =>
        routeDraftSourceKey(routeDraftRecordSource(record)) === routeDraftSourceKey(source)
    );
    if (current === undefined) throw new TripsServiceError('route_draft_conflict');
    return { before, after: current };
  });
}

function collectionInverses(
  collections: { journeyId: number; revision: number; legIds: number[] }[],
  after: RouteDraftSnapshot
): RouteDraftInverse['collections'] {
  return collections.map((collection) => {
    const current = routeDraftCollection(after, collection.journeyId);
    return {
      journeyId: collection.journeyId,
      beforeRevision: collection.revision,
      expectedRevision: current.revision,
      beforeLegIds: collection.legIds,
      afterLegIds: current.legIds,
    };
  });
}

/** Tombstone selected unconfirmed records and persist the exact owned after-state under the caller's transaction. */
export function applyRouteDraftEffects(
  db: TripsDb,
  snapshot: RouteDraftSnapshot,
  preview: RouteDraftPreview,
  operationId: string
): RouteDraftInverse {
  const records = removedRecords(snapshot, preview);
  const collections = beforeCollections(snapshot, records);
  const now = new Date().toISOString();
  for (const record of records)
    writeRouteDraftLifecycle(db, record, { kind: 'remove', operationId }, now);
  advanceJourneyCollections(db, collections);
  const after = readRouteDraftSnapshot(db, snapshot.route.tripId);
  return {
    records: recordInverses(records, after),
    collections: collectionInverses(collections, after),
    referenceGuard: routeDraftReferenceGuard(after, records.map(routeDraftRecordSource)),
  };
}
