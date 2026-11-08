import { initServer } from '@ts-rest/express';

import { journeyGroupsContract } from '../../contract/journey-groups.js';
import { getJourneyGroup, listJourneyGroups } from '../../db/services/journey-group-queries.js';
import {
  addBlankJourneyAlternative,
  createJourneyGroup,
  deleteJourneyGroup,
  selectJourneyAlternative,
} from '../../db/services/journey-groups.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt explicit grouping and source-preserving selection to the published REST surface. */
export function makeJourneyGroupHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof journeyGroupsContract>> {
  return server.router(journeyGroupsContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { groups: listJourneyGroups(db, params.tripId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getJourneyGroup(db, params.tripId, params.id),
      })),
    create: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 201 as const,
        body: createJourneyGroup(db, params.tripId, body),
      })),
    addBlank: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 201 as const,
        body: addBlankJourneyAlternative(db, params, body.expectedRevision),
      })),
    select: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: selectJourneyAlternative(db, params, body),
      })),
    delete: ({ params, body }) =>
      withTripsErrors(() => {
        deleteJourneyGroup(db, params, body.expectedRevision);
        return { status: 204 as const, body: undefined };
      }),
  });
}
