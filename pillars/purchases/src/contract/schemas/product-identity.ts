/**
 * What the merchant called the product, and the namespace it said it in.
 *
 * One object rather than two sibling fields, for the reason
 * `ItemKindClassificationSchema` gives: a consumer cannot reach the
 * identifier without the qualifier, so joining an ASIN to a store's own
 * article number that happens to be the same string is not a mistake this
 * shape lets anyone make quietly.
 *
 * The namespace is checked against the identifier rather than taken on
 * trust: `asin` is what makes two lines from different sources one product,
 * so a value that cannot be an ASIN may not claim to be one. The write path
 * applies the same rule to adapters running in-process, which the wire
 * schema never sees.
 */
import { z } from 'zod';

import { isWellFormedSku, SKU_SCHEMES } from '../constants.js';

export const SkuSchemeSchema = z.enum(SKU_SCHEMES);

export const ProductIdentitySchema = z
  .object({
    /** As the merchant states it, verbatim. */
    value: z.string().min(1),
    scheme: SkuSchemeSchema,
  })
  .refine((identity) => isWellFormedSku(identity.scheme, identity.value), {
    message: 'the identifier does not belong to the namespace it claims',
    path: ['value'],
  });
