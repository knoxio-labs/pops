import { JourneyWorkspaceSchema } from '../../contract/journey-workspace.js';
import { deriveJourneyTiming } from '../../domain/journey-timing.js';
import { listJourneyLegs } from './journey-legs.js';
import { getJourney } from './journeys.js';

import type { JourneyWorkspace } from '../../contract/journey-workspace.js';
import type { TripsDb } from '../index.js';

/** Read source metadata and ordered live legs in one snapshot, deriving timing only from those returned rows. */
export function getJourneyWorkspace(db: TripsDb, tripId: number, id: number): JourneyWorkspace {
  return db.transaction((tx) => {
    const journey = getJourney(tx, tripId, id);
    const legs = listJourneyLegs(tx, tripId, id);
    return JourneyWorkspaceSchema.parse({ journey, legs, timing: deriveJourneyTiming(id, legs) });
  });
}
