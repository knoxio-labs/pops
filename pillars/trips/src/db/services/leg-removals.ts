import { and, eq } from 'drizzle-orm';

import { legRemovals, journeyLegs } from '../schema.js';
import { getJourneyLeg, listJourneyLegs } from './journey-legs.js';
import { writeLegOrder } from './leg-order.js';
import {
  advanceLegRevision,
  assertLegRevisionWritable,
  requireLegRevision,
} from './leg-revision.js';
import { getJourneyLegSet } from './leg-set.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { LegRemovalResult } from '../../contract/leg-removal-schemas.js';
import type { TripsDb } from '../index.js';

type Owner = { tripId: number; journeyId: number };
type Receipt = typeof legRemovals.$inferSelect;
function findReceipt(db: TripsDb, journeyId: number, operationId: string): Receipt | undefined {
  return db
    .select()
    .from(legRemovals)
    .where(and(eq(legRemovals.journeyId, journeyId), eq(legRemovals.operationId, operationId)))
    .get();
}
function archivedLeg(db: TripsDb, journeyId: number, id: number): typeof journeyLegs.$inferSelect {
  return requireOwnedRecord(
    db
      .select()
      .from(journeyLegs)
      .where(and(eq(journeyLegs.journeyId, journeyId), eq(journeyLegs.id, id)))
      .get()
  );
}
function result(db: TripsDb, owner: Owner, receipt: Receipt): LegRemovalResult {
  return {
    ...getJourneyLegSet(db, owner.tripId, owner.journeyId),
    receipt: {
      operationId: receipt.operationId,
      legId: receipt.legId,
      state: receipt.restoredRevision === null ? 'removed' : 'restored',
      removedRevision: receipt.removedRevision,
      restoredRevision: receipt.restoredRevision,
    },
  };
}
/** Remove once under a stable client intent; exact retries observe the current snapshot without deleting a later lifecycle. */
export function removeJourneyLeg(
  db: TripsDb,
  owner: Owner & { id: number },
  input: { operationId: string; expectedRevision: number }
): LegRemovalResult {
  return db.transaction(
    (tx) => {
      const revision = requireLegRevision(tx, owner);
      const previous = findReceipt(tx, owner.journeyId, input.operationId);
      if (previous) {
        if (previous.legId !== owner.id || previous.expectedRevision !== input.expectedRevision)
          throw new TripsServiceError('leg_removal_conflict');
        archivedLeg(tx, owner.journeyId, owner.id);
        return result(tx, owner, previous);
      }
      if (revision !== input.expectedRevision) throw new TripsServiceError('leg_revision_conflict');
      assertLegRevisionWritable(revision);
      getJourneyLeg(tx, owner.tripId, owner.journeyId, owner.id);
      const ids = listJourneyLegs(tx, owner.tripId, owner.journeyId).map((leg) => leg.id);
      const removedAt = new Date().toISOString();
      const receipt = requireOwnedRecord(
        tx
          .insert(legRemovals)
          .values({
            journeyId: owner.journeyId,
            legId: owner.id,
            operationId: input.operationId,
            expectedRevision: revision,
            removedRevision: revision + 1,
            ordinal: ids.indexOf(owner.id),
            remainingLegIds: ids.filter((id) => id !== owner.id),
            removedAt,
          })
          .returning()
          .get()
      );
      tx.update(journeyLegs)
        .set({ removedAt, removalOperationId: input.operationId })
        .where(eq(journeyLegs.id, owner.id))
        .run();
      advanceLegRevision(tx, owner.journeyId, revision);
      return result(tx, owner, receipt);
    },
    { behavior: 'immediate' }
  );
}
/** Restore retained source and exact order once; stale revisions or changed live membership never merge silently. */
export function restoreJourneyLeg(
  db: TripsDb,
  owner: Owner & { operationId: string },
  expectedRevision: number
): LegRemovalResult {
  return db.transaction(
    (tx) => {
      const revision = requireLegRevision(tx, owner);
      const receipt = requireOwnedRecord(findReceipt(tx, owner.journeyId, owner.operationId));
      const leg = archivedLeg(tx, owner.journeyId, receipt.legId);
      if (receipt.restoredRevision !== null) {
        if (receipt.restoredExpectedRevision !== expectedRevision)
          throw new TripsServiceError('leg_removal_conflict');
        return result(tx, owner, receipt);
      }
      if (revision !== expectedRevision) throw new TripsServiceError('leg_revision_conflict');
      assertLegRevisionWritable(revision);
      if (leg.removedAt === null || leg.removalOperationId !== owner.operationId)
        throw new TripsServiceError('leg_removal_conflict');
      const ids = listJourneyLegs(tx, owner.tripId, owner.journeyId).map((item) => item.id);
      if (
        ids.length !== receipt.remainingLegIds.length ||
        ids.some((id, index) => id !== receipt.remainingLegIds[index])
      )
        throw new TripsServiceError('leg_order_conflict');
      tx.update(journeyLegs)
        .set({ removedAt: null, removalOperationId: null })
        .where(eq(journeyLegs.id, receipt.legId))
        .run();
      writeLegOrder(tx, owner.journeyId, [
        ...ids.slice(0, receipt.ordinal),
        receipt.legId,
        ...ids.slice(receipt.ordinal),
      ]);
      advanceLegRevision(tx, owner.journeyId, revision);
      const restored = requireOwnedRecord(
        tx
          .update(legRemovals)
          .set({
            restoredExpectedRevision: expectedRevision,
            restoredRevision: revision + 1,
            restoredAt: new Date().toISOString(),
          })
          .where(eq(legRemovals.id, receipt.id))
          .returning()
          .get()
      );
      return result(tx, owner, restored);
    },
    { behavior: 'immediate' }
  );
}
