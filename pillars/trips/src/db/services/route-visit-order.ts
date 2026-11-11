import { orderedRouteVisitIds } from './route-membership.js';
import { readRouteSnapshot, requireRouteRevision, writeRouteSnapshot } from './route-storage.js';

import type { RouteItem } from '../../contract/route-schemas.js';
import type { Visit } from '../../contract/schemas.js';
import type { TripsDb } from '../index.js';

/** Project root then active alternatives; unplaced canonical Visits retain their prior source order and remain visible. */
export function projectVisitOrder(db: TripsDb, tripId: number, existing: Visit[]): Visit[] {
  const ordered = orderedRouteVisitIds(readRouteSnapshot(db, tripId));
  const ranks = new Map(ordered.map((id, index) => [id, index]));
  return existing.toSorted(
    (left, right) =>
      (ranks.get(left.id) ?? ordered.length) - (ranks.get(right.id) ?? ordered.length)
  );
}
function reorderSlots<T extends RouteItem>(items: T[], ranks: Map<number, number>): T[] {
  const visits = items
    .filter((item) => item.kind === 'visit')
    .toSorted((left, right) => (ranks.get(left.id) ?? 0) - (ranks.get(right.id) ?? 0));
  let index = 0;
  return items.map((item) => (item.kind === 'visit' ? (visits[index++] ?? item) : item));
}
/** Legacy permutations rank Visit slots inside each current container; they cannot move membership or Journey/gap tokens. */
export function reorderLegacyRoute(db: TripsDb, tripId: number, visitIds: number[]): void {
  const route = readRouteSnapshot(db, tripId);
  requireRouteRevision(route, route.revision);
  const ranks = new Map(visitIds.map((id, index) => [id, index]));
  writeRouteSnapshot(db, {
    ...route,
    revision: route.revision + 1,
    order: reorderSlots(route.order, ranks),
    paths: route.paths.map((path) =>
      path.state === 'alternative' ? { ...path, members: reorderSlots(path.members, ranks) } : path
    ),
  });
}
