import { isGatewayOk } from '../pillars/gateway.js';
import { decodeTripsCursor, tripsPage } from '../trips/cursor.js';
import { legacyTripDetail } from '../trips/legacy-detail.js';
import { invalidMobileCursorResponse } from './mobile-request-error.js';
import { toCollectionUpstreamErrorResponse, toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileTripsClient } from '../trips/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileTrips'];
/** Injectable source reader behind the device and explicit read-capability perimeter. */
export interface MobileTripsHandlerDeps {
  trips: MobileTripsClient;
}
/** Native collection paging and complete source reads, without mutation or inferred relations. */
export function makeMobileTripsHandlers(deps: MobileTripsHandlerDeps) {
  return {
    listTrips: async ({ query }: Req['listTrips']) => {
      const cursor = query.cursor === undefined ? null : decodeTripsCursor(query.cursor);
      if (query.cursor !== undefined && cursor === null) {
        return invalidMobileCursorResponse('The cursor is invalid. Start the trip list again.');
      }
      const outcome = await deps.trips.listTrips();
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);
      const page = tripsPage(outcome.value, query.limit, cursor);
      if (page === null)
        return invalidMobileCursorResponse('The trip list changed. Start the list again.');
      return { status: 200 as const, body: page };
    },
    getTrip: async ({ params }: Req['getTrip']) => {
      const outcome = await deps.trips.getTrip(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);
      return { status: 200 as const, body: legacyTripDetail(outcome.value) };
    },
    getTripV2: async ({ params }: Req['getTripV2']) => {
      const outcome = await deps.trips.getTrip(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },
  };
}
