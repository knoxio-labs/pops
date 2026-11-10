import { and, eq } from 'drizzle-orm';

import { DecisionOptionSchema } from '../../contract/decision-schemas.js';
import { decisionOptions } from '../schema.js';
import { requireDecisionRevision } from './decision-queries.js';
import { advanceDecision, validateDecisionSources } from './decision-write.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { DecisionOption } from '../../contract/decision-schemas.js';
import type { TripsDb } from '../index.js';

type OptionIdentity = { tripId: number; decisionId: number; id: number };

/** Restore an owned removed option at the aggregate revision; selection changes only when explicitly requested. */
export function restoreDecisionOption(
  db: TripsDb,
  identity: OptionIdentity,
  expectedRevision: number,
  select: boolean
): DecisionOption {
  return db.transaction(
    (tx) => {
      const decision = requireDecisionRevision(
        tx,
        identity.tripId,
        identity.decisionId,
        expectedRevision
      );
      const removed = requireOwnedRecord(
        tx
          .select()
          .from(decisionOptions)
          .where(
            and(
              eq(decisionOptions.decisionId, identity.decisionId),
              eq(decisionOptions.id, identity.id)
            )
          )
          .get()
      );
      if (removed.removedAt === null) throw new TripsServiceError('option_not_removed');
      validateDecisionSources(
        tx,
        identity.tripId,
        removed.affectedSources,
        removed.validatedSources
      );
      tx.update(decisionOptions)
        .set({ removedAt: null, updatedAt: new Date().toISOString() })
        .where(eq(decisionOptions.id, identity.id))
        .run();
      advanceDecision(tx, decision, select ? { selectedOptionId: identity.id } : {});
      return DecisionOptionSchema.parse(
        requireOwnedRecord(
          tx.select().from(decisionOptions).where(eq(decisionOptions.id, identity.id)).get()
        )
      );
    },
    { behavior: 'immediate' }
  );
}
