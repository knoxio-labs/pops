import { and, asc, eq } from 'drizzle-orm';

import { TripDocumentAssociationSchema } from '../../contract/document-associations.js';
import { tripDocumentAssociations } from '../schema.js';
import { getEvent } from './events.js';
import { getJourney } from './journeys.js';
import { getTrip, getVisit } from './records.js';
import { isSourceTargetLive } from './source-availability.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';
import { getStay } from './stays.js';

import type {
  DocumentTargetKind,
  TripDocumentAssociation,
} from '../../contract/document-associations.js';
import type { TripsDb } from '../index.js';

/** List live-target document associations in stable order while retaining archived-target history. */
export function listDocumentAssociations(db: TripsDb, tripId: number): TripDocumentAssociation[] {
  return db.transaction((tx) => {
    getTrip(tx, tripId);
    return tx
      .select()
      .from(tripDocumentAssociations)
      .where(eq(tripDocumentAssociations.tripId, tripId))
      .orderBy(asc(tripDocumentAssociations.id))
      .all()
      .filter((row) => isSourceTargetLive(tx, tripId, row.targetKind, row.targetId))
      .map((association) => TripDocumentAssociationSchema.parse(association));
  });
}

/** Add a reference to one Documents-owned Paperless identity and an explicitly selected same-trip target. */
export function createDocumentAssociation(
  db: TripsDb,
  tripId: number,
  input: { documentId: number; targetKind: DocumentTargetKind; targetId: number }
): TripDocumentAssociation {
  return db.transaction(
    (tx) => {
      if (
        !Number.isSafeInteger(input.documentId) ||
        input.documentId <= 0 ||
        !Number.isSafeInteger(input.targetId) ||
        input.targetId <= 0
      )
        throw new TripsServiceError('association_invalid');
      getTrip(tx, tripId);
      if (input.targetKind === 'trip' && input.targetId !== tripId)
        throw new TripsServiceError('association_invalid');
      if (input.targetKind === 'visit') getVisit(tx, tripId, input.targetId);
      if (input.targetKind === 'journey') getJourney(tx, tripId, input.targetId);
      if (input.targetKind === 'stay') getStay(tx, tripId, input.targetId);
      if (input.targetKind === 'event') getEvent(tx, tripId, input.targetId);
      const existing = tx
        .select({ id: tripDocumentAssociations.id })
        .from(tripDocumentAssociations)
        .where(
          and(
            eq(tripDocumentAssociations.tripId, tripId),
            eq(tripDocumentAssociations.documentId, input.documentId),
            eq(tripDocumentAssociations.targetKind, input.targetKind),
            eq(tripDocumentAssociations.targetId, input.targetId)
          )
        )
        .get();
      if (existing) throw new TripsServiceError('association_exists');
      return TripDocumentAssociationSchema.parse(
        requireOwnedRecord(
          tx
            .insert(tripDocumentAssociations)
            .values({ ...input, tripId })
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Remove one association only, leaving the Documents-owned original unchanged. */
export function deleteDocumentAssociation(db: TripsDb, tripId: number, id: number): void {
  db.transaction(
    (tx) => {
      const row = requireOwnedRecord(
        tx
          .select()
          .from(tripDocumentAssociations)
          .where(
            and(eq(tripDocumentAssociations.tripId, tripId), eq(tripDocumentAssociations.id, id))
          )
          .get()
      );
      if (!isSourceTargetLive(tx, tripId, row.targetKind, row.targetId))
        throw new TripsServiceError('not_found');
      tx.delete(tripDocumentAssociations).where(eq(tripDocumentAssociations.id, row.id)).run();
    },
    { behavior: 'immediate' }
  );
}
