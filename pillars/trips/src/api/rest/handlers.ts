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
  updatePlace,
  updateTrip,
  updateVisit,
} from '../../db/services/records.js';
import { makeJourneyGroupHandlers } from './journey-groups.js';
import { makeJourneyHandlers, makeJourneyLegHandlers } from './journeys.js';
import { makeStayHandlers } from './stays.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt the trips-owned domain operations to the published REST contract. */
export function makeTripsRestHandlers(
  deps: TripsApiDeps
): ReturnType<typeof server.router<typeof tripsContract>> {
  const db = deps.tripsDb.db;
  return server.router(tripsContract, {
    stays: makeStayHandlers(db),
    journeyGroups: makeJourneyGroupHandlers(db),
    journeys: makeJourneyHandlers(db),
    journeyLegs: makeJourneyLegHandlers(db),
    trips: {
      list: () => withTripsErrors(() => ({ status: 200 as const, body: { trips: listTrips(db) } })),
      get: ({ params }) =>
        withTripsErrors(() => ({ status: 200 as const, body: getTrip(db, params.id) })),
      create: ({ body }) =>
        withTripsErrors(() => ({ status: 201 as const, body: createTrip(db, body) })),
      update: ({ params, body }) =>
        withTripsErrors(() => ({ status: 200 as const, body: updateTrip(db, params.id, body) })),
    },
    places: {
      list: () =>
        withTripsErrors(() => ({ status: 200 as const, body: { places: listPlaces(db) } })),
      get: ({ params }) =>
        withTripsErrors(() => ({ status: 200 as const, body: getPlace(db, params.id) })),
      create: ({ body }) =>
        withTripsErrors(() => ({ status: 201 as const, body: createPlace(db, body) })),
      update: ({ params, body }) =>
        withTripsErrors(() => ({ status: 200 as const, body: updatePlace(db, params.id, body) })),
    },
    visits: {
      list: ({ params }) =>
        withTripsErrors(() => ({
          status: 200 as const,
          body: { visits: listVisits(db, params.tripId) },
        })),
      get: ({ params }) =>
        withTripsErrors(() => ({
          status: 200 as const,
          body: getVisit(db, params.tripId, params.id),
        })),
      create: ({ params, body }) =>
        withTripsErrors(() => ({
          status: 201 as const,
          body: createVisit(db, params.tripId, body),
        })),
      update: ({ params, body }) =>
        withTripsErrors(() => ({
          status: 200 as const,
          body: updateVisit(db, params.tripId, params.id, body),
        })),
      reorder: ({ params, body }) =>
        withTripsErrors(() => ({
          status: 200 as const,
          body: { visits: reorderVisits(db, params.tripId, body.visitIds) },
        })),
    },
  });
}
