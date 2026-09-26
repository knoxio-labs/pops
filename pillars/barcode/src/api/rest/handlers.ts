import { initServer } from '@ts-rest/express';

import { barcodeContract } from '../../contract/rest.js';
import { InvalidBarcodeError } from '../../lookup/normalise.js';

import type { BarcodeLookupService } from '../../lookup/service.js';

const server: ReturnType<typeof initServer> = initServer();

/** Build typed handlers for the barcode lookup route. */
export function makeBarcodeRestHandlers(deps: {
  readonly lookupService: BarcodeLookupService;
}): ReturnType<typeof server.router<typeof barcodeContract>> {
  return server.router(barcodeContract, {
    lookup: {
      get: async ({ params }) => {
        try {
          return { status: 200 as const, body: await deps.lookupService.lookup(params.code) };
        } catch (error) {
          if (error instanceof InvalidBarcodeError) {
            return {
              status: 400 as const,
              body: { message: error.message, code: error.code },
            };
          }
          throw error;
        }
      },
    },
  });
}
