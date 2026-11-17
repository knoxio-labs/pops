import { requireCaptureTarget } from './capture-targets.js';
import { createEvent } from './events.js';
import { createJourneyLeg } from './journey-legs.js';
import { createJourney } from './journeys.js';
import { requireLegRevision } from './leg-revision.js';
import { getJourneyLegSet } from './leg-set.js';
import { createIdeaSource } from './source-row-write.js';
import { createStay } from './stays.js';

import type { CaptureTarget, SourceCommand } from '../../contract/source-workspace.js';
import type { SourceWrite } from './source-write-types.js';

function createJourneyTarget(
  write: SourceWrite,
  target: Extract<
    Extract<SourceCommand, { kind: 'capture.organise' }>['target'],
    { mode: 'createJourney' }
  >
): CaptureTarget {
  const journey = createJourney(write.db, write.tripId, target.input);
  if (target.legs !== undefined) {
    for (const input of target.legs) {
      const expectedRevision = requireLegRevision(write.db, {
        tripId: write.tripId,
        journeyId: journey.id,
      });
      createJourneyLeg(write.db, write.tripId, journey.id, { ...input, expectedRevision });
    }
    const proof = {
      journeyId: journey.id,
      ...getJourneyLegSet(write.db, write.tripId, journey.id),
    };
    (write.receipt.journeyLegSets ??= []).push(proof);
    (write.inverse.createdJourneyLegSets ??= []).push(proof);
  }
  write.receipt.journeys.push(journey);
  write.inverse.createdJourneys.push(journey);
  return { kind: 'journey', id: journey.id };
}

/** Resolve an explicitly selected target or create exactly the supplied source through its canonical producer. */
export function resolveOrganisationTarget(
  write: SourceWrite,
  target: Extract<SourceCommand, { kind: 'capture.organise' }>['target']
): CaptureTarget {
  switch (target.mode) {
    case 'existing':
      requireCaptureTarget(write.db, write.tripId, target.target);
      return target.target;
    case 'createIdea':
      return { kind: 'idea', id: createIdeaSource(write, target.input).id };
    case 'createEvent': {
      const event = createEvent(write.db, write.tripId, target.input);
      write.receipt.events.push(event);
      write.inverse.createdEvents.push(event);
      return { kind: 'event', id: event.id };
    }
    case 'createJourney':
      return createJourneyTarget(write, target);
    case 'createStay': {
      const stay = createStay(write.db, write.tripId, target.input);
      write.receipt.stays.push(stay);
      write.inverse.createdStays.push(stay);
      return { kind: 'stay', id: stay.id };
    }
  }
}
