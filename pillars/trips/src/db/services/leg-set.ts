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
  return db.transaction((tx) => getJourneyLegSetWithinOperation(tx, tripId, journeyId));
}

/** Read one complete Journey leg set inside an existing SQLite snapshot. */
export function getJourneyLegSetWithinOperation(
  db: TripsDb,
  tripId: number,
  journeyId: number
): { revision: number; legs: JourneyLeg[] } {
  return {
    revision: requireLegRevision(db, { tripId, journeyId }),
    legs: listJourneyLegs(db, tripId, journeyId),
  };
}
