import { isDeepStrictEqual } from 'node:util';

import { and, eq, isNull } from 'drizzle-orm';

import { RouteDraftReceiptSchema } from '../../contract/route-draft-schemas.js';
import { routeOperations } from '../schema/route.js';
import { acknowledgeRouteDraftInverse, restoreRouteDraftEffects } from './route-draft-undo.js';
import { routeSourceExists } from './route-membership.js';
import { acknowledgeRouteUndo, findRouteOperation } from './route-operation-records.js';
import { TripsServiceError } from './source-record.js';

import type { RouteDraftOperation, RouteDraftReceipt } from '../../contract/route-draft-schemas.js';
import type { TripsDb } from '../index.js';
import type { RouteDraftSnapshot } from './route-draft-snapshot.js';

function requireUndoableDraft(
  prior: typeof routeOperations.$inferSelect | undefined,
  snapshot: RouteDraftSnapshot
): typeof routeOperations.$inferSelect {
  if (
    prior === undefined ||
    prior.family !== 'draft' ||
    prior.request.command.kind !== 'path.delete' ||
    prior.undoneBy !== null ||
    prior.sourceInverse === null ||
    !isDeepStrictEqual(prior.expectedAfter, snapshot.route)
  ) {
    throw new TripsServiceError('route_draft_undo_conflict');
  }
  return prior;
}

function restoreDeletedPath(
  db: TripsDb,
  snapshot: RouteDraftSnapshot,
  prior: typeof routeOperations.$inferSelect
): { original: RouteDraftReceipt; restored: RouteDraftSnapshot } {
  const original = RouteDraftReceiptSchema.parse(prior.receipt);
  if (prior.sourceInverse === null) throw new TripsServiceError('route_draft_undo_conflict');
  const restored = restoreRouteDraftEffects(db, snapshot, prior.sourceInverse, prior.operationId);
  const path = original.before.paths.find((entry) => entry.id === original.deletion.pathId);
  if (
    path === undefined ||
    path.members.some((source) => !routeSourceExists(db, snapshot.route.tripId, source))
  ) {
    throw new TripsServiceError('route_draft_undo_conflict');
  }
  return { original, restored };
}

function acknowledgePredecessors(
  db: TripsDb,
  tripId: number,
  prior: typeof routeOperations.$inferSelect,
  restored: RouteDraftSnapshot
): void {
  if (prior.sourceInverse === null) throw new TripsServiceError('route_draft_undo_conflict');
  const predecessors = db
    .select()
    .from(routeOperations)
    .where(
      and(
        eq(routeOperations.tripId, tripId),
        eq(routeOperations.family, 'draft'),
        isNull(routeOperations.undoneBy)
      )
    )
    .all();
  for (const predecessor of predecessors) {
    if (predecessor.request.command.kind !== 'path.delete' || predecessor.sourceInverse === null)
      continue;
    const sourceInverse = acknowledgeRouteDraftInverse(
      predecessor.sourceInverse,
      prior.sourceInverse,
      restored
    );
    if (!isDeepStrictEqual(sourceInverse, predecessor.sourceInverse)) {
      db.update(routeOperations)
        .set({ sourceInverse })
        .where(eq(routeOperations.id, predecessor.id))
        .run();
    }
  }
}

/** Undo one previously deleted route path after validating its exact durable source and route guards. */
export function undoRouteDraft(
  db: TripsDb,
  snapshot: RouteDraftSnapshot,
  operation: RouteDraftOperation
): { receipt: RouteDraftReceipt; inverse: null } {
  if (operation.command.kind !== 'undo') throw new TripsServiceError('route_draft_undo_conflict');
  const target = findRouteOperation(db, snapshot.route.tripId, operation.command.targetOperationId);
  const prior = requireUndoableDraft(target, snapshot);
  const { original, restored } = restoreDeletedPath(db, snapshot, prior);
  const after = { ...original.before, revision: snapshot.route.revision + 1 };
  acknowledgeRouteUndo(db, prior, operation.operationId, after);
  acknowledgePredecessors(db, snapshot.route.tripId, prior, restored);
  return {
    receipt: {
      operationId: operation.operationId,
      undoneOperationId: prior.operationId,
      before: snapshot.route,
      after,
      deletion: original.deletion,
    },
    inverse: null,
  };
}
