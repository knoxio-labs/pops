import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MobileTripDetailSchema,
  MobileTripsPageSchema,
  MobileTripsQuerySchema,
} from './mobile-trips-detail-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import { MobileUpstreamErrorSchema } from './rest-schemas.js';

const c = initContract();
/** Native read-only Trips surface, preserving the published producer's source facts and ordering. */
export const mobileTripsContract = c.router({
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
});
