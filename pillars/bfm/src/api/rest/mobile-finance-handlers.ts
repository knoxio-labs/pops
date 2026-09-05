/**
 * Handlers for the `/mobile/finance/*` routes.
 *
 * Thin on purpose: decode the request, ask the finance leg, and turn the one
 * outcome type it returns into a status. Everything interesting — the paging,
 * the shape mapping, the failure vocabulary — lives in `api/finance/` and
 * `upstream-error.ts`, so this file has nothing in it that could disagree with
 * them.
 *
 * These routes are reachable only behind `requireDevice` (mounted on the
 * `/mobile` prefix in `app.ts`), so they never check a caller themselves.
 */
import { decodePageCursor } from '../finance/cursor.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { toCollectionUpstreamErrorResponse, toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileFinanceClient } from '../finance/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileFinance'];

/**
 * Rows per page when the app does not ask. Sized for a phone screen and the
 * scroll ahead of it, not for a desktop table — the contract caps the ask at
 * 100 regardless.
 */
const DEFAULT_PAGE_LIMIT = 25;

export interface MobileFinanceHandlerDeps {
  finance: MobileFinanceClient;
}

export function makeMobileFinanceHandlers(deps: MobileFinanceHandlerDeps) {
  return {
    listTransactions: async ({ query }: Req['listTransactions']) => {
      const cursor = query.cursor === undefined ? null : decodePageCursor(query.cursor);
      if (query.cursor !== undefined && cursor === null) {
        return {
          status: 400 as const,
          body: {
            code: 'invalid_cursor' as const,
            message: 'The cursor is not one this server issued. Start the list again.',
          },
        };
      }

      const outcome = await deps.finance.listTransactions({
        limit: query.limit ?? DEFAULT_PAGE_LIMIT,
        cursor,
        accountId: query.accountId ?? null,
      });

      // Not an empty page. An empty page says "you have no transactions",
      // which the user cannot tell from the truth.
      //
      // The collection variant, so a 404 from finance cannot escape as a status
      // this route never declared — see its header.
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    getTransaction: async ({ params }: Req['getTransaction']) => {
      const outcome = await deps.finance.getTransaction(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    listAccounts: async () => {
      const outcome = await deps.finance.listAccounts();
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    getAccount: async ({ params }: Req['getAccount']) => {
      const outcome = await deps.finance.getAccount(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },
  };
}
