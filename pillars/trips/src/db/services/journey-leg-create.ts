import { and, desc, eq, isNull } from 'drizzle-orm';

import { JourneyLegSchema } from '../../contract/journey-schemas.js';
import { journeyLegs } from '../schema.js';
import { checkJourneyLegEndpoint, resolvedJourneyEndpoint } from './journey-leg-input.js';
import { getJourney } from './journeys.js';
import { requireWritableLegRevision, advanceLegRevision } from './leg-revision.js';
import { requireOwnedRecord } from './source-record.js';

import type { JourneyLeg, JourneyLegInput } from '../../contract/journey-schemas.js';
import type { TripsDb } from '../index.js';

/** Append a Journey leg to a caller-owned transaction and advance its collection revision. */
export function createJourneyLegInTransaction(
  db: TripsDb,
  identity: { tripId: number; journeyId: number },
  input: JourneyLegInput,
  expectedRevision?: number
): JourneyLeg {
  const { tripId, journeyId } = identity;
  const revision = requireWritableLegRevision(db, identity, expectedRevision);
  getJourney(db, tripId, journeyId);
  const { from, to, ...fields } = input;
  checkJourneyLegEndpoint(db, from);
  checkJourneyLegEndpoint(db, to);
  const endpoints = {
    ...(from === undefined ? {} : { from: resolvedJourneyEndpoint({}, from) }),
    ...(to === undefined ? {} : { to: resolvedJourneyEndpoint({}, to) }),
  };
  const last = db
    .select({ position: journeyLegs.position })
    .from(journeyLegs)
    .where(and(eq(journeyLegs.journeyId, journeyId), isNull(journeyLegs.removedAt)))
    .orderBy(desc(journeyLegs.position))
    .limit(1)
    .get();
  const leg = JourneyLegSchema.parse(
    requireOwnedRecord(
      db
        .insert(journeyLegs)
        .values({
          ...fields,
          ...endpoints,
          journeyId,
          position: last === undefined ? 0 : last.position + 1,
        })
        .returning()
        .get()
    )
  );
  advanceLegRevision(db, journeyId, revision);
  return leg;
}
