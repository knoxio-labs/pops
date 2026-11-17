import { and, asc, eq, isNull } from 'drizzle-orm';

import { JourneyGroupSchema } from '../../contract/journey-groups.js';
import { journeys, journeyGroups, journeyGroupMembers } from '../schema.js';
import { getJourney } from './journeys.js';
import { getTrip } from './records.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { JourneyGroup } from '../../contract/journey-groups.js';
import type { TripsDb } from '../index.js';

/** Read a consistent group snapshot; previewing never selects or mutates a source record. */
export function getJourneyGroup(db: TripsDb, tripId: number, id: number): JourneyGroup {
  return db.transaction((tx) => {
    const group = requireOwnedRecord(
      tx
        .select()
        .from(journeyGroups)
        .where(and(eq(journeyGroups.tripId, tripId), eq(journeyGroups.id, id)))
        .get()
    );
    getJourney(tx, tripId, group.currentJourneyId);
    const members = tx
      .select({ journeyId: journeyGroupMembers.journeyId })
      .from(journeyGroupMembers)
      .innerJoin(journeys, eq(journeys.id, journeyGroupMembers.journeyId))
      .where(
        and(
          eq(journeyGroupMembers.groupId, id),
          eq(journeys.tripId, tripId),
          isNull(journeys.removedAt)
        )
      )
      .orderBy(asc(journeyGroupMembers.position))
      .all();
    return JourneyGroupSchema.parse({
      ...group,
      alternativeJourneyIds: members
        .filter((member) => member.journeyId !== group.currentJourneyId)
        .map((member) => member.journeyId),
    });
  });
}

/** List explicit groupings only, without classifying ungrouped source journeys or changing selection. */
export function listJourneyGroups(db: TripsDb, tripId: number): JourneyGroup[] {
  return db.transaction((tx) => {
    getTrip(tx, tripId);
    return tx
      .select({ id: journeyGroups.id })
      .from(journeyGroups)
      .innerJoin(journeys, eq(journeys.id, journeyGroups.currentJourneyId))
      .where(
        and(
          eq(journeyGroups.tripId, tripId),
          eq(journeys.tripId, tripId),
          isNull(journeys.removedAt)
        )
      )
      .orderBy(asc(journeyGroups.id))
      .all()
      .map((group) => getJourneyGroup(tx, tripId, group.id));
  });
}

/** Require the exact grouping revision before a mutation; source edits have independent lifecycles. */
export function requireJourneyGroupRevision(
  db: TripsDb,
  identity: { tripId: number; id: number },
  expectedRevision: number
): JourneyGroup {
  const group = getJourneyGroup(db, identity.tripId, identity.id);
  if (group.revision !== expectedRevision) throw new TripsServiceError('revision_conflict');
  return group;
}
