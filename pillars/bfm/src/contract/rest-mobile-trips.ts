import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import { MobileTripRouteSchema } from './mobile-trip-route-schemas.js';
import { MobileTripInputSchema, MobileTripPatchInputSchema } from './mobile-trip-write-schemas.js';
import {
  MobileTripDetailSchema,
  MobileTripDetailV2Schema,
  MobileTripsPageSchema,
  MobileTripsQuerySchema,
} from './mobile-trips-detail-schemas.js';
import { MobileTripSchema } from './mobile-trips-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import { MobileRequestErrorSchema, MobileUpstreamErrorSchema } from './rest-schemas.js';

const c = initContract();
const writeErrors = {
  ...MOBILE_PERIMETER_RESPONSES,
  ...MOBILE_UPSTREAM_RESPONSES,
  400: z.union([MobileRequestErrorSchema, MobileUpstreamErrorSchema]),
  404: MobileUpstreamErrorSchema,
  409: MobileUpstreamErrorSchema,
};
/** Native source-backed Trips surface, preserving the published producer's source facts and ordering. */
export const mobileTripsContract = c.router({
  getRoute: {
    method: 'GET',
    path: '/mobile/trips/:tripId/route',
    pathParams: z.object({ tripId: z.coerce.number().int().positive().safe() }),
    responses: {
      200: MobileTripRouteSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary:
      'Read canonical mixed route order, alternative paths, applied history and missing sources',
    metadata: requires('trips.read'),
  },
  createTrip: {
    method: 'POST',
    path: '/mobile/trips',
    body: MobileTripInputSchema,
    responses: { 201: MobileTripSchema, ...writeErrors },
    metadata: requires('trips.write'),
    summary: 'Create a permanent canonical Trip without inferred dates or creation Undo',
  },
  updateTrip: {
    method: 'PATCH',
    path: '/mobile/trips/:id',
    pathParams: z.object({ id: z.coerce.number().int().positive() }),
    body: MobileTripPatchInputSchema,
    responses: { 200: MobileTripSchema, ...writeErrors },
    metadata: requires('trips.write'),
    summary: 'Patch explicit Trip metadata; omission retains and null clears nullable source facts',
  },
  listTrips: {
    method: 'GET',
    path: '/mobile/trips',
    query: MobileTripsQuerySchema,
    responses: {
      200: MobileTripsPageSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Read a snapshot-bound page of original trip metadata',
    metadata: requires('trips.read'),
  },
  getTrip: {
    method: 'GET',
    path: '/mobile/trips/:id',
    pathParams: z.object({ id: z.coerce.number().int().positive() }),
    responses: {
      200: MobileTripDetailSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary:
      'Read one trip with complete ordered visits, journeys, groups, stays, events and document associations',
    metadata: requires('trips.read'),
  },
  getTripV2: {
    method: 'GET',
    path: '/mobile/v2/trips/:id',
    pathParams: z.object({ id: z.coerce.number().int().positive() }),
    responses: {
      200: MobileTripDetailV2Schema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary:
      'Read one day-aware trip with complete ordered sources and independent Journey endpoint precision',
    metadata: requires('trips.read'),
  },
});
