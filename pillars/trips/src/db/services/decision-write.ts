import { eq } from 'drizzle-orm';

import { decisions } from '../schema.js';
import { getDecision } from './decision-queries.js';
import { getJourney } from './journeys.js';
import { getVisit } from './records.js';
import { getStay } from './stays.js';

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
/** Validate newly added memberships; unchanged identities retain their historical ownership. */
export function validateDecisionSources(
  db: TripsDb,
  tripId: number,
  sources: DecisionSource[] | undefined,
  retained: readonly DecisionSource[] = []
): void {
  const existing = new Set(retained.map((source) => `${source.kind}/${source.id}`));
  for (const source of sources ?? []) {
    if (existing.has(`${source.kind}/${source.id}`)) continue;
    switch (source.kind) {
      case 'visit':
        getVisit(db, tripId, source.id);
        break;
      case 'journey':
        getJourney(db, tripId, source.id);
        break;
      case 'stay':
        getStay(db, tripId, source.id);
        break;
    }
  }
}
