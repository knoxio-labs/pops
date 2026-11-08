import { and, eq } from 'drizzle-orm';

import { journeyGroups, journeyGroupMembers } from '../schema.js';
import { getJourneyGroup, requireJourneyGroupRevision } from './journey-group-queries.js';
import { createJourney, getJourney } from './journeys.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type {
  CreateJourneyGroupInput,
  JourneyGroup,
  SelectJourneyInput,
} from '../../contract/journey-groups.js';
import type { Journey } from '../../contract/journey-schemas.js';
import type { TripsDb } from '../index.js';

function advanceGroup(db: TripsDb, group: JourneyGroup, currentJourneyId: number): void {
  db.update(journeyGroups)
    .set({ currentJourneyId, revision: group.revision + 1, updatedAt: new Date().toISOString() })
    .where(eq(journeyGroups.id, group.id))
    .run();
}

/** Adopt explicitly chosen existing sources without cloning, selecting or rewriting their facts. */
export function createJourneyGroup(
  db: TripsDb,
  tripId: number,
  input: CreateJourneyGroupInput
): JourneyGroup {
  return db.transaction(
    (tx) => {
      const memberIds = [input.currentJourneyId, ...(input.alternativeJourneyIds ?? [])];
      for (const id of memberIds) getJourney(tx, tripId, id);
      const group = requireOwnedRecord(
        tx
          .insert(journeyGroups)
          .values({ tripId, currentJourneyId: input.currentJourneyId })
          .returning()
          .get()
      );
      tx.insert(journeyGroupMembers)
        .values(
          memberIds.map((journeyId, position) => ({ groupId: group.id, journeyId, position }))
        )
        .run();
      return getJourneyGroup(tx, tripId, group.id);
    },
    { behavior: 'immediate' }
  );
}

/** Create a separate blank source retaining only explicitly configured current buffers. */
export function addBlankJourneyAlternative(
  db: TripsDb,
  identity: { tripId: number; id: number },
  expectedRevision: number
): { group: JourneyGroup; journey: Journey } {
  return db.transaction(
    (tx) => {
      const group = requireJourneyGroupRevision(tx, identity, expectedRevision);
      const current = getJourney(tx, identity.tripId, group.currentJourneyId);
      const journey = createJourney(tx, identity.tripId, { buffers: current.buffers });
      tx.insert(journeyGroupMembers)
        .values({
          groupId: group.id,
          journeyId: journey.id,
          position: group.alternativeJourneyIds.length + 1,
        })
        .run();
      advanceGroup(tx, group, group.currentJourneyId);
      return { group: getJourneyGroup(tx, identity.tripId, identity.id), journey };
    },
    { behavior: 'immediate' }
  );
}

/** Select explicitly and retain the previous current in the selected slot; selecting it again reverses selection. */
export function selectJourneyAlternative(
  db: TripsDb,
  identity: { tripId: number; id: number },
  input: SelectJourneyInput
): JourneyGroup {
  return db.transaction(
    (tx) => {
      const group = requireJourneyGroupRevision(tx, identity, input.expectedRevision);
      if (group.currentJourneyId === input.journeyId) return group;
      const index = group.alternativeJourneyIds.indexOf(input.journeyId);
      if (index < 0) throw new TripsServiceError('not_found');
      tx.update(journeyGroupMembers)
        .set({ position: index + 1 })
        .where(
          and(
            eq(journeyGroupMembers.groupId, group.id),
            eq(journeyGroupMembers.journeyId, group.currentJourneyId)
          )
        )
        .run();
      tx.update(journeyGroupMembers)
        .set({ position: 0 })
        .where(
          and(
            eq(journeyGroupMembers.groupId, group.id),
            eq(journeyGroupMembers.journeyId, input.journeyId)
          )
        )
        .run();
      advanceGroup(tx, group, input.journeyId);
      return getJourneyGroup(tx, identity.tripId, identity.id);
    },
    { behavior: 'immediate' }
  );
}

/** Remove grouping only at the expected revision; every source journey and leg remains intact. */
export function deleteJourneyGroup(
  db: TripsDb,
  identity: { tripId: number; id: number },
  expectedRevision: number
): void {
  db.transaction(
    (tx) => {
      const group = requireJourneyGroupRevision(tx, identity, expectedRevision);
      tx.delete(journeyGroupMembers).where(eq(journeyGroupMembers.groupId, group.id)).run();
      tx.delete(journeyGroups).where(eq(journeyGroups.id, group.id)).run();
    },
    { behavior: 'immediate' }
  );
}
