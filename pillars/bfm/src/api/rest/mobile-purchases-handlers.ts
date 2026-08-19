/**
 * Handlers for the `/mobile/purchases/*` routes.
 *
 * Thin, like the finance handlers beside them: hand the body to the purchases
 * leg and turn the one outcome type it returns into a status. The three
 * receipt outcomes are NOT statuses — each one is purchases having read the
 * upload and answered about it, so all three are a `200` carrying a `kind` the
 * app switches on. Only a failure to get an answer at all becomes a non-200.
 *
 * Reachable only behind `requireDevice` and the mobile body-size cap, both
 * mounted on the `/mobile` prefix in `app.ts`, so this file checks neither.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import { toCollectionUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobilePurchasesClient } from '../purchases/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobilePurchases'];

export interface MobilePurchasesHandlerDeps {
  purchases: MobilePurchasesClient;
}

export function makeMobilePurchasesHandlers(deps: MobilePurchasesHandlerDeps) {
  return {
    uploadReceipt: async ({ body }: Req['uploadReceipt']) => {
      const outcome = await deps.purchases.uploadReceipt(body.parts, {
        capturedAt: body.capturedAt,
        timeZone: body.timeZone,
      });

      // The collection variant: this route declares no 404, and a 404 from
      // purchases means bfm asked for a path that pillar does not serve — a
      // contract fault, not a fact about the upload.
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },
  };
}
