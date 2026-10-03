/** Handlers for the mobile Ego conversation list and read routes. */
import { isGatewayOk } from '../pillars/gateway.js';
import {
  toCollectionUpstreamErrorResponse,
  toEgoDecisionErrorResponse,
  toUpstreamErrorResponse,
} from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileEgoClient } from '../ego/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileEgo'];

/** Dependencies for the mobile Ego read handlers. */
export interface MobileEgoHandlerDeps {
  ego: MobileEgoClient;
}

/** Build handlers for bfm's mobile Ego conversation routes. */
export function makeMobileEgoHandlers(deps: MobileEgoHandlerDeps) {
  return {
    listConversations: async ({ query }: Req['listConversations']) => {
      const outcome = await deps.ego.listConversations({
        ...(query.limit === undefined ? {} : { limit: query.limit }),
        ...(query.offset === undefined ? {} : { offset: query.offset }),
        ...(query.q === undefined ? {} : { search: query.q }),
      });
      if (!isGatewayOk(outcome)) {
        const error = toCollectionUpstreamErrorResponse(outcome);
        return { status: error.status, body: error.body };
      }
      return { status: 200 as const, body: outcome.value };
    },
    getConversation: async ({ params }: Req['getConversation']) => {
      const outcome = await deps.ego.getConversation(params.id);
      if (!isGatewayOk(outcome)) {
        const error = toUpstreamErrorResponse(outcome);
        return { status: error.status, body: error.body };
      }
      return { status: 200 as const, body: outcome.value };
    },
    decideActionBatch: async ({ params, body }: Req['decideActionBatch']) => {
      const outcome = await deps.ego.decideBatch(params.batchId, body);
      if (!isGatewayOk(outcome)) {
        const error = toEgoDecisionErrorResponse(outcome);
        return { status: error.status, body: error.body };
      }
      return { status: 200 as const, body: outcome.value };
    },
  };
}
