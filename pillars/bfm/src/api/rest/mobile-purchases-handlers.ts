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
import { makeMobilePurchasesDraftHandlers } from './mobile-purchases-draft-handlers.js';
import { makeMobilePurchasesSearchHandlers } from './mobile-purchases-search-handlers.js';
import {
  toCollectionUpstreamErrorResponse,
  toReceiptBytesErrorResponse,
  toUpstreamErrorResponse,
} from './upstream-error.js';

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

/** bfm's own definition of "unsettled" for the mobile surface. */
const UNSETTLED_STATUSES = ['awaiting_settlement', 'partial'] as const;

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

      const statuses = query.status === 'unsettled' ? UNSETTLED_STATUSES : undefined;
      const outcome = await deps.purchases.listPurchases({
        limit: query.limit ?? DEFAULT_PAGE_LIMIT,
        cursor,
        statuses,
      });

      // Not an empty page. An empty page says "you have bought nothing",
      // which the user cannot tell from the truth. The collection variant, so
      // a 404 from purchases cannot escape as a status this route never
      // declared.
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    getMonthSummary: async ({ query }: Req['getMonthSummary']) => {
      const outcome = await deps.purchases.getMonthSummary(query.month);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    // `searchPurchases` and `purchaseTags` MUST be spread here, ahead of
    // `getPurchase` below — `createExpressEndpoints` (`@ts-rest/express`)
    // registers routes in the returned HANDLERS object's OWN key order via
    // `for...in`, not the contract's declaration order, so a route object
    // ordered right and a handlers object ordered wrong still lets `:id`
    // swallow `/search` and `/tags` as an id. See `rest.ts`'s matching
    // comment on the contract side of this same trap.
    ...makeMobilePurchasesSearchHandlers(deps.purchases),

    getPurchase: async ({ params }: Req['getPurchase']) => {
      const outcome = await deps.purchases.getPurchase(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    ...makeMobilePurchasesDraftHandlers(deps.purchases),

    getReceipt: async ({ params }: Req['getReceipt']) => {
      const outcome = await deps.purchases.getReceipt(params.sha256);
      // The single-resource mapper: a 404 here is a fact about the user's own
      // data — a receipt whose file is not on the volume — and this route
      // declares it. Not the bytes mapper: this route asked for the receipt as
      // it is stored rather than for a rendering of it, so there is no form
      // for the producer to refuse and a 415 would be a contract fault.
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    getReceiptThumbnail: async ({ params }: Req['getReceiptThumbnail']) => {
      const outcome = await deps.purchases.getReceiptThumbnail(params.sha256);
      // The one route that asked for a representation, and so the one that
      // can be told the record cannot be given in it.
      if (!isGatewayOk(outcome)) return toReceiptBytesErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },
  };
}
