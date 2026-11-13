import { deleteEvent, getEvent } from './events.js';
import { deleteJourneyLeg } from './journey-legs.js';
import { deleteJourney, getJourney } from './journeys.js';
import { getJourneyLegSet } from './leg-set.js';
import { canonicalSourceValue } from './source-canonical.js';
import { TripsServiceError } from './source-record.js';
import { assertCreatedTargetUnreferenced } from './source-references.js';
import { deleteStay, getStay } from './stays.js';

import type { SourceInverse } from './source-inverse-types.js';
import type { SourceWrite } from './source-write-types.js';

function requireUnchanged(actual: unknown, expected: unknown): void {
  if (canonicalSourceValue(actual) !== canonicalSourceValue(expected))
    throw new TripsServiceError('source_undo_conflict');
}
/** Delete only operation-created local targets whose source facts and dependency sets remain untouched. */
export function undoCreatedTargets(write: SourceWrite, inverse: SourceInverse): void {
  for (const event of inverse.createdEvents) {
    requireUnchanged(getEvent(write.db, write.tripId, event.id), event);
    assertCreatedTargetUnreferenced(write.db, write.tripId, { kind: 'event', id: event.id });
    deleteEvent(write.db, write.tripId, event.id);
  }
  for (const journey of inverse.createdJourneys) {
    requireUnchanged(getJourney(write.db, write.tripId, journey.id), journey);
    const proof = inverse.createdJourneyLegSets?.find((entry) => entry.journeyId === journey.id);
    if (proof !== undefined) {
      requireUnchanged(getJourneyLegSet(write.db, write.tripId, journey.id), {
        revision: proof.revision,
        legs: proof.legs,
      });
      for (const leg of proof.legs) deleteJourneyLeg(write.db, write.tripId, journey.id, leg.id);
    }
    assertCreatedTargetUnreferenced(write.db, write.tripId, { kind: 'journey', id: journey.id });
    deleteJourney(write.db, write.tripId, journey.id);
  }
  for (const stay of inverse.createdStays) {
    requireUnchanged(getStay(write.db, write.tripId, stay.id), stay);
    assertCreatedTargetUnreferenced(write.db, write.tripId, { kind: 'stay', id: stay.id });
    deleteStay(write.db, write.tripId, stay.id);
  }
}
