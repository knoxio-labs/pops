import { listJourneyLegs } from './journey-legs.js';
import { requireLegRevision } from './leg-revision.js';

import type { JourneyLeg } from '../../contract/journey-schemas.js';
import type { TripsDb } from '../index.js';

/** Read live membership, source facts and the collection revision in one SQLite snapshot. */
export function getJourneyLegSet(
  db: TripsDb,
  tripId: number,
  journeyId: number
): { revision: number; legs: JourneyLeg[] } {
  return db.transaction((tx) => ({
    revision: requireLegRevision(tx, { tripId, journeyId }),
    legs: listJourneyLegs(tx, tripId, journeyId),
  }));
}
