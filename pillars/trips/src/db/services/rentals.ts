import { and, asc, eq } from 'drizzle-orm';

import { RentalSchema } from '../../contract/rental-schemas.js';
import { rentals } from '../schema.js';
import { requireArrangementRevision } from './arrangement-revision.js';
import { getTrip, getVisit } from './records.js';
import { deleteResponsibilityForTarget } from './responsibility-cleanup.js';
import { requireOwnedRecord } from './source-record.js';

import type { Rental, RentalInput } from '../../contract/rental-schemas.js';
import type { TripsDb } from '../index.js';

function validateVisits(db: TripsDb, tripId: number, input: RentalInput, current?: Rental): void {
  for (const key of ['pickupVisitId', 'returnVisitId'] as const) {
    const id = input[key];
    if (id !== undefined && id !== null && id !== current?.[key]) getVisit(db, tripId, id);
  }
}
/** Read rentals in stable identity order without projecting route coverage. */
export function listRentals(db: TripsDb, tripId: number): Rental[] {
  getTrip(db, tripId);
  return db
    .select()
    .from(rentals)
    .where(eq(rentals.tripId, tripId))
    .orderBy(asc(rentals.id))
    .all()
    .map((row) => RentalSchema.parse(row));
}
/** Read one rental through its owning trip only. */
export function getRental(db: TripsDb, tripId: number, id: number): Rental {
  return RentalSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(rentals)
        .where(and(eq(rentals.tripId, tripId), eq(rentals.id, id)))
        .get()
    )
  );
}
/** Create partial source facts, validating only explicitly supplied Visit occurrences. */
export function createRental(db: TripsDb, tripId: number, input: RentalInput): Rental {
  return db.transaction(
    (tx) => {
      getTrip(tx, tripId);
      validateVisits(tx, tripId, input);
      return RentalSchema.parse(
        requireOwnedRecord(
          tx
            .insert(rentals)
            .values({ ...input, tripId })
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}
/** Patch supplied independent facts and advance the matching revision atomically. */
export function updateRental(
  db: TripsDb,
  tripId: number,
  id: number,
  input: RentalInput & { expectedRevision: number }
): Rental {
  return db.transaction(
    (tx) => {
      const rental = getRental(tx, tripId, id);
      requireArrangementRevision(rental.revision, input.expectedRevision);
      const { expectedRevision, ...fields } = input;
      validateVisits(tx, tripId, fields, rental);
      return RentalSchema.parse(
        requireOwnedRecord(
          tx
            .update(rentals)
            .set({ ...fields, revision: expectedRevision + 1, updatedAt: new Date().toISOString() })
            .where(and(eq(rentals.tripId, tripId), eq(rentals.id, id)))
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}
/** Delete a matching revision and its responsibility without modifying any external source. */
export function deleteRental(
  db: TripsDb,
  tripId: number,
  id: number,
  expectedRevision: number
): void {
  db.transaction(
    (tx) => {
      const rental = getRental(tx, tripId, id);
      requireArrangementRevision(rental.revision, expectedRevision);
      deleteResponsibilityForTarget(tx, tripId, 'rental', id);
      tx.delete(rentals)
        .where(and(eq(rentals.tripId, tripId), eq(rentals.id, id)))
        .run();
    },
    { behavior: 'immediate' }
  );
}
