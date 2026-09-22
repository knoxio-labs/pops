/**
 * Handlers for the `/mobile/contacts/*` routes (ADR-053).
 *
 * Thin, like every other mobile handler file beside it: decode the request,
 * ask the contacts leg, and turn the one outcome type it returns into a
 * status. Reachable only behind `requireDevice`/`requireCapability`, so this
 * file checks neither.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import { toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileContactsClient } from '../contacts/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileContacts'];

export interface MobileContactsHandlerDeps {
  contacts: MobileContactsClient;
}

export function makeMobileContactsHandlers(deps: MobileContactsHandlerDeps) {
  return {
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
