import { and, asc, eq } from 'drizzle-orm';

import { PlaceSchema, TripSchema, VisitSchema } from '../contract/schemas.js';
import { places, trips, visits } from './schema.js';

import type {
  Place,
  Trip,
  Visit,
  PlaceInput,
  PlaceUpdate,
  TripInput,
  VisitInput,
  VisitUpdate,
} from '../contract/schemas.js';
import type { TripsDb } from './index.js';

/** A missing owned reference or invalid complete route permutation. */
export class TripsServiceError extends Error {
  constructor(readonly code: 'not_found' | 'order_invalid') {
    super(code);
    this.name = 'TripsServiceError';
  }
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new TripsServiceError('not_found');
  return value;
}

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
  return TripSchema.parse(required(db.select().from(trips).where(eq(trips.id, id)).get()));
}

/** Persist explicit trip metadata; an unnamed trip retains a null name. */
export function createTrip(db: TripsDb, input: TripInput): Trip {
  return TripSchema.parse(required(db.insert(trips).values(input).returning().get()));
}

/** Patch only supplied trip fields. */
export function updateTrip(db: TripsDb, id: number, input: TripInput): Trip {
  return TripSchema.parse(
    required(
      db
        .update(trips)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(eq(trips.id, id))
        .returning()
        .get()
    )
  );
}

/** List manually captured place identities without provider inference or deduplication. */
export function listPlaces(db: TripsDb): Place[] {
  return db
    .select()
    .from(places)
    .orderBy(asc(places.id))
    .all()
    .map((row) => PlaceSchema.parse(row));
}

/** Resolve an explicit place identity. */
export function getPlace(db: TripsDb, id: number): Place {
  return PlaceSchema.parse(required(db.select().from(places).where(eq(places.id, id)).get()));
}

/** Create a reusable place without guessing whether similarly named places are identical. */
export function createPlace(db: TripsDb, input: PlaceInput): Place {
  return PlaceSchema.parse(required(db.insert(places).values(input).returning().get()));
}

/** Patch a place while retaining every visit's reference to its identity. */
export function updatePlace(db: TripsDb, id: number, input: PlaceUpdate): Place {
  return PlaceSchema.parse(
    required(
      db
        .update(places)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(eq(places.id, id))
        .returning()
        .get()
    )
  );
}

/** Read one trip's visits in explicit route order, including repeated places. */
export function listVisits(db: TripsDb, tripId: number): Visit[] {
  getTrip(db, tripId);
  return db
    .select()
    .from(visits)
    .where(eq(visits.tripId, tripId))
    .orderBy(asc(visits.position), asc(visits.id))
    .all()
    .map((row) => VisitSchema.parse(row));
}

/** Read a visit only within its owning trip. */
export function getVisit(db: TripsDb, tripId: number, id: number): Visit {
  return VisitSchema.parse(
    required(
      db
        .select()
        .from(visits)
        .where(and(eq(visits.tripId, tripId), eq(visits.id, id)))
        .get()
    )
  );
}

/** Append a distinct occurrence of a place without copying dates from other visits. */
export function createVisit(db: TripsDb, tripId: number, input: VisitInput): Visit {
  return db.transaction(
    (tx) => {
      const current = listVisits(tx, tripId);
      getPlace(tx, input.placeId);
      return VisitSchema.parse(
        required(
          tx
            .insert(visits)
            .values({ ...input, tripId, position: current.length })
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Patch a visit in its owning trip; timing replaces rather than merges its source value. */
export function updateVisit(db: TripsDb, tripId: number, id: number, input: VisitUpdate): Visit {
  return db.transaction(
    (tx) => {
      getVisit(tx, tripId, id);
      if (input.placeId !== undefined) getPlace(tx, input.placeId);
      return VisitSchema.parse(
        required(
          tx
            .update(visits)
            .set({ ...input, updatedAt: new Date().toISOString() })
            .where(and(eq(visits.id, id), eq(visits.tripId, tripId)))
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Atomically replace the complete route order; all source facts and timestamps remain unchanged. */
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
      for (const [position, id] of visitIds.entries()) {
        tx.update(visits)
          .set({ position })
          .where(and(eq(visits.id, id), eq(visits.tripId, tripId)))
          .run();
      }
      return listVisits(tx, tripId);
    },
    { behavior: 'immediate' }
  );
}
