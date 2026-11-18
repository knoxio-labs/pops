import { isDeepStrictEqual } from 'node:util';

import { and, eq, isNull } from 'drizzle-orm';

import { routeOperations } from '../schema/route.js';
import { TripsServiceError } from './source-record.js';

import type { TripRoute } from '../../contract/route-schemas.js';
import type { TripsDb } from '../index.js';

/** The trip owns one UUID namespace across placement and destructive draft capabilities. */
export function findRouteOperation(
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

/** Advance only a proven own predecessor's route guard; source inverses retain their independent guards. */
export function acknowledgeRouteUndo(
  db: TripsDb,
  prior: typeof routeOperations.$inferSelect,
  operationId: string,
  after: TripRoute
): typeof routeOperations.$inferSelect | undefined {
  db.update(routeOperations)
    .set({ undoneBy: operationId })
    .where(eq(routeOperations.id, prior.id))
    .run();
  const predecessors = db
    .select()
    .from(routeOperations)
    .where(and(eq(routeOperations.tripId, prior.tripId), isNull(routeOperations.undoneBy)))
    .all()
    .filter(
      (entry) =>
        entry.request.command.kind !== 'undo' &&
        !isDeepStrictEqual(entry.receipt.before, entry.receipt.after) &&
        isDeepStrictEqual(entry.expectedAfter, prior.receipt.before)
    );
  if (predecessors.length > 1) throw new TripsServiceError('route_undo_conflict');
  const predecessor = predecessors[0];
  if (predecessor !== undefined) {
    db.update(routeOperations)
      .set({ expectedAfter: after })
      .where(eq(routeOperations.id, predecessor.id))
      .run();
  }
  return predecessor;
}
