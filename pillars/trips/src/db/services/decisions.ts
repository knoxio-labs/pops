import { eq } from 'drizzle-orm';

import { DecisionInputSchema, DecisionOptionInputSchema } from '../../contract/decision-schemas.js';
import { decisions, decisionOptions } from '../schema.js';
import { getDecision, getDecisionOption, requireDecisionRevision } from './decision-queries.js';
import { advanceDecision, validateDecisionSources } from './decision-write.js';
import { getTrip } from './records.js';
import { requireOwnedRecord } from './source-record.js';

import type {
  Decision,
  DecisionInput,
  DecisionOption,
  DecisionOptionInput,
} from '../../contract/decision-schemas.js';
import type { TripsDb } from '../index.js';

type Identity = { tripId: number; id: number };
type OptionIdentity = Identity & { decisionId: number };

/** Capture independent source facts with no implicit deadline or selection. */
export function createDecision(db: TripsDb, tripId: number, input: DecisionInput): Decision {
  const fields = DecisionInputSchema.parse(input);
  return db.transaction(
    (tx) => {
      getTrip(tx, tripId);
      const row = requireOwnedRecord(
        tx
          .insert(decisions)
          .values({ ...fields, tripId })
          .returning()
          .get()
      );
      return getDecision(tx, tripId, row.id);
    },
    { behavior: 'immediate' }
  );
}
/** Patch supplied source fields at the expected aggregate revision. */
export function updateDecision(
  db: TripsDb,
  identity: Identity,
  input: DecisionInput,
  expectedRevision: number
): Decision {
  const fields = DecisionInputSchema.parse(input);
  return db.transaction(
    (tx) =>
      advanceDecision(
        tx,
        requireDecisionRevision(tx, identity.tripId, identity.id, expectedRevision),
        fields
      ),
    { behavior: 'immediate' }
  );
}
/** Select an owned option or reopen the decision without rewriting any arrangement. */
export function selectDecisionOption(
  db: TripsDb,
  identity: Identity,
  optionId: number | null,
  expectedRevision: number
): Decision {
  return db.transaction(
    (tx) => {
      const decision = requireDecisionRevision(tx, identity.tripId, identity.id, expectedRevision);
      if (optionId !== null) getDecisionOption(tx, identity.tripId, identity.id, optionId);
      return advanceDecision(tx, decision, { selectedOptionId: optionId });
    },
    { behavior: 'immediate' }
  );
}
/** Remove only the decision and its options at the expected aggregate revision. */
export function deleteDecision(db: TripsDb, identity: Identity, expectedRevision: number): void {
  db.transaction(
    (tx) => {
      requireDecisionRevision(tx, identity.tripId, identity.id, expectedRevision);
      tx.delete(decisionOptions).where(eq(decisionOptions.decisionId, identity.id)).run();
      tx.delete(decisions).where(eq(decisions.id, identity.id)).run();
    },
    { behavior: 'immediate' }
  );
}
/** Create an independent option; explicitly supplied sources must currently belong to the trip. */
export function createDecisionOption(
  db: TripsDb,
  identity: Identity,
  input: DecisionOptionInput,
  expectedRevision: number
): DecisionOption {
  const fields = DecisionOptionInputSchema.parse(input);
  return db.transaction(
    (tx) => {
      const decision = requireDecisionRevision(tx, identity.tripId, identity.id, expectedRevision);
      const validatedSources = validateDecisionSources(tx, identity.tripId, fields.affectedSources);
      const row = requireOwnedRecord(
        tx
          .insert(decisionOptions)
          .values({ ...fields, validatedSources, decisionId: identity.id })
          .returning()
          .get()
      );
      advanceDecision(tx, decision);
      return getDecisionOption(tx, identity.tripId, identity.id, row.id);
    },
    { behavior: 'immediate' }
  );
}
/** Patch supplied option fields; omitted affected sources are not revalidated after deletion. */
export function updateDecisionOption(
  db: TripsDb,
  identity: OptionIdentity,
  input: DecisionOptionInput,
  expectedRevision: number
): DecisionOption {
  const fields = DecisionOptionInputSchema.parse(input);
  return db.transaction(
    (tx) => {
      const decision = requireDecisionRevision(
        tx,
        identity.tripId,
        identity.decisionId,
        expectedRevision
      );
      getDecisionOption(tx, identity.tripId, identity.decisionId, identity.id);
      const previous = requireOwnedRecord(
        tx
          .select({ validatedSources: decisionOptions.validatedSources })
          .from(decisionOptions)
          .where(eq(decisionOptions.id, identity.id))
          .get()
      );
      const validatedSources = validateDecisionSources(
        tx,
        identity.tripId,
        fields.affectedSources,
        previous.validatedSources
      );
      tx.update(decisionOptions)
        .set({ ...fields, validatedSources, updatedAt: new Date().toISOString() })
        .where(eq(decisionOptions.id, identity.id))
        .run();
      advanceDecision(tx, decision);
      return getDecisionOption(tx, identity.tripId, identity.decisionId, identity.id);
    },
    { behavior: 'immediate' }
  );
}
/** Remove an option from ordinary reads while retaining its stable identity for explicit restore. */
export function deleteDecisionOption(
  db: TripsDb,
  identity: OptionIdentity,
  expectedRevision: number
): void {
  db.transaction(
    (tx) => {
      const decision = requireDecisionRevision(
        tx,
        identity.tripId,
        identity.decisionId,
        expectedRevision
      );
      getDecisionOption(tx, identity.tripId, identity.decisionId, identity.id);
      tx.update(decisionOptions)
        .set({ removedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(decisionOptions.id, identity.id))
        .run();
      advanceDecision(
        tx,
        decision,
        decision.selectedOptionId === identity.id ? { selectedOptionId: null } : {}
      );
    },
    { behavior: 'immediate' }
  );
}

/** Restore an option without changing source arrangements. */
export { restoreDecisionOption } from './decision-option-restore.js';
