import { and, asc, eq, isNull } from 'drizzle-orm';

import { TripSchema, VisitSchema } from '../../contract/schemas.js';
import { trips, visits } from '../schema.js';
import { getPlace } from './places.js';
import { appendRouteVisit, initializeTripRoute } from './route-storage.js';
import { projectVisitOrder, reorderLegacyRoute } from './route-visit-order.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';
import { validateTripAssociations } from './trip-associations.js';

import type { Trip, Visit, TripInput, VisitInput, VisitUpdate } from '../../contract/schemas.js';
import type { TripsDb } from '../index.js';

/** Read trips in creation order without deriving a name or timing. */
export function listTrips(db: TripsDb): Trip[] {
  return db
    .select()
    .from(trips)
    .orderBy(asc(trips.id))
    .all()
    .map((row) => TripSchema.parse(row));
}

/** Read one trip, failing when its identity does not exist. */
export function getTrip(db: TripsDb, id: number): Trip {
  return TripSchema.parse(
    requireOwnedRecord(db.select().from(trips).where(eq(trips.id, id)).get())
  );
}

/** Persist explicit trip metadata; an unnamed trip retains a null name. */
export function createTrip(db: TripsDb, input: TripInput): Trip {
  return db.transaction((tx) => {
    validateTripAssociations(tx, input);
    const trip = TripSchema.parse(
      requireOwnedRecord(tx.insert(trips).values(input).returning().get())
    );
    initializeTripRoute(tx, trip.id);
    return trip;
  });
}

/** Patch only supplied trip fields. */
export function updateTrip(db: TripsDb, id: number, input: TripInput): Trip {
  return db.transaction((tx) => {
    getTrip(tx, id);
    validateTripAssociations(tx, input, id);
    return TripSchema.parse(
      requireOwnedRecord(
        tx
          .update(trips)
          .set({ ...input, updatedAt: new Date().toISOString() })
          .where(eq(trips.id, id))
          .returning()
          .get()
      )
    );
  });
}

export { createPlace, getPlace, listPlaces, updatePlace } from './places.js';

/** Read one trip's visits in explicit route order, including repeated places. */
export function listVisits(db: TripsDb, tripId: number): Visit[] {
  getTrip(db, tripId);
  const rows = db
    .select()
    .from(visits)
    .where(and(eq(visits.tripId, tripId), isNull(visits.removedAt)))
    .orderBy(asc(visits.position), asc(visits.id))
    .all()
    .map((row) => VisitSchema.parse(row));
  return projectVisitOrder(db, tripId, rows);
}

/** Read a visit only within its owning trip. */
export function getVisit(db: TripsDb, tripId: number, id: number): Visit {
  return VisitSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(visits)
        .where(and(eq(visits.tripId, tripId), eq(visits.id, id), isNull(visits.removedAt)))
        .get()
    )
  );
}

/** Validate supplied Visit links; unchanged missing or archived identities survive, but known foreign owners never do. */
export function validateRetainedVisitReference(
  db: TripsDb,
  tripId: number,
  id: number | null | undefined,
  previousId: number | null | undefined
): void {
  if (id === undefined || id === null) return;
  if (id !== previousId) {
    getVisit(db, tripId, id);
    return;
  }
  const owner = db.select({ tripId: visits.tripId }).from(visits).where(eq(visits.id, id)).get();
  if (owner !== undefined && owner.tripId !== tripId) throw new TripsServiceError('not_found');
}

/** Append a distinct occurrence of a place without copying dates from other visits. */
export function createVisit(db: TripsDb, tripId: number, input: VisitInput): Visit {
  return db.transaction(
    (tx) => {
      const current = listVisits(tx, tripId);
      getPlace(tx, input.placeId);
      const visit = VisitSchema.parse(
        requireOwnedRecord(
          tx
            .insert(visits)
            .values({ ...input, tripId, position: current.length })
            .returning()
            .get()
        )
      );
      appendRouteVisit(tx, tripId, visit.id);
      return visit;
    },
    { behavior: 'immediate' }
  );
}

/** Patch a visit in its owning trip; timing replaces rather than merges its source value. */
export function updateVisit(db: TripsDb, tripId: number, id: number, input: VisitUpdate): Visit {
  return db.transaction(
    (tx) => {
      const current = getVisit(tx, tripId, id);
      const { expectedRevision, ...fields } = input;
      if (expectedRevision !== undefined && expectedRevision !== current.revision)
        throw new TripsServiceError('visit_revision_conflict');
      const revision = nextVisitRevision(current.revision);
      if (input.placeId !== undefined) getPlace(tx, input.placeId);
      return VisitSchema.parse(
        requireOwnedRecord(
          tx
            .update(visits)
            .set({ ...fields, revision, updatedAt: new Date().toISOString() })
            .where(and(eq(visits.id, id), eq(visits.tripId, tripId)))
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Atomically replace route order; source facts and timestamps remain, and each written row advances revision. */
export function reorderVisits(db: TripsDb, tripId: number, visitIds: number[]): Visit[] {
  return db.transaction(
    (tx) => {
      const current = listVisits(tx, tripId);
      const expected = new Set(current.map((visit) => visit.id));
      if (
        visitIds.length !== current.length ||
        new Set(visitIds).size !== visitIds.length ||
        visitIds.some((id) => !expected.has(id))
      ) {
        throw new TripsServiceError('order_invalid');
      }
      const revisions = new Map(
        current.map((visit) => [visit.id, nextVisitRevision(visit.revision)])
      );
      reorderLegacyRoute(tx, tripId, visitIds);
      const ordered = projectVisitOrder(tx, tripId, current).map((visit) => visit.id);
      for (const [position, id] of ordered.entries()) {
        tx.update(visits)
          .set({ position, revision: revisions.get(id) })
          .where(and(eq(visits.id, id), eq(visits.tripId, tripId)))
          .run();
      }
      return listVisits(tx, tripId);
    },
    { behavior: 'immediate' }
  );
}

function nextVisitRevision(revision: number): number {
  if (revision >= Number.MAX_SAFE_INTEGER) throw new TripsServiceError('visit_revision_exhausted');
  return revision + 1;
}
