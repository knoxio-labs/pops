import { and, asc, eq, isNull } from 'drizzle-orm';

import { DecisionSchema, DecisionOptionSchema } from '../../contract/decision-schemas.js';
import { decisions, decisionOptions } from '../schema.js';
import { getTrip } from './records.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { Decision, DecisionOption } from '../../contract/decision-schemas.js';
import type { TripsDb } from '../index.js';

/** Read one decision only through its owning trip. */
export function getDecision(db: TripsDb, tripId: number, id: number): Decision {
  return DecisionSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(decisions)
        .where(and(eq(decisions.tripId, tripId), eq(decisions.id, id)))
        .get()
    )
  );
}
/** List decisions in stable identity order without interpreting their selection or deadlines. */
export function listDecisions(db: TripsDb, tripId: number): Decision[] {
  getTrip(db, tripId);
  return db
    .select()
    .from(decisions)
    .where(eq(decisions.tripId, tripId))
    .orderBy(asc(decisions.id))
    .all()
    .map((row) => DecisionSchema.parse(row));
}
/** Read options without resolving or discarding unavailable affected sources. */
export function listDecisionOptions(
  db: TripsDb,
  tripId: number,
  decisionId: number
): DecisionOption[] {
  getDecision(db, tripId, decisionId);
  return db
    .select()
    .from(decisionOptions)
    .where(and(eq(decisionOptions.decisionId, decisionId), isNull(decisionOptions.removedAt)))
    .orderBy(asc(decisionOptions.id))
    .all()
    .map((row) => DecisionOptionSchema.parse(row));
}
/** Read an option only through its owning decision and trip. */
export function getDecisionOption(
  db: TripsDb,
  tripId: number,
  decisionId: number,
  id: number
): DecisionOption {
  getDecision(db, tripId, decisionId);
  return DecisionOptionSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(decisionOptions)
        .where(
          and(
            eq(decisionOptions.decisionId, decisionId),
            eq(decisionOptions.id, id),
            isNull(decisionOptions.removedAt)
          )
        )
        .get()
    )
  );
}
/** Require the aggregate revision inside the caller's immediate write transaction. */
export function requireDecisionRevision(
  db: TripsDb,
  tripId: number,
  id: number,
  expectedRevision: number
): Decision {
  const decision = getDecision(db, tripId, id);
  if (decision.revision !== expectedRevision)
    throw new TripsServiceError('decision_revision_conflict');
  return decision;
}

/** Read decision revision and its live options from one SQLite snapshot. */
export function getDecisionWorkspace(
  db: TripsDb,
  tripId: number,
  id: number
): { decision: Decision; options: DecisionOption[] } {
  return db.transaction((tx) => ({
    decision: getDecision(tx, tripId, id),
    options: listDecisionOptions(tx, tripId, id),
  }));
}
