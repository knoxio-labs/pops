import { getEvent } from './events.js';
import { getJourney } from './journeys.js';
import { getIdea, requireSourceRevision } from './source-queries.js';
import { getStay } from './stays.js';

import type { CaptureTarget } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

/** Validate explicit local target ownership; retained Contacts references remain opaque and may be unresolved. */
export function requireCaptureTarget(db: TripsDb, tripId: number, target: CaptureTarget): void {
  switch (target.kind) {
    case 'event':
      getEvent(db, tripId, target.id);
      break;
    case 'journey':
      getJourney(db, tripId, target.id);
      break;
    case 'stay':
      getStay(db, tripId, target.id);
      break;
    case 'idea': {
      const idea = getIdea(db, tripId, target.id);
      requireSourceRevision(idea, idea.revision);
      break;
    }
    case 'contact':
      break;
  }
}
