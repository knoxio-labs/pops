import { z } from 'zod';

import { MobileInventoryItemSchema } from './mobile-inventory-schemas.js';
import { MobilePageLimit } from './rest-mobile-responses.js';

const PlacementKind = z.enum(['location', 'container', 'hand']);
const Lifecycle = z.enum(['active', 'retired', 'discarded', 'lost', 'destroyed']);
const Sort = z.enum(['name', 'updated', 'type', 'where', 'packing']);
const StrictQueryBool = z.enum(['true', 'false']);
const QueryBool = z.preprocess((value) => value === true || value === 'true', z.boolean());
const IdList = z
  .string()
  .regex(/^[^,\s]+(,[^,\s]+)*$/u, 'a comma-separated list of item ids')
  .refine((value) => value.split(',').length <= 200, 'at most 200 ids');

/** Filters and ordering for one bounded page of the live mobile item catalogue. */
export const MobileInventoryItemsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: MobilePageLimit.default(50),
    typeKey: z.string().optional(),
    placementKind: PlacementKind.optional(),
    locationId: z.string().optional(),
    containingItemId: z.string().optional(),
    ids: IdList.optional(),
    includeInactive: QueryBool.optional(),
    q: z.string().trim().min(1).max(200).optional(),
    untyped: StrictQueryBool.optional(),
    isContainer: StrictQueryBool.optional(),
    access: z.enum(['open', 'closed']).optional(),
    isFull: StrictQueryBool.optional(),
    lifecycle: Lifecycle.optional(),
    legacyLabelOf: z.string().min(1).optional(),
    within: z.string().min(1).optional(),
    effectiveLocationId: z.string().min(1).optional(),
    sort: Sort.optional(),
  })
  .superRefine((query, context) => {
    if (query.typeKey !== undefined && query.untyped === 'true') {
      context.addIssue({
        code: 'custom',
        message: 'typeKey cannot be combined with untyped=true',
        path: ['untyped'],
      });
    }
    if (query.typeKey !== undefined && query.legacyLabelOf !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'typeKey cannot be combined with legacyLabelOf',
        path: ['legacyLabelOf'],
      });
    }
  });

/** A page returned by the inventory web item query, in BFM's mobile wire shape. */
export const MobileInventoryItemsPageSchema = z.object({
  items: z.array(MobileInventoryItemSchema),
  contentCounts: z.record(
    z.string(),
    z.object({ direct: z.number().int().nonnegative(), deep: z.number().int().nonnegative() })
  ),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
  unfilteredTotal: z.number().int().nonnegative(),
  hiddenInactiveCount: z.number().int().nonnegative(),
});

/** The parsed filters BFM forwards to the inventory web items endpoint. */
export type MobileInventoryItemsQuery = z.output<typeof MobileInventoryItemsQuerySchema>;

/** The page of inventory items returned by the mobile list endpoint. */
export type MobileInventoryItemsPage = z.infer<typeof MobileInventoryItemsPageSchema>;
