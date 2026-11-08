import { JourneyTimingSchema } from '../../contract/journey-timing.js';
import { deriveJourneyTiming } from '../../domain/journey-timing.js';
import { listJourneyLegs } from './journey-legs.js';

import type { JourneyTiming } from '../../contract/journey-timing.js';
import type { TripsDb } from '../index.js';

/** Read and derive timing in a consistent SQLite snapshot without changing any persisted source fact. */
export function getJourneyTiming(db: TripsDb, tripId: number, id: number): JourneyTiming {
  return db.transaction((tx) =>
    JourneyTimingSchema.parse(deriveJourneyTiming(id, listJourneyLegs(tx, tripId, id)))
  );
}
