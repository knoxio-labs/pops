import { z } from 'zod';

import { ErrorBodySchema as SharedErrorBodySchema } from '@pops/types';

import { ProductSchema } from '../lookup/product.js';

/** Error body returned for invalid lookup requests. */
export const ErrorBodySchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});

/** Discriminated union returned for every valid barcode lookup. */
export const LookupOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('found'), product: ProductSchema }),
  z.object({ outcome: z.literal('not_found'), reason: z.literal('unsupported').optional() }),
  z.object({ outcome: z.literal('unavailable'), error: SharedErrorBodySchema.optional() }),
]);

/** Inferred response type for `GET /lookup/:code`. */
export type LookupOutcome = z.infer<typeof LookupOutcomeSchema>;
