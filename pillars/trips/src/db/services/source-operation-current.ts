import { and, eq, isNull } from 'drizzle-orm';

import { EventSchema } from '../../contract/event-schemas.js';
import { JourneySchema } from '../../contract/journey-schemas.js';
import { StaySchema } from '../../contract/stay-schemas.js';
import { events, journeys, stays } from '../schema.js';
import { currentJourneyLegSets } from './source-journey-leg-sets.js';
import {
  getCapture,
  getIdea,
  getCaptureAssociation,
  getExploreMembership,
} from './source-queries.js';

import type { SourceReceipt, SourceWorkspace } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

/** Read the active records changed by one operation, omitting deleted records. */
export function currentAffected(
  db: TripsDb,
  tripId: number,
  receipt: SourceReceipt
): SourceWorkspace {
  return {
    journeyLegSets:
      receipt.journeyLegSets === undefined
        ? []
        : currentJourneyLegSets(db, tripId, receipt.journeyLegSets),
    captures: receipt.captures.map((row) => getCapture(db, tripId, row.id)),
    ideas: receipt.ideas.map((row) => getIdea(db, tripId, row.id)),
    associations: receipt.associations.map((row) => getCaptureAssociation(db, tripId, row.id)),
    memberships: receipt.memberships.map((row) => getExploreMembership(db, tripId, row.id)),
    events: receipt.events.flatMap((event) => {
      const current = db
        .select()
        .from(events)
        .where(and(eq(events.tripId, tripId), eq(events.id, event.id), isNull(events.removedAt)))
        .get();
      return current === undefined ? [] : [EventSchema.parse(current)];
    }),
    journeys: receipt.journeys.flatMap((journey) => {
      const current = db
        .select()
        .from(journeys)
        .where(
          and(eq(journeys.tripId, tripId), eq(journeys.id, journey.id), isNull(journeys.removedAt))
        )
        .get();
      return current === undefined ? [] : [JourneySchema.parse(current)];
    }),
    stays: receipt.stays.flatMap((stay) => {
      const current = db
        .select()
        .from(stays)
        .where(and(eq(stays.tripId, tripId), eq(stays.id, stay.id), isNull(stays.removedAt)))
        .get();
      return current === undefined ? [] : [StaySchema.parse(current)];
    }),
  };
}
