import { and, eq } from 'drizzle-orm';

import { EventSchema } from '../../contract/event-schemas.js';
import { JourneySchema } from '../../contract/journey-schemas.js';
import { SourceWorkspaceSchema } from '../../contract/source-workspace.js';
import { StaySchema } from '../../contract/stay-schemas.js';
import { events, journeys, stays } from '../schema.js';
import { getJourneyLegSetWithinOperation } from './leg-set.js';
import {
  getCapture,
  getIdea,
  getCaptureAssociation,
  getExploreMembership,
} from './source-queries.js';

import type { SourceReceipt, SourceWorkspace } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

/** Build an empty operation receipt with every current workspace collection represented. */
export function emptySourceWorkspace(): SourceWorkspace {
  return SourceWorkspaceSchema.parse({
    captures: [],
    ideas: [],
    associations: [],
    memberships: [],
    events: [],
    journeys: [],
    journeyLegSets: [],
    stays: [],
  });
}

/** Read only the current records named by one receipt, omitting identities that were deleted. */
export function currentAffectedSources(
  db: TripsDb,
  tripId: number,
  receipt: SourceReceipt
): SourceWorkspace {
  return {
    captures: receipt.captures.map((row) => getCapture(db, tripId, row.id)),
    ideas: receipt.ideas.map((row) => getIdea(db, tripId, row.id)),
    associations: receipt.associations.map((row) => getCaptureAssociation(db, tripId, row.id)),
    memberships: receipt.memberships.map((row) => getExploreMembership(db, tripId, row.id)),
    events: receipt.events.flatMap((event) => {
      const current = db
        .select()
        .from(events)
        .where(and(eq(events.tripId, tripId), eq(events.id, event.id)))
        .get();
      return current === undefined ? [] : [EventSchema.parse(current)];
    }),
    journeys: receipt.journeys.flatMap((journey) => {
      const current = db
        .select()
        .from(journeys)
        .where(and(eq(journeys.tripId, tripId), eq(journeys.id, journey.id)))
        .get();
      return current === undefined ? [] : [JourneySchema.parse(current)];
    }),
    journeyLegSets: receipt.journeys.flatMap((journey) => {
      const current = db
        .select({ id: journeys.id })
        .from(journeys)
        .where(and(eq(journeys.tripId, tripId), eq(journeys.id, journey.id)))
        .get();
      if (current === undefined) return [];
      return [
        {
          journeyId: journey.id,
          ...getJourneyLegSetWithinOperation(db, tripId, journey.id),
        },
      ];
    }),
    stays: receipt.stays.flatMap((stay) => {
      const current = db
        .select()
        .from(stays)
        .where(and(eq(stays.tripId, tripId), eq(stays.id, stay.id)))
        .get();
      return current === undefined ? [] : [StaySchema.parse(current)];
    }),
  };
}
