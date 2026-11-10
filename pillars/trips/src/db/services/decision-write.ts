import { eq } from 'drizzle-orm';

import { decisions, visits, journeys, stays } from '../schema.js';
import { getDecision } from './decision-queries.js';
import { TripsServiceError } from './source-record.js';

import type { Decision, DecisionInput, DecisionSource } from '../../contract/decision-schemas.js';
import type { TripsDb } from '../index.js';

/** Advance a previously revision-checked decision by exactly one within the caller's immediate transaction. */
export function advanceDecision(
  db: TripsDb,
  decision: Decision,
  fields: DecisionInput & { selectedOptionId?: number | null } = {}
): Decision {
  db.update(decisions)
    .set({ ...fields, revision: decision.revision + 1, updatedAt: new Date().toISOString() })
    .where(eq(decisions.id, decision.id))
    .run();
  return getDecision(db, decision.tripId, decision.id);
}
/** Validate exact accepted history against live ownership, returning the accumulated private provenance. */
export function validateDecisionSources(
  db: TripsDb,
  tripId: number,
  sources: DecisionSource[] | undefined,
  history: readonly DecisionSource[] = []
): DecisionSource[] {
  const validated = new Map(history.map((source) => [`${source.kind}/${source.id}`, source]));
  for (const source of sources ?? []) {
    const owner = sourceOwner(db, source);
    const key = `${source.kind}/${source.id}`;
    if (owner !== undefined ? owner !== tripId : !validated.has(key))
      throw new TripsServiceError('not_found');
    validated.set(key, source);
  }
  return [...validated.values()];
}
function sourceOwner(db: TripsDb, source: DecisionSource): number | undefined {
  switch (source.kind) {
    case 'visit':
      return db.select({ tripId: visits.tripId }).from(visits).where(eq(visits.id, source.id)).get()
        ?.tripId;
    case 'journey':
      return db
        .select({ tripId: journeys.tripId })
        .from(journeys)
        .where(eq(journeys.id, source.id))
        .get()?.tripId;
    case 'stay':
      return db.select({ tripId: stays.tripId }).from(stays).where(eq(stays.id, source.id)).get()
        ?.tripId;
  }
}
