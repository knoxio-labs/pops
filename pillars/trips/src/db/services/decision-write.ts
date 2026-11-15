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
/** Admit live same-trip sources or exact accepted unavailable history, never current foreign ownership. */
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
    if (
      (owner !== undefined && owner.tripId !== tripId) ||
      ((owner === undefined || owner.removed) && !validated.has(key))
    )
      throw new TripsServiceError('not_found');
    validated.set(key, source);
  }
  return [...validated.values()];
}
function sourceOwner(
  db: TripsDb,
  source: DecisionSource
): { tripId: number; removed: boolean } | undefined {
  const table = decisionSourceTable(source);
  const row = db
    .select({ tripId: table.tripId, removedAt: table.removedAt })
    .from(table)
    .where(eq(table.id, source.id))
    .get();
  return row === undefined ? undefined : { tripId: row.tripId, removed: row.removedAt !== null };
}

function decisionSourceTable(
  source: DecisionSource
): typeof visits | typeof journeys | typeof stays {
  switch (source.kind) {
    case 'visit':
      return visits;
    case 'journey':
      return journeys;
    case 'stay':
      return stays;
  }
}
