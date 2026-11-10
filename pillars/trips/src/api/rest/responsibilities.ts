import { initServer } from '@ts-rest/express';

import { responsibilitiesContract } from '../../contract/responsibilities.js';
import {
  getResponsibility,
  listResponsibilities,
  replaceResponsibility,
} from '../../db/services/responsibilities.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt explicit responsibility reads and replacement/clear writes without Contacts coupling. */
export function makeResponsibilityHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof responsibilitiesContract>> {
  return server.router(responsibilitiesContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { responsibilities: listResponsibilities(db, params.tripId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getResponsibility(db, params.tripId, params.targetKind, params.targetId),
      })),
    replace: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: replaceResponsibility(
          db,
          params.tripId,
          { kind: params.targetKind, id: params.targetId },
          { expectedRevision: body.expectedRevision, responsibility: body.responsibility }
        ),
      })),
  });
}
