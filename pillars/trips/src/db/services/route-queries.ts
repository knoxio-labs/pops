import { routeSourceExists, sameRouteItem } from './route-membership.js';
import { readRouteSnapshot } from './route-storage.js';

import type { RouteSource, TripRouteRead } from '../../contract/route-schemas.js';
import type { TripsDb } from '../index.js';

/** Read actual flat placement and path membership, preserving missing refs and never deriving order from source dates. */
export function getTripRoute(db: TripsDb, tripId: number): TripRouteRead {
  return db.transaction((tx) => {
    const route = readRouteSnapshot(tx, tripId);
    const sources: RouteSource[] = [
      ...route.order.filter((item) => item.kind !== 'gap'),
      ...route.paths.flatMap((path) => path.members),
    ];
    const missingSources = sources.filter(
      (source, index) =>
        !sources.slice(0, index).some((prior) => sameRouteItem(prior, source)) &&
        !routeSourceExists(tx, tripId, source)
    );
    return { ...route, missingSources };
  });
}
