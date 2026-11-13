import { and, eq } from 'drizzle-orm';

import { journeys } from '../schema.js';
import { getJourneyLegSet } from './leg-set.js';

import type { SourceWorkspace } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

/** Read current complete sets only through the immutable affected Journey identities; deleted Journeys contribute no current set. */
export function currentJourneyLegSets(
  db: TripsDb,
  tripId: number,
  proofs: NonNullable<SourceWorkspace['journeyLegSets']>
): NonNullable<SourceWorkspace['journeyLegSets']> {
  return proofs.flatMap(({ journeyId }) => {
    const current = db
      .select({ id: journeys.id })
      .from(journeys)
      .where(and(eq(journeys.tripId, tripId), eq(journeys.id, journeyId)))
      .get();
    return current === undefined ? [] : [{ journeyId, ...getJourneyLegSet(db, tripId, journeyId) }];
  });
}
