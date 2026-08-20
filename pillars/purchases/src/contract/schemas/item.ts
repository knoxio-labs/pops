import { z } from 'zod';

import { ITEM_KINDS, ITEM_TAG_PATTERN } from '../constants.js';
import { ProductIdentitySchema } from './product-identity.js';
import {
  CentsSchema,
  IsoTimestampSchema,
  NonNegativeCentsSchema,
  PopsUriSchema,
} from './scalars.js';

export const ItemKindSchema = z.enum(ITEM_KINDS);

/**
 * An item tag: purchases' own product-grained vocabulary.
 *
 * Lower-case slugs, rejected rather than normalised when they are not.
 * Rejecting is what keeps `Fruit` and `fruit` from becoming two tags — the
 * drift finance's Title Case `tag_vocabulary` already has — and it tells
 * the caller, where a silent `.toLowerCase()` would not.
 */
export const ItemTagSchema = z
  .string()
  .regex(ITEM_TAG_PATTERN, 'expected a lower-case slug, e.g. fruit or single-origin');

/**
 * A classification bound to the marker that says whether to trust it.
 *
 * The whole point of the object is that a consumer cannot obtain
 * {@link value} without {@link confirmedAt}. Two sibling fields would leave
 * "read the pair" a convention, and this repo has already been bitten by
 * one of those — finance's `entity_id`/`entity_name`.
 */
export const ItemKindClassificationSchema = z.object({
  value: ItemKindSchema,
  /** Null while this is a machine proposal; set once it is asserted. */
  confirmedAt: IsoTimestampSchema.nullable(),
});

export const PurchaseItemTagSchema = z.object({
  tag: ItemTagSchema,
  confirmedAt: IsoTimestampSchema.nullable(),
});

export const PurchaseItemSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  shipmentId: z.string().nullable(),
  position: z.int().min(0),
  name: z.string(),
  /** Null when the source states no identifier — every shipped adapter but the Amazon exports. */
  sku: ProductIdentitySchema.nullable(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  quantity: z.int().min(1),
  unitPriceCents: CentsSchema,
  lineTotalCents: CentsSchema,
  refundedCents: NonNegativeCentsSchema,
  allocatedShippingCents: NonNegativeCentsSchema,
  allocatedAdjustmentCents: CentsSchema,
  merchantCategory: z.string().nullable(),
  merchantCondition: z.string().nullable(),
  promotionalPrice: z.boolean().nullable(),
  gstApplicable: z.boolean().nullable(),
  /** Null means unclassified. See {@link ItemKindClassificationSchema}. */
  kind: ItemKindClassificationSchema.nullable(),
  createdAt: IsoTimestampSchema,
});

export const PurchaseItemUnitSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  serialNumber: z.string().nullable(),
  inventoryItemUri: PopsUriSchema.nullable(),
  inventoryItemStaleAt: IsoTimestampSchema.nullable(),
  /**
   * Set when this unit was offered to inventory and turned down. Mutually
   * exclusive with {@link inventoryItemUri}: a unit is undecided, in
   * inventory, or declined, and only an undecided one is ever proposed
   * again.
   */
  inventoryDeclinedAt: IsoTimestampSchema.nullable(),
  createdAt: IsoTimestampSchema,
});
