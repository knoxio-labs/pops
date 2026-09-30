import { z } from 'zod';

import { IsoTimestampSchema, PurchaseItemSchema } from './schemas/purchase.js';

/** Search and page inputs for the item-tag vocabulary. */
export const TagVocabularyQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** Parsed filters and page controls for the item-tag vocabulary. */
export type TagVocabularyQuery = z.infer<typeof TagVocabularyQuerySchema>;

/**
 * A line that carries the requested tag, with the tag's own confirmation
 * marker beside it.
 *
 * The marker travels because the item alone cannot carry it — the tag is on
 * the join row, not the line — and a list of lines "tagged `snack`" that
 * silently mixes proposals with decisions is exactly the counterfactual a
 * consumer must not compute.
 */
export const TaggedItemSchema = z.object({
  item: PurchaseItemSchema,
  confirmedAt: IsoTimestampSchema.nullable(),
});
