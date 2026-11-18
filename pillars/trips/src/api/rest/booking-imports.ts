import { initServer } from '@ts-rest/express';

import { bookingImportsContract } from '../../contract/booking-imports.js';
import {
  bindBookingSource,
  commitBookingSource,
  extractBookingSource,
  getBookingImport,
  reviewBookingSource,
} from '../../db/services/booking-imports.js';
import { createBookingDocumentReader } from './booking-document-original.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();
/** Publish only owner-scoped import operations; extraction never implicitly commits a booking. */
export function makeBookingImportHandlers(
  deps: TripsApiDeps
): ReturnType<typeof server.router<typeof bookingImportsContract>> {
  const db = deps.tripsDb.db;
  const dependencies = {
    ...deps.bookingExtraction,
    readDocument: deps.bookingExtraction?.readDocument ?? createBookingDocumentReader(),
  };
  return server.router(bookingImportsContract, {
    bind: ({ params, body }) =>
      withTripsErrors(async () => ({
        status: 200 as const,
        body: await bindBookingSource(db, params.tripId, body, dependencies),
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getBookingImport(db, params.tripId, params.sourceId),
      })),
    extract: ({ params, body }) =>
      withTripsErrors(async () => ({
        status: 200 as const,
        body: await extractBookingSource(db, params.tripId, params.sourceId, {
          ...body,
          dependencies,
        }),
      })),
    review: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: reviewBookingSource(db, params.tripId, params.sourceId, body),
      })),
    commit: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: commitBookingSource(db, params.tripId, params.sourceId, body),
      })),
  });
}
