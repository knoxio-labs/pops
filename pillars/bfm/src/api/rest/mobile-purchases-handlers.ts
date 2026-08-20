/**
 * Handlers for the `/mobile/purchases/*` routes.
 *
 * Thin, like the finance handlers beside them: decode the request, ask the
 * purchases leg, and turn the one outcome type it returns into a status. The
 * three receipt outcomes are NOT statuses — each one is purchases having read the
 * upload and answered about it, so all three are a `200` carrying a `kind` the
 * app switches on. Only a failure to get an answer at all becomes a non-200.
 *
 * Reachable only behind `requireDevice`, `requireCapability` and the mobile
 * body-size cap, all mounted on the `/mobile` prefix in `app.ts`, so this file
 * checks none of them. The two reads and the write declare different
 * capabilities (ADR-048) — a device may hold either without the other.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import { decodePurchasesCursor } from '../purchases/list-cursor.js';
import { toCollectionUpstreamErrorResponse, toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobilePurchasesClient } from '../purchases/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobilePurchases'];

export interface MobilePurchasesHandlerDeps {
  purchases: MobilePurchasesClient;
}

/**
 * Rows per page when the app does not ask. The same number the finance list
 * uses and for the same reason — a phone screen and the scroll ahead of it —
 * and the contract caps the ask at 100 regardless.
 */
const DEFAULT_PAGE_LIMIT = 25;

export function makeMobilePurchasesHandlers(deps: MobilePurchasesHandlerDeps) {
  return {
    listPurchases: async ({ query }: Req['listPurchases']) => {
      const cursor = query.cursor === undefined ? null : decodePurchasesCursor(query.cursor);
      if (query.cursor !== undefined && cursor === null) {
        return {
          status: 400 as const,
          body: {
            code: 'invalid_cursor' as const,
            message: 'The cursor is not one this server issued. Start the list again.',
          },
        };
      }

      const outcome = await deps.purchases.listPurchases({
        limit: query.limit ?? DEFAULT_PAGE_LIMIT,
        cursor,
      });

      // Not an empty page. An empty page says "you have bought nothing",
      // which the user cannot tell from the truth. The collection variant, so
      // a 404 from purchases cannot escape as a status this route never
      // declared.
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    getPurchase: async ({ params }: Req['getPurchase']) => {
      const outcome = await deps.purchases.getPurchase(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    uploadReceipt: async ({ body }: Req['uploadReceipt']) => {
      const outcome = await deps.purchases.uploadReceipt(body.parts, body.capture);

      // The collection variant: this route declares no 404, and a 404 from
      // purchases means bfm asked for a path that pillar does not serve — a
      // contract fault, not a fact about the upload.
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },
  };
}
