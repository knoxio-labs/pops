/**
 * Handlers for `searchPurchases` and `purchaseTags`.
 *
 * Split from `mobile-purchases-handlers.ts` purely to keep that file under
 * the line-count cap, on the same reasoning `mobile-purchases-draft-handlers.ts`
 * is its own file. Both routes are reachable behind the same `requireDevice` /
 * `requireCapability` stack mounted in `app.ts`.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import { invalidMobileCursorResponse } from './mobile-request-error.js';
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
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit,
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.tags === undefined ? {} : { tags: query.tags }),
      });

      // The collection variant, matching `listPurchases`: an empty result is
      // "nothing matched", which a genuine 404 from purchases must never be
      // read as, and this route declares no single-resource 404 of its own.
      if (!isGatewayOk(outcome)) {
        if (query.cursor !== undefined && outcome.kind === 'invalid-request') {
          return invalidMobileCursorResponse(
            'The cursor is not valid for this query. Start the list again.'
          );
        }
        return toCollectionUpstreamErrorResponse(outcome);
      }

      return { status: 200 as const, body: outcome.value };
    },

    purchaseTags: async ({ query }: Req['purchaseTags']) => {
      const outcome = await purchases.tagVocabulary({
        ...(query.search === undefined || query.search === '' ? {} : { search: query.search }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit,
      });
      if (!isGatewayOk(outcome)) {
        if (query.cursor !== undefined && outcome.kind === 'invalid-request') {
          return invalidMobileCursorResponse(
            'The cursor is not valid for this query. Start the list again.'
          );
        }
        return toCollectionUpstreamErrorResponse(outcome);
      }

      return { status: 200 as const, body: outcome.value };
    },
  };
}
