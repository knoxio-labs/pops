import { initServer } from '@ts-rest/express';

import { responsibilitiesContract } from '../../contract/responsibilities.js';
import {
  getResponsibility,
  listResponsibilities,
  replaceResponsibility,
} from '../../db/services/responsibilities.js';
import { prepareResponsibilityContact } from './responsibility-contact.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();

/** Verify new Contact selections, then adapt revision-guarded responsibility reads and writes. */
export function makeResponsibilityHandlers(
  deps: TripsApiDeps
): ReturnType<typeof server.router<typeof responsibilitiesContract>> {
  const db = deps.tripsDb.db;
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
      withTripsErrors(async () => {
        const responsibility = await prepareResponsibilityContact(
          db,
          params,
          body,
          deps.resolveContactReference
        );
        return {
          status: 200 as const,
          body: replaceResponsibility(
            db,
            params.tripId,
            { kind: params.targetKind, id: params.targetId },
            { ...body, responsibility }
          ),
        };
      }),
  });
}
