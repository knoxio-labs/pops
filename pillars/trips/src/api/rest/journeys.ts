import { initServer } from '@ts-rest/express';

import { journeysContract, journeyLegsContract } from '../../contract/journeys.js';
import {
  createJourneyLeg,
  deleteJourneyLeg,
  getJourneyLeg,
  listJourneyLegs,
  reorderJourneyLegs,
  updateJourneyLeg,
} from '../../db/services/journey-legs.js';
import {
  createJourney,
  deleteJourney,
  getJourney,
  listJourneys,
  updateJourney,
} from '../../db/services/journeys.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt journey metadata source operations to the published REST contract. */
export function makeJourneyHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof journeysContract>> {
  return server.router(journeysContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { journeys: listJourneys(db, params.tripId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getJourney(db, params.tripId, params.id),
      })),
    create: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 201 as const,
        body: createJourney(db, params.tripId, body),
      })),
    update: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: updateJourney(db, params.tripId, params.id, body),
      })),
    delete: ({ params }) =>
      withTripsErrors(() => {
        deleteJourney(db, params.tripId, params.id);
        return { status: 204 as const, body: undefined };
      }),
  });
}

/** Adapt ordered leg source operations without deriving booking or time semantics. */
export function makeJourneyLegHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof journeyLegsContract>> {
  return server.router(journeyLegsContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { legs: listJourneyLegs(db, params.tripId, params.journeyId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getJourneyLeg(db, params.tripId, params.journeyId, params.id),
      })),
    create: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 201 as const,
        body: createJourneyLeg(db, params.tripId, params.journeyId, body),
      })),
    update: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: updateJourneyLeg(db, params, body),
      })),
    delete: ({ params }) =>
      withTripsErrors(() => {
        deleteJourneyLeg(db, params.tripId, params.journeyId, params.id);
        return { status: 204 as const, body: undefined };
      }),
    reorder: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { legs: reorderJourneyLegs(db, params.tripId, params.journeyId, body.legIds) },
      })),
  });
}
