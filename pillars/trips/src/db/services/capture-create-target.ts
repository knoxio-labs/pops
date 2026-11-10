import { requireCaptureTarget } from './capture-targets.js';
import { createEvent } from './events.js';
import { createJourney } from './journeys.js';
import { createIdeaSource } from './source-row-write.js';
import { createStay } from './stays.js';

import type { CaptureTarget, SourceCommand } from '../../contract/source-workspace.js';
import type { SourceWrite } from './source-write-types.js';

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
    case 'createJourney': {
      const journey = createJourney(write.db, write.tripId, target.input);
      write.receipt.journeys.push(journey);
      write.inverse.createdJourneys.push(journey);
      return { kind: 'journey', id: journey.id };
    }
    case 'createStay': {
      const stay = createStay(write.db, write.tripId, target.input);
      write.receipt.stays.push(stay);
      write.inverse.createdStays.push(stay);
      return { kind: 'stay', id: stay.id };
    }
  }
}
