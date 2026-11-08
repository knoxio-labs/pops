import { initServer } from '@ts-rest/express';

import { tripsContract } from '../../contract/rest.js';
import {
  createPlace,
  createTrip,
  createVisit,
  getPlace,
  getTrip,
  getVisit,
  listPlaces,
  listTrips,
  listVisits,
  reorderVisits,
  TripsServiceError,
  updatePlace,
  updateTrip,
  updateVisit,
} from '../../db/service.js';
import { tripsErrors } from '../errors.js';

import type { TripsApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();

async function withErrors<T>(operation: () => T): Promise<T> {
  try {
    return operation();
  } catch (error) {
    if (error instanceof TripsServiceError) tripsErrors[error.code]();
    throw error;
  }
}

/** Adapt the trips-owned domain operations to the published REST contract. */
export function makeTripsRestHandlers(
  deps: TripsApiDeps
): ReturnType<typeof server.router<typeof tripsContract>> {
  const db = deps.tripsDb.db;
  return server.router(tripsContract, {
    trips: {
      list: () => withErrors(() => ({ status: 200 as const, body: { trips: listTrips(db) } })),
      get: ({ params }) =>
        withErrors(() => ({ status: 200 as const, body: getTrip(db, params.id) })),
      create: ({ body }) =>
        withErrors(() => ({ status: 201 as const, body: createTrip(db, body) })),
      update: ({ params, body }) =>
        withErrors(() => ({ status: 200 as const, body: updateTrip(db, params.id, body) })),
    },
    places: {
      list: () => withErrors(() => ({ status: 200 as const, body: { places: listPlaces(db) } })),
      get: ({ params }) =>
        withErrors(() => ({ status: 200 as const, body: getPlace(db, params.id) })),
      create: ({ body }) =>
        withErrors(() => ({ status: 201 as const, body: createPlace(db, body) })),
      update: ({ params, body }) =>
        withErrors(() => ({ status: 200 as const, body: updatePlace(db, params.id, body) })),
    },
    visits: {
      list: ({ params }) =>
        withErrors(() => ({
          status: 200 as const,
          body: { visits: listVisits(db, params.tripId) },
        })),
      get: ({ params }) =>
        withErrors(() => ({ status: 200 as const, body: getVisit(db, params.tripId, params.id) })),
      create: ({ params, body }) =>
        withErrors(() => ({ status: 201 as const, body: createVisit(db, params.tripId, body) })),
      update: ({ params, body }) =>
        withErrors(() => ({
          status: 200 as const,
          body: updateVisit(db, params.tripId, params.id, body),
        })),
      reorder: ({ params, body }) =>
        withErrors(() => ({
          status: 200 as const,
          body: { visits: reorderVisits(db, params.tripId, body.visitIds) },
        })),
    },
  });
}
