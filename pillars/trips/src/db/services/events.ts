import { and, asc, eq } from 'drizzle-orm';

import { EventSchema } from '../../contract/event-schemas.js';
import { events } from '../schema.js';
import { deleteDocumentAssociationsForTarget } from './document-association-cleanup.js';
import { getTrip, getVisit } from './records.js';
import { deleteResponsibilityForTarget } from './responsibility-cleanup.js';
import { requireOwnedRecord } from './source-record.js';

import type { TripEvent, EventInput } from '../../contract/event-schemas.js';
import type { TripsDb } from '../index.js';

/** Read a trip's events in stable identity order without deriving route or date ordering. */
export function listEvents(db: TripsDb, tripId: number): TripEvent[] {
  getTrip(db, tripId);
  return db
    .select()
    .from(events)
    .where(eq(events.tripId, tripId))
    .orderBy(asc(events.id))
    .all()
    .map((row) => EventSchema.parse(row));
}

/** Read an event only through its owning trip. */
export function getEvent(db: TripsDb, tripId: number, id: number): TripEvent {
  return EventSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(events)
        .where(and(eq(events.tripId, tripId), eq(events.id, id)))
        .get()
    )
  );
}

/** Create partial event facts; an explicit visit must belong to the same trip. */
export function createEvent(db: TripsDb, tripId: number, input: EventInput): TripEvent {
  return db.transaction(
    (tx) => {
      getTrip(tx, tripId);
      if (input.visitId !== undefined && input.visitId !== null)
        getVisit(tx, tripId, input.visitId);
      return EventSchema.parse(
        requireOwnedRecord(
          tx
            .insert(events)
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
export function updateEvent(db: TripsDb, tripId: number, id: number, input: EventInput): TripEvent {
  return db.transaction(
    (tx) => {
      getEvent(tx, tripId, id);
      if (input.visitId !== undefined && input.visitId !== null)
        getVisit(tx, tripId, input.visitId);
      return EventSchema.parse(
        requireOwnedRecord(
          tx
            .update(events)
            .set({ ...input, updatedAt: new Date().toISOString() })
            .where(and(eq(events.tripId, tripId), eq(events.id, id)))
            .returning()
            .get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}

/** Remove one event and its document associations atomically without changing linked originals. */
export function deleteEvent(db: TripsDb, tripId: number, id: number): void {
  db.transaction(
    (tx) => {
      getEvent(tx, tripId, id);
      deleteDocumentAssociationsForTarget(tx, tripId, 'event', id);
      deleteResponsibilityForTarget(tx, tripId, 'event', id);
      requireOwnedRecord(
        tx
          .delete(events)
          .where(and(eq(events.tripId, tripId), eq(events.id, id)))
          .returning()
          .get()
      );
    },
    { behavior: 'immediate' }
  );
}
