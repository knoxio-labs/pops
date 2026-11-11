import { isDeepStrictEqual } from 'node:util';

import { and, eq, isNull } from 'drizzle-orm';

import { RouteOperationSchema } from '../../contract/route-schemas.js';
import { routeOperations } from '../schema/route.js';
import { applyRouteCommand } from './route-commands.js';
import { readRouteSnapshot, requireRouteRevision, writeRouteSnapshot } from './route-storage.js';
import { TripsServiceError } from './source-record.js';

import type {
  RouteOperation,
  RouteOperationResult,
  RouteReceipt,
  TripRoute,
} from '../../contract/route-schemas.js';
import type { TripsDb } from '../index.js';

function findOperation(
  db: TripsDb,
  tripId: number,
  operationId: string
): typeof routeOperations.$inferSelect | undefined {
  return db
    .select()
    .from(routeOperations)
    .where(and(eq(routeOperations.tripId, tripId), eq(routeOperations.operationId, operationId)))
    .get();
}
function undo(db: TripsDb, before: TripRoute, operation: RouteOperation): RouteReceipt {
  if (operation.command.kind !== 'undo') throw new TripsServiceError('route_undo_conflict');
  const prior = findOperation(db, before.tripId, operation.command.targetOperationId);
  if (
    prior === undefined ||
    prior.undoneBy !== null ||
    prior.request.command.kind === 'undo' ||
    isDeepStrictEqual(prior.receipt.before, prior.receipt.after) ||
    !isDeepStrictEqual(prior.expectedAfter, before)
  )
    throw new TripsServiceError('route_undo_conflict');
  const after = { ...prior.receipt.before, revision: before.revision + 1 };
  db.update(routeOperations)
    .set({ undoneBy: operation.operationId })
    .where(eq(routeOperations.id, prior.id))
    .run();
  const predecessors = db
    .select()
    .from(routeOperations)
    .where(and(eq(routeOperations.tripId, before.tripId), isNull(routeOperations.undoneBy)))
    .all()
    .filter(
      (entry) =>
        entry.request.command.kind !== 'undo' &&
        !isDeepStrictEqual(entry.receipt.before, entry.receipt.after) &&
        isDeepStrictEqual(entry.expectedAfter, prior.receipt.before)
    );
  if (predecessors.length > 1) throw new TripsServiceError('route_undo_conflict');
  const predecessor = predecessors[0];
  if (predecessor !== undefined)
    db.update(routeOperations)
      .set({ expectedAfter: after })
      .where(eq(routeOperations.id, predecessor.id))
      .run();
  return {
    operationId: operation.operationId,
    undoneOperationId: prior.operationId,
    before,
    after,
  };
}
/** Atomically CAS the entire mixed order/path move, or replay its immutable UUID outcome without another write. */
export function operateTripRoute(
  db: TripsDb,
  tripId: number,
  input: RouteOperation
): RouteOperationResult {
  const operation = RouteOperationSchema.parse(JSON.parse(JSON.stringify(input)));
  return db.transaction(
    (tx) => {
      const before = readRouteSnapshot(tx, tripId);
      const prior = findOperation(tx, tripId, operation.operationId);
      if (prior !== undefined) {
        if (!isDeepStrictEqual(prior.request, operation))
          throw new TripsServiceError('route_operation_mismatch');
        return {
          receipt: prior.receipt,
          current: before,
          replayed: true,
          undone: prior.undoneBy !== null,
        };
      }
      requireRouteRevision(before, operation.expectedRevision);
      const changed =
        operation.command.kind === 'undo'
          ? undefined
          : applyRouteCommand(tx, before, operation.command);
      const receipt: RouteReceipt =
        changed === undefined
          ? undo(tx, before, operation)
          : {
              operationId: operation.operationId,
              undoneOperationId: null,
              before,
              after: changed === before ? before : { ...changed, revision: before.revision + 1 },
            };
      writeRouteSnapshot(tx, receipt.after);
      tx.insert(routeOperations)
        .values({
          tripId,
          operationId: operation.operationId,
          request: operation,
          receipt,
          expectedAfter: receipt.after,
        })
        .run();
      return { receipt, current: receipt.after, undone: false, replayed: false };
    },
    { behavior: 'immediate' }
  );
}
