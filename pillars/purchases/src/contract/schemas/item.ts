import { z } from 'zod';

import { ITEM_KINDS, ITEM_TAG_PATTERN } from '../constants.js';
import { ProductIdentitySchema } from './product-identity.js';
import {
  CentsSchema,
  IsoTimestampSchema,
  NonBlankTextSchema,
  NonNegativeCentsSchema,
  PopsUriSchema,
  RefSchema,
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

/**
 * One entry in the item tag vocabulary: the tag plus how many lines carry
 * it, so a "browse by tag" chooser can show the count next to the tag
 * instead of just its name (POPS-4544).
 */
export const TagVocabularyEntrySchema = z.object({
  tag: ItemTagSchema,
  count: z.int().nonnegative(),
});

/**
 * A list price bound to the marker that says whether to trust it — the same
 * fusion {@link ItemKindClassificationSchema} applies to a classification,
 * applied here to money instead. `confirmedAt` null means a reading proposed
 * the figure; non-null means a person vouched for it.
 */
export const PurchaseItemListPriceSchema = z.object({
  valueCents: NonNegativeCentsSchema,
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
  /** Null means no source stated one. See {@link PurchaseItemListPriceSchema}. */
  listPrice: PurchaseItemListPriceSchema.nullable(),
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

export const CreateItemUnitBodySchema = z.object({
  /**
   * The serial engraved on the hardware, persisted verbatim and unvalidated.
   * Amazon's DSAR export has no such column: its `Item Serial Number` is
   * mostly a Transparency anti-counterfeit token identifying the packaging,
   * so its adapter sends no units at all rather than promoting a package
   * code into a field that means something else. See
   * `pillars/purchases/src/ingest/amazon/README.md`.
   */
  serialNumber: z.string().nullable().optional(),
  inventoryItemUri: PopsUriSchema.nullable().optional(),
});

export const CreateItemBodySchema = z.object({
  ref: RefSchema.optional(),
  shipmentRef: RefSchema.nullable().optional(),
  name: z.string().trim().min(1),
  /**
   * The identifier the source stated, and the namespace it stated it in.
   * Both or neither — an adapter that cannot say which namespace an
   * identifier belongs to has not read one, and a bare string here is what
   * let a single column mean a different thing per adapter.
   *
   * Omit it for every source that states none, which today is every one but
   * the Amazon export.
   */
  sku: ProductIdentitySchema.nullable().optional(),
  url: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  quantity: z.int().min(1).optional(),
  unitPriceCents: CentsSchema,
  lineTotalCents: CentsSchema,
  allocatedShippingCents: NonNegativeCentsSchema.optional(),
  allocatedAdjustmentCents: CentsSchema.optional(),
  /** What the line would have cost at list. Never itself the assertion signal — see below. */
  listPriceCents: NonNegativeCentsSchema.nullable().optional(),
  /** True means a human vouched for {@link listPriceCents}; unlike `kind`, presence alone does not. */
  listPriceAsserted: z.boolean().optional(),
  merchantCategory: z.string().nullable().optional(),
  merchantCondition: z.string().nullable().optional(),
  promotionalPrice: z.boolean().nullable().optional(),
  gstApplicable: z.boolean().nullable().optional(),
  /**
   * Only where the source states it outright — never inferred. A kind
   * supplied here lands *asserted*, because a transcription of what a
   * merchant said is not a guess a later pass should reconsider.
   */
  kind: ItemKindSchema.nullable().optional(),
  /**
   * POPS item tags. No shipped source states one, so an adapter supplying
   * these is asserting a classification of its own — which is the bug this
   * table was carrying. Like {@link CreateItemBodySchema.shape.kind} these
   * land asserted, and a guard test holds the adapters to writing none.
   */
  tags: z.array(ItemTagSchema).optional(),
  /**
   * Verbatim merchant prose, in printed order. Duplicates are kept.
   *
   * Not `.trim()`: leading and trailing whitespace is part of the printed
   * text, and a schema that quietly rewrote it would make the word
   * `verbatim` above false — the column exists so a reviewer can check a
   * reading against the paper. Blank is rejected rather than trimmed away.
   */
  notes: z.array(NonBlankTextSchema).optional(),
  units: z.array(CreateItemUnitBodySchema).optional(),
});

/**
 * The confirmation body for one line.
 *
 * Both fields are optional and both are meaningful when explicitly null:
 * `kind: null` retracts a wrong confirmation to unclassified rather than to
 * a different wrong answer, and an empty `tags` array clears the line's
 * tags. Omitting a field leaves it alone, so confirming a kind does not
 * silently drop tags a proposal pass put there.
 */
export const PatchItemBodySchema = z.object({
  kind: ItemKindSchema.nullable().optional(),
  /** Replaces the line's tags outright — what is not listed is rejected. */
  tags: z.array(ItemTagSchema).optional(),
});
