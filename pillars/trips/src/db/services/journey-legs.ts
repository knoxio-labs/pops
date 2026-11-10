import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { JourneyLegSchema } from '../../contract/journey-schemas.js';
import { journeyLegs } from '../schema.js';
import { getJourney } from './journeys.js';
import { writeLegOrder } from './leg-order.js';
import { advanceLegRevision, requireWritableLegRevision } from './leg-revision.js';
import { getPlace } from './records.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type {
  JourneyEndpoint,
  JourneyLeg,
  JourneyLegInput,
} from '../../contract/journey-schemas.js';
import type { LegWritePrecondition } from '../../contract/leg-removal-schemas.js';
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
    .where(and(eq(journeyLegs.journeyId, journeyId), isNull(journeyLegs.removedAt)))
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
        .where(
          and(
            eq(journeyLegs.journeyId, journeyId),
            eq(journeyLegs.id, id),
            isNull(journeyLegs.removedAt)
          )
        )
        .get()
    )
  );
}

/** Append a leg with independently selected endpoint, reservation and purchase facts. */
export function createJourneyLeg(
  db: TripsDb,
  tripId: number,
  journeyId: number,
  input: JourneyLegInput & LegWritePrecondition
): JourneyLeg {
  return db.transaction(
    (tx) => {
      const { expectedRevision, ...fields } = input;
      const revision = requireWritableLegRevision(tx, { tripId, journeyId }, expectedRevision);
      checkEndpoint(tx, fields.from);
      checkEndpoint(tx, fields.to);
      const last = tx
        .select({ position: journeyLegs.position })
        .from(journeyLegs)
        .where(and(eq(journeyLegs.journeyId, journeyId), isNull(journeyLegs.removedAt)))
        .orderBy(desc(journeyLegs.position))
        .limit(1)
        .get();
      const leg = JourneyLegSchema.parse(
        requireOwnedRecord(
          tx
            .insert(journeyLegs)
            .values({ ...fields, journeyId, position: last === undefined ? 0 : last.position + 1 })
            .returning()
            .get()
        )
      );
      advanceLegRevision(tx, journeyId, revision);
      return leg;
    },
    { behavior: 'immediate' }
  );
}

/** Patch supplied source facts; endpoint replacement never fills fields from a place or another leg. */
export function updateJourneyLeg(
  db: TripsDb,
  identity: { tripId: number; journeyId: number; id: number },
  input: JourneyLegInput & LegWritePrecondition
): JourneyLeg {
  const { tripId, journeyId, id } = identity;
  return db.transaction(
    (tx) => {
      const { expectedRevision, ...fields } = input;
      const revision = requireWritableLegRevision(tx, { tripId, journeyId }, expectedRevision);
      getJourneyLeg(tx, tripId, journeyId, id);
      checkEndpoint(tx, fields.from);
      checkEndpoint(tx, fields.to);
      const leg = JourneyLegSchema.parse(
        requireOwnedRecord(
          tx
            .update(journeyLegs)
            .set({ ...fields, updatedAt: new Date().toISOString() })
            .where(
              and(
                eq(journeyLegs.journeyId, journeyId),
                eq(journeyLegs.id, id),
                isNull(journeyLegs.removedAt)
              )
            )
            .returning()
            .get()
        )
      );
      advanceLegRevision(tx, journeyId, revision);
      return leg;
    },
    { behavior: 'immediate' }
  );
}

/** Atomically reorder the exact leg membership without touching source facts or audit timestamps. */
export function reorderJourneyLegs(
  db: TripsDb,
  tripId: number,
  journeyId: number,
  order: number[] | ({ legIds: number[] } & LegWritePrecondition)
): JourneyLeg[] {
  return db.transaction(
    (tx) => {
      const { legIds, expectedRevision } = Array.isArray(order)
        ? { legIds: order, expectedRevision: undefined }
        : order;
      const revision = requireWritableLegRevision(tx, { tripId, journeyId }, expectedRevision);
      const current = listJourneyLegs(tx, tripId, journeyId);
      const expected = new Set(current.map((leg) => leg.id));
      if (
        legIds.length !== current.length ||
        new Set(legIds).size !== legIds.length ||
        legIds.some((id) => !expected.has(id))
      )
        throw new TripsServiceError('order_invalid');
      writeLegOrder(tx, journeyId, legIds);
      advanceLegRevision(tx, journeyId, revision);
      return listJourneyLegs(tx, tripId, journeyId);
    },
    { behavior: 'immediate' }
  );
}

/** Remove an explicitly selected leg without changing any other leg's source or booking facts. */
export function deleteJourneyLeg(db: TripsDb, tripId: number, journeyId: number, id: number): void {
  db.transaction(
    (tx) => {
      const revision = requireWritableLegRevision(tx, { tripId, journeyId });
      getJourneyLeg(tx, tripId, journeyId, id);
      tx.delete(journeyLegs)
        .where(
          and(
            eq(journeyLegs.journeyId, journeyId),
            eq(journeyLegs.id, id),
            isNull(journeyLegs.removedAt)
          )
        )
        .run();
      advanceLegRevision(tx, journeyId, revision);
    },
    { behavior: 'immediate' }
  );
}
