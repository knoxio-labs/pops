import { initServer } from '@ts-rest/express';

import { routeDraftsContract } from '../../contract/route-drafts.js';
import { operateRouteDraft } from '../../db/services/route-draft-operations.js';
import { previewRouteDraftDeletion } from '../../db/services/route-draft-preview.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt read-only previews and atomic source-aware mutations through the dedicated capability. */
export function makeRouteDraftHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof routeDraftsContract>> {
  return server.router(routeDraftsContract, {
    preview: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: previewRouteDraftDeletion(db, params.tripId, params.pathId, body),
      })),
    operate: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: operateRouteDraft(db, params.tripId, body),
      })),
  });
}
