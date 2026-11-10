import { initServer } from '@ts-rest/express';

import { journeysContract, journeyLegsContract } from '../../contract/journeys.js';
import {
  createJourneyLeg,
  deleteJourneyLeg,
  getJourneyLeg,
  reorderJourneyLegs,
  updateJourneyLeg,
} from '../../db/services/journey-legs.js';
import { getJourneyTiming } from '../../db/services/journey-timing.js';
import { getJourneyWorkspace } from '../../db/services/journey-workspace.js';
import {
  createJourney,
  deleteJourney,
  getJourney,
  listJourneys,
  updateJourney,
} from '../../db/services/journeys.js';
import { removeJourneyLeg, restoreJourneyLeg } from '../../db/services/leg-removals.js';
import { getJourneyLegSet } from '../../db/services/leg-set.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt journey metadata source operations to the published REST contract. */
export function makeJourneyHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof journeysContract>> {
  return server.router(journeysContract, {
    workspace: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getJourneyWorkspace(db, params.tripId, params.id),
      })),
    timing: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getJourneyTiming(db, params.tripId, params.id),
      })),
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
        body: getJourneyLegSet(db, params.tripId, params.journeyId),
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getJourneyLeg(db, params.tripId, params.journeyId, params.id),
      })),
    delete: ({ params }) =>
      withTripsErrors(() => {
        deleteJourneyLeg(db, params.tripId, params.journeyId, params.id);
        return { status: 204 as const, body: undefined };
      }),
    ...legWriters(db),
    remove: ({ params, body }) =>
      withTripsErrors(() => ({ status: 200 as const, body: removeJourneyLeg(db, params, body) })),
    restore: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: restoreJourneyLeg(db, params, body.expectedRevision),
      })),
  });
}

type LegHandlers = ReturnType<typeof server.router<typeof journeyLegsContract>>;
function legWriters(db: TripsDb): Pick<LegHandlers, 'create' | 'update' | 'reorder'> {
  return {
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
    reorder: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { legs: reorderJourneyLegs(db, params.tripId, params.journeyId, body) },
      })),
  };
}
