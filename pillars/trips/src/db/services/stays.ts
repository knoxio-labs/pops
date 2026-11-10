import { and, asc, eq } from 'drizzle-orm';

import { StaySchema } from '../../contract/stay-schemas.js';
import { stays } from '../schema.js';
import { deleteDocumentAssociationsForTarget } from './document-association-cleanup.js';
import { getTrip, getVisit } from './records.js';
import { deleteResponsibilityForTarget } from './responsibility-cleanup.js';
import { requireOwnedRecord } from './source-record.js';

import type { Stay, StayInput } from '../../contract/stay-schemas.js';
import type { TripsDb } from '../index.js';

/** Read a trip's stays in stable identity order without deriving route or date ordering. */
export function listStays(db: TripsDb, tripId: number): Stay[] {
  getTrip(db, tripId);
  return db
    .select()
    .from(stays)
    .where(eq(stays.tripId, tripId))
    .orderBy(asc(stays.id))
    .all()
    .map((row) => StaySchema.parse(row));
}

/** Read a stay only through its owning trip. */
export function getStay(db: TripsDb, tripId: number, id: number): Stay {
  return StaySchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(stays)
        .where(and(eq(stays.tripId, tripId), eq(stays.id, id)))
        .get()
    )
  );
}

/** Create partial stay facts; an explicit visit must belong to the same trip. */
export function createStay(db: TripsDb, tripId: number, input: StayInput): Stay {
  return db.transaction(
    (tx) => {
      getTrip(tx, tripId);
      if (input.visitId !== undefined && input.visitId !== null)
        getVisit(tx, tripId, input.visitId);
      return StaySchema.parse(
        requireOwnedRecord(
          tx
            .insert(stays)
            .values({ ...input, tripId })
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Patch supplied fields atomically; timing/arrays replace complete values and null detaches a visit. */
export function updateStay(db: TripsDb, tripId: number, id: number, input: StayInput): Stay {
  return db.transaction(
    (tx) => {
      getStay(tx, tripId, id);
      if (input.visitId !== undefined && input.visitId !== null)
        getVisit(tx, tripId, input.visitId);
      return StaySchema.parse(
        requireOwnedRecord(
          tx
            .update(stays)
            .set({ ...input, updatedAt: new Date().toISOString() })
            .where(and(eq(stays.tripId, tripId), eq(stays.id, id)))
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Remove one stay and its document associations atomically without changing linked originals. */
export function deleteStay(db: TripsDb, tripId: number, id: number): void {
  db.transaction(
    (tx) => {
      getStay(tx, tripId, id);
      deleteDocumentAssociationsForTarget(tx, tripId, 'stay', id);
      deleteResponsibilityForTarget(tx, tripId, 'stay', id);
      requireOwnedRecord(
        tx
          .delete(stays)
          .where(and(eq(stays.tripId, tripId), eq(stays.id, id)))
          .returning()
          .get()
      );
    },
    { behavior: 'immediate' }
  );
}
