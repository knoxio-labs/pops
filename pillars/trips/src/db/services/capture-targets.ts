import { getEvent } from './events.js';
import { getJourney } from './journeys.js';
import { getIdea, requireSourceRevision } from './source-queries.js';
import { getStay } from './stays.js';

import type { CaptureTarget } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

/** Compare explicit typed identities; Contact identity is the exact owner reference rather than a display name. */
export function sameCaptureTarget(first: CaptureTarget, second: CaptureTarget): boolean {
  if (first.kind !== second.kind) return false;
  if (first.kind === 'contact')
    return second.kind === 'contact' && first.reference.uri === second.reference.uri;
  return second.kind !== 'contact' && first.id === second.id;
}
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
