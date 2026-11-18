import { and, asc, eq, isNull } from 'drizzle-orm';

import { JourneyLegSchema } from '../../contract/journey-schemas.js';
import { journeyLegs } from '../schema.js';
import { createJourneyLegInTransaction } from './journey-leg-create.js';
import { checkJourneyLegEndpoint, resolvedJourneyEndpoint } from './journey-leg-input.js';
import { getJourney } from './journeys.js';
import { writeLegOrder } from './leg-order.js';
import { advanceLegRevision, requireWritableLegRevision } from './leg-revision.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { JourneyLeg, JourneyLegInput } from '../../contract/journey-schemas.js';
import type { LegWritePrecondition } from '../../contract/leg-removal-schemas.js';
import type { TripsDb } from '../index.js';

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
      return createJourneyLegInTransaction(tx, { tripId, journeyId }, fields, expectedRevision);
    },
    { behavior: 'immediate' }
  );
}

/** Append a leg within a caller-owned immediate transaction. */
export function createJourneyLegWithinOperation(
  db: TripsDb,
  tripId: number,
  journeyId: number,
  input: JourneyLegInput
): JourneyLeg {
  return createJourneyLegInTransaction(db, { tripId, journeyId }, input);
}

/** Replace supplied endpoints while preserving an omitted new day-only field for legacy writers; null clears and explicit local changes precision in this transaction. */
export function updateJourneyLeg(
  db: TripsDb,
  identity: { tripId: number; journeyId: number; id: number },
  input: JourneyLegInput & LegWritePrecondition
): JourneyLeg {
  const { tripId, journeyId, id } = identity;
  return db.transaction(
    (tx) => {
      const { expectedRevision, from, to, ...fields } = input;
      const revision = requireWritableLegRevision(tx, { tripId, journeyId }, expectedRevision);
      const previous = getJourneyLeg(tx, tripId, journeyId, id);
      checkJourneyLegEndpoint(tx, from);
      checkJourneyLegEndpoint(tx, to);
      const endpoints = {
        ...(from === undefined ? {} : { from: resolvedJourneyEndpoint(previous.from, from) }),
        ...(to === undefined ? {} : { to: resolvedJourneyEndpoint(previous.to, to) }),
      };
      const leg = JourneyLegSchema.parse(
        requireOwnedRecord(
          tx
            .update(journeyLegs)
            .set({ ...fields, ...endpoints, updatedAt: new Date().toISOString() })
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
