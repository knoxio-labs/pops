/**
 * Handlers for `extractReceipt`, `saveReceiptDraft` and `createManualPurchase`
 * — separating a receipt's extraction from its persistence, and a purchase
 * typed by hand (POPS-2454).
 *
 * Split from `mobile-purchases-handlers.ts` purely to keep that file under
 * the line-count cap; all three are reachable behind the same
 * `requireDevice` / `requireCapability` / body-size-cap stack mounted in
 * `app.ts`.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import { toCollectionUpstreamErrorResponse, toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobilePurchasesClient } from '../purchases/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobilePurchases'];

export function makeMobilePurchasesDraftHandlers(purchases: MobilePurchasesClient) {
  return {
    extractReceipt: async ({ body }: Req['extractReceipt']) => {
      const outcome = await purchases.extractReceipt(body.parts, body.capture);

      // The collection variant, matching the retired `uploadReceipt`: this
      // route declares no 404, and a 404 from purchases means bfm asked for
      // a path that pillar does not serve — a contract fault, not a fact
      // about the receipt.
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    saveReceiptDraft: async ({ body }: Req['saveReceiptDraft']) => {
      const outcome = await purchases.saveReceiptDraft(body);
      // A duplicate idempotency key or an already-saved receipt answers
      // `502 upstream_conflict` here, the same code every route on this
      // surface uses for a producer refusal — see `upstream-error.ts`. The
      // app tells it apart from every other 502 by that code, not by status.
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    createManualPurchase: async ({ body }: Req['createManualPurchase']) => {
      const outcome = await purchases.createManualPurchase(body);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },
  };
}
