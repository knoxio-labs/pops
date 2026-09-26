/** Handlers for the mobile barcode lookup route. */
import { isGatewayOk } from '../pillars/gateway.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileBarcodeClient } from '../barcode/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileBarcode'];

/** Dependencies for the mobile barcode handler. */
export interface MobileBarcodeHandlerDeps {
  barcode: MobileBarcodeClient;
}

/** Build handlers for bfm's mobile barcode relay. */
export function makeMobileBarcodeHandlers(deps: MobileBarcodeHandlerDeps) {
  return {
    lookup: async ({ params }: Req['lookup']) => {
      const outcome = await deps.barcode.lookup(params.code);
      if (!isGatewayOk(outcome)) {
        return { status: 200 as const, body: { outcome: 'unavailable' as const } };
      }

      return { status: 200 as const, body: outcome.value };
    },
  };
}
