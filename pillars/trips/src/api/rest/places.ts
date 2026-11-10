import { initServer } from '@ts-rest/express';

import { tripsContract } from '../../contract/rest.js';
import { createPlace, getPlace, listPlaces, updatePlace } from '../../db/services/records.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt existing reusable Place source operations without deriving Visit identity. */
export function makePlaceHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof tripsContract.places>> {
  return server.router(tripsContract.places, {
    list: () => withTripsErrors(() => ({ status: 200 as const, body: { places: listPlaces(db) } })),
    get: ({ params }) =>
      withTripsErrors(() => ({ status: 200 as const, body: getPlace(db, params.id) })),
    create: ({ body }) =>
      withTripsErrors(() => ({ status: 201 as const, body: createPlace(db, body) })),
    update: ({ params, body }) =>
      withTripsErrors(() => ({ status: 200 as const, body: updatePlace(db, params.id, body) })),
  });
}
