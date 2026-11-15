import { asc, eq } from 'drizzle-orm';

import {
  captures,
  ideas,
  captureAssociations,
  exploreMemberships,
  decisions,
  decisionOptions,
  events,
  journeys,
  journeyLegs,
  journeyGroups,
  journeyGroupMembers,
  meetingPlans,
  rentals,
  stays,
  visits,
  tripDocumentAssociations,
  arrangementResponsibilities,
} from '../schema.js';
import { readRouteSnapshot } from './route-storage.js';

import type { TripRoute } from '../../contract/route-schemas.js';
import type { TripsDb } from '../index.js';
import type { RouteDraftRecord } from '../schema/route-draft-types.js';

/** One transaction's canonical source graph and explicit live/historical relation sets. */
export interface RouteDraftSnapshot {
  route: TripRoute;
  records: RouteDraftRecord[];
  captures: (typeof captures.$inferSelect)[];
  ideas: (typeof ideas.$inferSelect)[];
  associations: (typeof captureAssociations.$inferSelect)[];
  memberships: (typeof exploreMemberships.$inferSelect)[];
  options: (typeof decisionOptions.$inferSelect)[];
  groups: (typeof journeyGroups.$inferSelect)[];
  groupMembers: (typeof journeyGroupMembers.$inferSelect)[];
  documents: (typeof tripDocumentAssociations.$inferSelect)[];
  responsibilities: (typeof arrangementResponsibilities.$inferSelect)[];
}

type DraftRelations = Pick<
  RouteDraftSnapshot,
  'captures' | 'ideas' | 'associations' | 'memberships' | 'options'
>;

type DraftGroups = Pick<RouteDraftSnapshot, 'groups' | 'groupMembers'>;

type DraftSourceLinks = Pick<RouteDraftSnapshot, 'documents' | 'responsibilities'>;

function readRouteDraftRecords(db: TripsDb, tripId: number): RouteDraftRecord[] {
  return [
    ...db
      .select()
      .from(visits)
      .where(eq(visits.tripId, tripId))
      .orderBy(asc(visits.id))
      .all()
      .map((row) => ({ kind: 'visit' as const, row })),
    ...db
      .select()
      .from(journeys)
      .where(eq(journeys.tripId, tripId))
      .orderBy(asc(journeys.id))
      .all()
      .map((row) => ({ kind: 'journey' as const, row })),
    ...db
      .select({ row: journeyLegs })
      .from(journeyLegs)
      .innerJoin(journeys, eq(journeys.id, journeyLegs.journeyId))
      .where(eq(journeys.tripId, tripId))
      .orderBy(asc(journeyLegs.id))
      .all()
      .map(({ row }) => ({ kind: 'journey-leg' as const, row })),
    ...db
      .select()
      .from(stays)
      .where(eq(stays.tripId, tripId))
      .orderBy(asc(stays.id))
      .all()
      .map((row) => ({ kind: 'stay' as const, row })),
    ...db
      .select()
      .from(events)
      .where(eq(events.tripId, tripId))
      .orderBy(asc(events.id))
      .all()
      .map((row) => ({ kind: 'event' as const, row })),
    ...db
      .select()
      .from(rentals)
      .where(eq(rentals.tripId, tripId))
      .orderBy(asc(rentals.id))
      .all()
      .map((row) => ({ kind: 'rental' as const, row })),
    ...db
      .select()
      .from(meetingPlans)
      .where(eq(meetingPlans.tripId, tripId))
      .orderBy(asc(meetingPlans.id))
      .all()
      .map((row) => ({ kind: 'meeting' as const, row })),
  ];
}

function readDraftRelations(db: TripsDb, tripId: number): DraftRelations {
  return {
    captures: db
      .select()
      .from(captures)
      .where(eq(captures.tripId, tripId))
      .orderBy(asc(captures.id))
      .all(),
    ideas: db.select().from(ideas).where(eq(ideas.tripId, tripId)).orderBy(asc(ideas.id)).all(),
    associations: db
      .select()
      .from(captureAssociations)
      .where(eq(captureAssociations.tripId, tripId))
      .orderBy(asc(captureAssociations.id))
      .all(),
    memberships: db
      .select()
      .from(exploreMemberships)
      .where(eq(exploreMemberships.tripId, tripId))
      .orderBy(asc(exploreMemberships.id))
      .all(),
    options: db
      .select({ row: decisionOptions })
      .from(decisionOptions)
      .innerJoin(decisions, eq(decisions.id, decisionOptions.decisionId))
      .where(eq(decisions.tripId, tripId))
      .orderBy(asc(decisionOptions.id))
      .all()
      .map(({ row }) => row),
  };
}

function readDraftGroups(db: TripsDb, tripId: number): DraftGroups {
  return {
    groups: db
      .select()
      .from(journeyGroups)
      .where(eq(journeyGroups.tripId, tripId))
      .orderBy(asc(journeyGroups.id))
      .all(),
    groupMembers: db
      .select({ row: journeyGroupMembers })
      .from(journeyGroupMembers)
      .innerJoin(journeyGroups, eq(journeyGroups.id, journeyGroupMembers.groupId))
      .where(eq(journeyGroups.tripId, tripId))
      .orderBy(
        asc(journeyGroupMembers.groupId),
        asc(journeyGroupMembers.position),
        asc(journeyGroupMembers.journeyId)
      )
      .all()
      .map(({ row }) => row),
  };
}

function readDraftSourceLinks(db: TripsDb, tripId: number): DraftSourceLinks {
  return {
    documents: db
      .select()
      .from(tripDocumentAssociations)
      .where(eq(tripDocumentAssociations.tripId, tripId))
      .orderBy(asc(tripDocumentAssociations.id))
      .all(),
    responsibilities: db
      .select()
      .from(arrangementResponsibilities)
      .where(eq(arrangementResponsibilities.tripId, tripId))
      .orderBy(asc(arrangementResponsibilities.id))
      .all(),
  };
}

/** Read complete typed trip-owned facts; callers own the consistent transaction boundary. */
export function readRouteDraftSnapshot(db: TripsDb, tripId: number): RouteDraftSnapshot {
  return {
    route: readRouteSnapshot(db, tripId),
    records: readRouteDraftRecords(db, tripId),
    ...readDraftRelations(db, tripId),
    ...readDraftGroups(db, tripId),
    ...readDraftSourceLinks(db, tripId),
  };
}
