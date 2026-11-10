import { and, asc, eq } from 'drizzle-orm';

import { JourneySchema } from '../../contract/journey-schemas.js';
import { journeys, journeyLegs, journeyGroupMembers } from '../schema.js';
import { deleteDocumentAssociationsForTarget } from './document-association-cleanup.js';
import { getTrip } from './records.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { Journey, JourneyInput } from '../../contract/journey-schemas.js';
import type { TripsDb } from '../index.js';

/** Read one trip's journeys without deriving route placement or date ordering. */
export function listJourneys(db: TripsDb, tripId: number): Journey[] {
  getTrip(db, tripId);
  return db
    .select()
    .from(journeys)
    .where(eq(journeys.tripId, tripId))
    .orderBy(asc(journeys.id))
    .all()
    .map((row) => JourneySchema.parse(row));
}

/** Read a journey only through its owning trip. */
export function getJourney(db: TripsDb, tripId: number, id: number): Journey {
  return JourneySchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(journeys)
        .where(and(eq(journeys.tripId, tripId), eq(journeys.id, id)))
        .get()
    )
  );
}

/** Create an empty or partially captured journey with no selected source defaults. */
export function createJourney(db: TripsDb, tripId: number, input: JourneyInput): Journey {
  return db.transaction(
    (tx) => {
      getTrip(tx, tripId);
      return JourneySchema.parse(
        requireOwnedRecord(
          tx
            .insert(journeys)
            .values({ ...input, tripId })
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Patch supplied fields; buffers replace the complete configuration, including explicit clearing. */
export function updateJourney(
  db: TripsDb,
  tripId: number,
  id: number,
  input: JourneyInput
): Journey {
  return JourneySchema.parse(
    requireOwnedRecord(
      db
        .update(journeys)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(and(eq(journeys.tripId, tripId), eq(journeys.id, id)))
        .returning()
        .get()
    )
  );
}

/** Remove one explicitly selected journey and its legs atomically; no external booking is cancelled. */
export function deleteJourney(db: TripsDb, tripId: number, id: number): void {
  db.transaction(
    (tx) => {
      getJourney(tx, tripId, id);
      if (
        tx
          .select({ groupId: journeyGroupMembers.groupId })
          .from(journeyGroupMembers)
          .where(eq(journeyGroupMembers.journeyId, id))
          .limit(1)
          .get()
      )
        throw new TripsServiceError('journey_grouped');
      deleteDocumentAssociationsForTarget(tx, tripId, 'journey', id);
      tx.delete(journeyLegs).where(eq(journeyLegs.journeyId, id)).run();
      tx.delete(journeys)
        .where(and(eq(journeys.tripId, tripId), eq(journeys.id, id)))
        .run();
    },
    { behavior: 'immediate' }
  );
}
