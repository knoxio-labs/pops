import { initServer } from '@ts-rest/express';

import { rentalsContract } from '../../contract/rentals.js';
import {
  createRental,
  deleteRental,
  getRental,
  listRentals,
  updateRental,
} from '../../db/services/rentals.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt revision-guarded rental operations to the published source contract. */
export function makeRentalHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof rentalsContract>> {
  return server.router(rentalsContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { rentals: listRentals(db, params.tripId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getRental(db, params.tripId, params.id),
      })),
    create: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 201 as const,
        body: createRental(db, params.tripId, body),
      })),
    update: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: updateRental(db, params.tripId, params.id, body),
      })),
    delete: ({ params, body }) =>
      withTripsErrors(() => {
        deleteRental(db, params.tripId, params.id, body.expectedRevision);
        return { status: 204 as const, body: undefined };
      }),
  });
}
