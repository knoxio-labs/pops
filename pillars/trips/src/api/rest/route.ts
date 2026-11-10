import { initServer } from '@ts-rest/express';

import { routeContract } from '../../contract/route.js';
import { operateTripRoute } from '../../db/services/route-operations.js';
import { getTripRoute } from '../../db/services/route-queries.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();
/** Adapt the same canonical mixed-route commands for authenticated UI and MCP consumers. */
export function makeRouteHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof routeContract>> {
  return server.router(routeContract, {
    get: ({ params }) =>
      withTripsErrors(() => ({ status: 200 as const, body: getTripRoute(db, params.tripId) })),
    operate: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: operateTripRoute(db, params.tripId, body),
      })),
  });
}
