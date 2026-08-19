/**
 * What the merchant called the product, and the namespace it said it in.
 *
 * One object rather than two sibling fields, for the reason
 * `ItemKindClassificationSchema` gives: a consumer cannot reach the
 * identifier without the qualifier, so joining an ASIN to a store's own
 * article number that happens to be the same string is not a mistake this
 * shape lets anyone make quietly.
 */
import { z } from 'zod';

import { SKU_SCHEMES } from '../constants.js';

export const SkuSchemeSchema = z.enum(SKU_SCHEMES);

export const ProductIdentitySchema = z.object({
  /** As the merchant states it, verbatim. */
  value: z.string().min(1),
  scheme: SkuSchemeSchema,
});
