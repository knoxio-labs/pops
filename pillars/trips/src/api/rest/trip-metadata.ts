import { initServer } from '@ts-rest/express';

import { tripsContract } from '../../contract/rest.js';
import { createTrip, getTrip, listTrips, updateTrip } from '../../db/services/records.js';
import { createTripOperation } from '../../db/services/trip-create-operations.js';
import { prepareTripTag } from './trip-tags.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt trip metadata and explicit parent/tag associations to the owning REST contract. */
export function makeTripMetadataHandlers(
  deps: TripsApiDeps
): ReturnType<typeof server.router<typeof tripsContract.trips>> {
  const db = deps.tripsDb.db;
  return server.router(tripsContract.trips, {
    createOperation: ({ body }) =>
      withTripsErrors(async () => ({
        status: 201 as const,
        body: await createTripOperation(db, body, (input) =>
          prepareTripTag(db, input, deps.fetchSharedTagIds)
        ),
      })),
    list: () => withTripsErrors(() => ({ status: 200 as const, body: { trips: listTrips(db) } })),
    get: ({ params }) =>
      withTripsErrors(() => ({ status: 200 as const, body: getTrip(db, params.id) })),
    create: ({ body }) =>
      withTripsErrors(async () => {
        await prepareTripTag(db, body, deps.fetchSharedTagIds);
        return { status: 201 as const, body: createTrip(db, body) };
      }),
    update: ({ params, body }) =>
      withTripsErrors(async () => {
        getTrip(db, params.id);
        await prepareTripTag(db, body, deps.fetchSharedTagIds);
        return { status: 200 as const, body: updateTrip(db, params.id, body) };
      }),
  });
}
