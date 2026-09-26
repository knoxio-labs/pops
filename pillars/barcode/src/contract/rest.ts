import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema, LookupOutcomeSchema } from './rest-schemas.js';

const c = initContract();

const barcodeLookupContract = c.router({
  get: {
    method: 'GET',
    path: '/lookup/:code',
    pathParams: z.object({ code: z.string() }),
    responses: {
      200: LookupOutcomeSchema,
      400: ErrorBodySchema,
    },
    summary: 'Look up a normalised ISBN product',
  },
});

/** The ts-rest contract for the barcode pillar. */
export const barcodeContract = c.router(
  {
    lookup: barcodeLookupContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

/** Type-level view of the barcode REST contract. */
export type BarcodeContract = typeof barcodeContract;
