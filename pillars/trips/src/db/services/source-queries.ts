import { and, asc, eq } from 'drizzle-orm';

import { CaptureSchema } from '../../contract/capture-schemas.js';
import { IdeaSchema } from '../../contract/idea-schemas.js';
import {
  CaptureAssociationSchema,
  ExploreMembershipSchema,
} from '../../contract/source-workspace.js';
import { captures, ideas, captureAssociations, exploreMemberships } from '../schema.js';
import { getEvent, listEvents } from './events.js';
import { listJourneys } from './journeys.js';
import { getPlace, getTrip, getVisit } from './records.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';
import { listStays } from './stays.js';

import type { TripCapture } from '../../contract/capture-schemas.js';
import type { TripEvent } from '../../contract/event-schemas.js';
import type { TripIdea } from '../../contract/idea-schemas.js';
import type { SourceWorkspace, ExploreSource } from '../../contract/source-workspace.js';
import type { CaptureAssociation, ExploreMembership } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

/** Read a capture through its owning trip, including a removed source identity. */
export function getCapture(db: TripsDb, tripId: number, id: number): TripCapture {
  return CaptureSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(captures)
        .where(and(eq(captures.tripId, tripId), eq(captures.id, id)))
        .get()
    )
  );
}
/** Read an idea through its owning trip, including a removed source identity. */
export function getIdea(db: TripsDb, tripId: number, id: number): TripIdea {
  return IdeaSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(ideas)
        .where(and(eq(ideas.tripId, tripId), eq(ideas.id, id)))
        .get()
    )
  );
}
/** Read a capture association through its owning trip. */
export function getCaptureAssociation(db: TripsDb, tripId: number, id: number): CaptureAssociation {
  return CaptureAssociationSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(captureAssociations)
        .where(and(eq(captureAssociations.tripId, tripId), eq(captureAssociations.id, id)))
        .get()
    )
  );
}
/** Read Explore membership through its owning trip. */
export function getExploreMembership(db: TripsDb, tripId: number, id: number): ExploreMembership {
  return ExploreMembershipSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(exploreMemberships)
        .where(and(eq(exploreMemberships.tripId, tripId), eq(exploreMemberships.id, id)))
        .get()
    )
  );
}
/** Validate only explicitly supplied local references; an unrelated edit never revalidates old references. */
export function validateSourceLocation(
  db: TripsDb,
  tripId: number,
  input: { placeId?: number | null; visitId?: number | null }
): void {
  if (input.placeId !== undefined && input.placeId !== null) getPlace(db, input.placeId);
  if (input.visitId !== undefined && input.visitId !== null) getVisit(db, tripId, input.visitId);
}
/** Require an active source before adding a new relation to it. */
export function requireExploreSource(
  db: TripsDb,
  tripId: number,
  source: ExploreSource
): TripEvent | TripCapture | TripIdea {
  if (source.kind === 'event') return getEvent(db, tripId, source.id);
  const record =
    source.kind === 'capture' ? getCapture(db, tripId, source.id) : getIdea(db, tripId, source.id);
  if (record.removedAt !== null) throw new TripsServiceError('source_revision_conflict');
  return record;
}
/** Require the current revision and active record inside the operation's immediate transaction. */
export function requireSourceRevision(
  record: { revision: number; removedAt: string | null },
  expected: number
): void {
  if (record.revision !== expected || record.removedAt !== null)
    throw new TripsServiceError('source_revision_conflict');
}
/** Read all source records in one transaction so consumers never combine versions from separate requests. */
export function readSourceWorkspace(db: TripsDb, tripId: number): SourceWorkspace {
  return db.transaction(
    (tx) => {
      getTrip(tx, tripId);
      return {
        captures: tx
          .select()
          .from(captures)
          .where(eq(captures.tripId, tripId))
          .orderBy(asc(captures.id))
          .all()
          .map((row) => CaptureSchema.parse(row)),
        ideas: tx
          .select()
          .from(ideas)
          .where(eq(ideas.tripId, tripId))
          .orderBy(asc(ideas.id))
          .all()
          .map((row) => IdeaSchema.parse(row)),
        associations: tx
          .select()
          .from(captureAssociations)
          .where(eq(captureAssociations.tripId, tripId))
          .orderBy(asc(captureAssociations.id))
          .all()
          .map((row) => CaptureAssociationSchema.parse(row)),
        memberships: tx
          .select()
          .from(exploreMemberships)
          .where(eq(exploreMemberships.tripId, tripId))
          .orderBy(asc(exploreMemberships.id))
          .all()
          .map((row) => ExploreMembershipSchema.parse(row)),
        events: listEvents(tx, tripId),
        journeys: listJourneys(tx, tripId),
        stays: listStays(tx, tripId),
      };
    },
    { behavior: 'immediate' }
  );
}
