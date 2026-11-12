import { isGatewayOk } from '../pillars/gateway.js';
import { toTripWriteErrorResponse } from './mobile-trip-write-errors.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileCaptureClient } from '../trips/capture.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileTripCaptures'];
/** Authenticated federation dependency; operation state remains producer-owned. */
export interface MobileCaptureHandlerDeps {
  captures: MobileCaptureClient;
}
/** Relays producer receipts and conflicts without retrying or replacing operation identities. */
export function makeMobileCaptureHandlers(deps: MobileCaptureHandlerDeps) {
  return {
    workspace: async ({ params }: Req['workspace']) => {
      const outcome = await deps.captures.workspace(params.tripId);
      return isGatewayOk(outcome)
        ? { status: 200 as const, body: outcome.value }
        : toTripWriteErrorResponse(outcome);
    },
    create: async ({ params, body }: Req['create']) => {
      const outcome = await deps.captures.create(params.tripId, body);
      return isGatewayOk(outcome)
        ? { status: 200 as const, body: outcome.value }
        : toTripWriteErrorResponse(outcome);
    },
    update: async ({ params, body }: Req['update']) => {
      const outcome = await deps.captures.update(params.tripId, body);
      return isGatewayOk(outcome)
        ? { status: 200 as const, body: outcome.value }
        : toTripWriteErrorResponse(outcome);
    },
    attach: async ({ params, body }: Req['attach']) => {
      const outcome = await deps.captures.attach(params.tripId, body);
      return isGatewayOk(outcome)
        ? { status: 200 as const, body: outcome.value }
        : toTripWriteErrorResponse(outcome);
    },
    undo: async ({ params, body }: Req['undo']) => {
      const outcome = await deps.captures.undo(params.tripId, body);
      return isGatewayOk(outcome)
        ? { status: 200 as const, body: outcome.value }
        : toTripWriteErrorResponse(outcome);
    },
  };
}
