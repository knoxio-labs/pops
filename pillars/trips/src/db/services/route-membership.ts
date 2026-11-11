import { and, eq } from 'drizzle-orm';

import { journeys, visits } from '../schema.js';
import { TripsServiceError } from './source-record.js';

import type { RouteItem, RoutePath, RouteSource, TripRoute } from '../../contract/route-schemas.js';
import type { TripsDb } from '../index.js';

/** Compare identity namespaces and opaque numeric IDs, never labels, endpoints or dates. */
export function sameRouteItem(left: RouteItem, right: RouteItem): boolean {
  return left.kind === right.kind && left.id === right.id;
}
/** Resolve only explicit canonical ownership; missing historical refs remain readable. */
export function routeSourceExists(db: TripsDb, tripId: number, source: RouteSource): boolean {
  const table = source.kind === 'visit' ? visits : journeys;
  return (
    db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.tripId, tripId), eq(table.id, source.id)))
      .get() !== undefined
  );
}
/** Validate newly adopted identities before applying any part of a complete path. */
export function requireRouteSource(db: TripsDb, tripId: number, source: RouteSource): void {
  if (!routeSourceExists(db, tripId, source)) throw new TripsServiceError('not_found');
}
/** Return root then active alternative Visit membership in explicit persisted container order. */
export function orderedRouteVisitIds(route: TripRoute): number[] {
  return [
    ...route.order,
    ...route.paths.filter((path) => path.state === 'alternative').flatMap((path) => path.members),
  ]
    .filter((item) => item.kind === 'visit')
    .map((item) => item.id);
}
/** Require an active alternative; applied paths remain history and cannot be edited as duplicate containers. */
export function requireAlternative(route: TripRoute, id: number): RoutePath {
  const path = route.paths.find((item) => item.id === id);
  if (path === undefined) throw new TripsServiceError('not_found');
  if (path.state !== 'alternative') throw new TripsServiceError('route_membership_conflict');
  return path;
}
/** Require exact unique membership for a reorder, including identity namespaces. */
export function requireRoutePermutation<T extends RouteItem>(before: T[], after: T[]): void {
  if (
    before.length !== after.length ||
    after.some((item, index) =>
      after.slice(0, index).some((prior) => sameRouteItem(prior, item))
    ) ||
    after.some((item) => !before.some((prior) => sameRouteItem(prior, item)))
  )
    throw new TripsServiceError('order_invalid');
}
/** Insert at an explicit existing anchor; null alone selects the container's end. */
export function insertRouteItems<T extends RouteItem>(
  items: T[],
  additions: T[],
  before: T | null
): T[] {
  const index =
    before === null ? items.length : items.findIndex((item) => sameRouteItem(item, before));
  if (index < 0) throw new TripsServiceError('route_membership_conflict');
  return [...items.slice(0, index), ...additions, ...items.slice(index)];
}
