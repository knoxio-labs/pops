import { initServer } from '@ts-rest/express';

import { tripsContract } from '../../contract/rest.js';
import {
  createVisit,
  getVisit,
  listVisits,
  reorderVisits,
  updateVisit,
} from '../../db/services/records.js';
import {
  makeCaptureHandlers,
  makeIdeaHandlers,
  makeExploreHandlers,
  makeCaptureWorkspaceHandlers,
} from './captures.js';
import { makeDecisionHandlers, makeDecisionOptionHandlers } from './decisions.js';
import { makeDocumentAssociationHandlers } from './document-associations.js';
import { makeEventHandlers } from './events.js';
import { makeJourneyGroupHandlers } from './journey-groups.js';
import { makeJourneyHandlers, makeJourneyLegHandlers } from './journeys.js';
import { makeMeetingPlanHandlers } from './meeting-plans.js';
import { makePlaceHandlers } from './places.js';
import { makeRentalHandlers } from './rentals.js';
import { makeResponsibilityHandlers } from './responsibilities.js';
import { makeRouteHandlers } from './route.js';
import { makeStayHandlers } from './stays.js';
import { makeTripMetadataHandlers } from './trip-metadata.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt the trips-owned domain operations to the published REST contract. */
export function makeTripsRestHandlers(
  deps: TripsApiDeps
): ReturnType<typeof server.router<typeof tripsContract>> {
  const db = deps.tripsDb.db;
  return server.router(tripsContract, {
    route: makeRouteHandlers(db),
    captureWorkspace: makeCaptureWorkspaceHandlers(db),
    captures: makeCaptureHandlers(db),
    ideas: makeIdeaHandlers(db),
    explore: makeExploreHandlers(db),
    rentals: makeRentalHandlers(db),
    responsibilities: makeResponsibilityHandlers(deps),
    events: makeEventHandlers(db),
    decisions: makeDecisionHandlers(db),
    decisionOptions: makeDecisionOptionHandlers(db),
    stays: makeStayHandlers(db),
    meetingPlans: makeMeetingPlanHandlers(deps),
    documentAssociations: makeDocumentAssociationHandlers(db),
    journeyGroups: makeJourneyGroupHandlers(db),
    journeys: makeJourneyHandlers(db),
    journeyLegs: makeJourneyLegHandlers(db),
    trips: makeTripMetadataHandlers(deps),
    places: makePlaceHandlers(db),
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
