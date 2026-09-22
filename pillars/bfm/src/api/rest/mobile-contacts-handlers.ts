/**
 * Handlers for the `/mobile/contacts/*` routes (ADR-053, POPS-3753).
 *
 * Thin, like every other mobile handler file beside it: decode the request,
 * ask the contacts leg, and turn the one outcome type it returns into a
 * status. Reachable only behind `requireDevice`/`requireCapability`, so this
 * file checks neither.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import { toCollectionUpstreamErrorResponse, toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileContactsClient } from '../contacts/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileContacts'];

export interface MobileContactsHandlerDeps {
  contacts: MobileContactsClient;
}

export function makeMobileContactsHandlers(deps: MobileContactsHandlerDeps) {
  return {
    searchMerchants: async ({ query }: Req['searchMerchants']) => {
      const outcome = await deps.contacts.searchMerchants(query.q, query.limit);
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: { data: [...outcome.value] } };
    },

    getMerchant: async ({ params }: Req['getMerchant']) => {
      const outcome = await deps.contacts.getMerchant(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    createMerchant: async ({ body }: Req['createMerchant']) => {
      const outcome = await deps.contacts.createMerchant(body.name);
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    getMerchantAddresses: async ({ params }: Req['getMerchantAddresses']) => {
      const outcome = await deps.contacts.getMerchantAddresses(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: { data: [...outcome.value] } };
    },

    createMerchantAddress: async ({ params, body }: Req['createMerchantAddress']) => {
      const outcome = await deps.contacts.createMerchantAddress(params.id, body.value);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },
  };
}
