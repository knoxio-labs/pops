import { initServer } from '@ts-rest/express';

import { staysContract } from '../../contract/stays.js';
import { createStay, deleteStay, getStay, listStays, updateStay } from '../../db/services/stays.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt independent stay source operations to the published REST contract. */
export function makeStayHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof staysContract>> {
  return server.router(staysContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { stays: listStays(db, params.tripId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getStay(db, params.tripId, params.id),
      })),
    create: ({ params, body }) =>
      withTripsErrors(() => ({ status: 201 as const, body: createStay(db, params.tripId, body) })),
    update: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: updateStay(db, params.tripId, params.id, body),
      })),
    delete: ({ params }) =>
      withTripsErrors(() => {
        deleteStay(db, params.tripId, params.id);
        return { status: 204 as const, body: undefined };
      }),
  });
}
