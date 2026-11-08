import { and, asc, desc, eq } from 'drizzle-orm';

import { JourneyLegSchema } from '../../contract/journey-schemas.js';
import { journeyLegs } from '../schema.js';
import { getJourney } from './journeys.js';
import { getPlace } from './records.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type {
  JourneyEndpoint,
  JourneyLeg,
  JourneyLegInput,
} from '../../contract/journey-schemas.js';
import type { TripsDb } from '../index.js';

function checkEndpoint(db: TripsDb, endpoint: JourneyEndpoint | undefined): void {
  if (endpoint?.placeId !== undefined) getPlace(db, endpoint.placeId);
}

/** List source legs in explicit order, retaining partial and contradictory timing. */
export function listJourneyLegs(db: TripsDb, tripId: number, journeyId: number): JourneyLeg[] {
  getJourney(db, tripId, journeyId);
  return db
    .select()
    .from(journeyLegs)
    .where(eq(journeyLegs.journeyId, journeyId))
    .orderBy(asc(journeyLegs.position), asc(journeyLegs.id))
    .all()
    .map((row) => JourneyLegSchema.parse(row));
}

/** Read a leg only through its owning journey and trip. */
export function getJourneyLeg(
  db: TripsDb,
  tripId: number,
  journeyId: number,
  id: number
): JourneyLeg {
  getJourney(db, tripId, journeyId);
  return JourneyLegSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(journeyLegs)
        .where(and(eq(journeyLegs.journeyId, journeyId), eq(journeyLegs.id, id)))
        .get()
    )
  );
}

/** Append a leg with independently selected endpoint, reservation and purchase facts. */
export function createJourneyLeg(
  db: TripsDb,
  tripId: number,
  journeyId: number,
  input: JourneyLegInput
): JourneyLeg {
  return db.transaction(
    (tx) => {
      getJourney(tx, tripId, journeyId);
      checkEndpoint(tx, input.from);
      checkEndpoint(tx, input.to);
      const last = tx
        .select({ position: journeyLegs.position })
        .from(journeyLegs)
        .where(eq(journeyLegs.journeyId, journeyId))
        .orderBy(desc(journeyLegs.position))
        .limit(1)
        .get();
      return JourneyLegSchema.parse(
        requireOwnedRecord(
          tx
            .insert(journeyLegs)
            .values({ ...input, journeyId, position: last === undefined ? 0 : last.position + 1 })
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Patch supplied source facts; endpoint replacement never fills fields from a place or another leg. */
export function updateJourneyLeg(
  db: TripsDb,
  identity: { tripId: number; journeyId: number; id: number },
  input: JourneyLegInput
): JourneyLeg {
  const { tripId, journeyId, id } = identity;
  return db.transaction(
    (tx) => {
      getJourneyLeg(tx, tripId, journeyId, id);
      checkEndpoint(tx, input.from);
      checkEndpoint(tx, input.to);
      return JourneyLegSchema.parse(
        requireOwnedRecord(
          tx
            .update(journeyLegs)
            .set({ ...input, updatedAt: new Date().toISOString() })
            .where(and(eq(journeyLegs.journeyId, journeyId), eq(journeyLegs.id, id)))
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Atomically reorder the exact leg membership without touching source facts or audit timestamps. */
export function reorderJourneyLegs(
  db: TripsDb,
  tripId: number,
  journeyId: number,
  legIds: number[]
): JourneyLeg[] {
  return db.transaction(
    (tx) => {
      const current = listJourneyLegs(tx, tripId, journeyId);
      const expected = new Set(current.map((leg) => leg.id));
      if (
        legIds.length !== current.length ||
        new Set(legIds).size !== legIds.length ||
        legIds.some((id) => !expected.has(id))
      )
        throw new TripsServiceError('order_invalid');
      for (const [position, id] of legIds.entries())
        tx.update(journeyLegs)
          .set({ position })
          .where(and(eq(journeyLegs.journeyId, journeyId), eq(journeyLegs.id, id)))
          .run();
      return listJourneyLegs(tx, tripId, journeyId);
    },
    { behavior: 'immediate' }
  );
}

/** Remove an explicitly selected leg without changing any other leg's source or booking facts. */
export function deleteJourneyLeg(db: TripsDb, tripId: number, journeyId: number, id: number): void {
  db.transaction(
    (tx) => {
      getJourneyLeg(tx, tripId, journeyId, id);
      tx.delete(journeyLegs)
        .where(and(eq(journeyLegs.journeyId, journeyId), eq(journeyLegs.id, id)))
        .run();
    },
    { behavior: 'immediate' }
  );
}
