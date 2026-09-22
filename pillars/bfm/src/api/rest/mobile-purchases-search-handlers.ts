/**
 * Handlers for `searchPurchases` and `purchaseTags`.
 *
 * Split from `mobile-purchases-handlers.ts` purely to keep that file under
 * the line-count cap, on the same reasoning `mobile-purchases-draft-handlers.ts`
 * is its own file. Both routes are reachable behind the same `requireDevice` /
 * `requireCapability` stack mounted in `app.ts`.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import { toCollectionUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobilePurchasesClient } from '../purchases/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobilePurchases'];

export function makeMobilePurchasesSearchHandlers(purchases: MobilePurchasesClient) {
  return {
    searchPurchases: async ({ query }: Req['searchPurchases']) => {
      const outcome = await purchases.search({
        q: query.q,
        status: query.status,
        tags: query.tags,
      });

      // The collection variant, matching `listPurchases`: an empty result is
      // "nothing matched", which a genuine 404 from purchases must never be
      // read as, and this route declares no single-resource 404 of its own.
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    purchaseTags: async () => {
      const outcome = await purchases.tagVocabulary();
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },
  };
}
