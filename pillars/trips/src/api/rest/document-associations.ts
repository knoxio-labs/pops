import { initServer } from '@ts-rest/express';

import { documentAssociationsContract } from '../../contract/document-associations.js';
import {
  createDocumentAssociation,
  deleteDocumentAssociation,
  listDocumentAssociations,
} from '../../db/services/document-associations.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt typed document association operations to the Trips REST contract. */
export function makeDocumentAssociationHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof documentAssociationsContract>> {
  return server.router(documentAssociationsContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { associations: listDocumentAssociations(db, params.tripId) },
      })),
    create: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 201 as const,
        body: createDocumentAssociation(db, params.tripId, body),
      })),
    delete: ({ params }) =>
      withTripsErrors(() => {
        deleteDocumentAssociation(db, params.tripId, params.id);
        return { status: 204 as const, body: undefined };
      }),
  });
}
