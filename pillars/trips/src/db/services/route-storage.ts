import { eq } from 'drizzle-orm';

import { TripRouteSchema } from '../../contract/route-schemas.js';
import { tripRoutes } from '../schema/route.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { TripRoute } from '../../contract/route-schemas.js';
import type { TripsDb } from '../index.js';

/** Read the sole route-order aggregate; all trips receive one at creation or migration. */
export function readRouteSnapshot(db: TripsDb, tripId: number): TripRoute {
  const row = requireOwnedRecord(
    db.select().from(tripRoutes).where(eq(tripRoutes.tripId, tripId)).get()
  );
  return TripRouteSchema.parse({ tripId, revision: row.revision, ...row.content });
}
/** Create the empty aggregate in the same transaction as its owning Trip. */
export function initializeTripRoute(db: TripsDb, tripId: number): void {
  db.insert(tripRoutes)
    .values({ tripId, content: { order: [], paths: [] } })
    .run();
}
/** Advance only a safe exact route revision; exhausted or stale aggregates reject before writes. */
export function requireRouteRevision(route: TripRoute, expectedRevision: number): void {
  if (route.revision !== expectedRevision || route.revision >= Number.MAX_SAFE_INTEGER)
    throw new TripsServiceError('route_revision_conflict');
}
/** Persist a complete guarded aggregate; callers own the encompassing immediate transaction. */
export function writeRouteSnapshot(db: TripsDb, route: TripRoute): void {
  db.update(tripRoutes)
    .set({ revision: route.revision, content: { order: route.order, paths: route.paths } })
    .where(eq(tripRoutes.tripId, route.tripId))
    .run();
}
/** Legacy Visit creation appends to the authoritative mixed root without inferring Journey placement. */
export function appendRouteVisit(db: TripsDb, tripId: number, id: number): void {
  const before = readRouteSnapshot(db, tripId);
  requireRouteRevision(before, before.revision);
  writeRouteSnapshot(db, {
    ...before,
    revision: before.revision + 1,
    order: [...before.order, { kind: 'visit', id }],
  });
}
