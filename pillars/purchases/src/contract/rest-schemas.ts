/**
 * Shared zod building blocks for the purchases REST contract.
 *
 * The create body mirrors the order's own shape: one order, then flat lists
 * of deliveries, lines, charges and documents. Relationships between those
 * lists are expressed with adapter-local `ref` strings, because an adapter
 * cannot know the ids of rows it has not inserted yet. Refs are resolved
 * server-side and never persisted.
 */
import { z } from 'zod';

import {
  AutoLinkPolicySchema,
  CentsSchema,
  ChargeOriginSchema,
  CurrencySchema,
  DocumentKindSchema,
  IngestMethodSchema,
  IsoTimestampSchema,
  ItemKindSchema,
  ItemTagSchema,
  NonNegativeCentsSchema,
  PopsUriSchema,
  PurchaseStatusSchema,
  PurchaseTagSchema,
  SettlementModeSchema,
  SettlementRoleSchema,
  ShipmentStatusSchema,
} from './schemas/purchase.js';

export const ErrorBodySchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});

export const OkSchema = z.object({ ok: z.literal(true) });

/**
 * A boolean query parameter.
 *
 * NOT `z.coerce.boolean()`, which uses JavaScript truthiness: every
 * non-empty string coerces to `true`, so `?flag=false` would arrive as
 * `true` and there would be no way to switch a defaulted-on flag off.
 * Only the literal `'true'` (or a real `true`) counts. Mirrors `QueryBool`
 * in `pillars/food/src/contract/rest-schemas.ts`.
 */
export const QueryBoolSchema = z.preprocess((v) => v === true || v === 'true', z.boolean());

/**
 * Adapter-local wiring handle, unique within one create call and never
 * persisted. It exists only so a line or charge can point at a delivery
 * the payload has not been given ids for yet.
 */
const RefSchema = z.string().trim().min(1);

/**
 * A string that must carry at least one non-whitespace character and is
 * handed on exactly as it arrived.
 *
 * The distinction from `z.string().trim().min(1)` is that `.trim()` is a
 * transform, so the value the handler writes is not the value the caller
 * sent. That is fine for a wiring handle and wrong for anything documented
 * as verbatim.
 */
const NonBlankTextSchema = z
  .string()
  .regex(/\S/u, 'expected at least one non-whitespace character');

export const CreateShipmentBodySchema = z.object({
  ref: RefSchema,
  /**
   * The merchant's own identifier for this delivery, which IS persisted.
   * Distinct from `ref`: that is local plumbing, this is a fact about the
   * order. Null when the source has none — Amazon's DSAR export does not,
   * so its adapter leaves this unset rather than promoting its wiring
   * handle into a field that means something else.
   */
  sourceShipmentRef: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
  trackingNumber: z.string().nullable().optional(),
  shippedAt: IsoTimestampSchema.nullable().optional(),
  deliveredAt: IsoTimestampSchema.nullable().optional(),
  status: ShipmentStatusSchema.optional(),
  shippingCents: NonNegativeCentsSchema.optional(),
});

export const CreateItemUnitBodySchema = z.object({
  serialNumber: z.string().nullable().optional(),
  inventoryItemUri: PopsUriSchema.nullable().optional(),
});

export const CreateItemBodySchema = z.object({
  ref: RefSchema.optional(),
  shipmentRef: RefSchema.nullable().optional(),
  name: z.string().trim().min(1),
  sku: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  quantity: z.int().min(1).optional(),
  unitPriceCents: CentsSchema,
  lineTotalCents: CentsSchema,
  allocatedShippingCents: NonNegativeCentsSchema.optional(),
  allocatedAdjustmentCents: CentsSchema.optional(),
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

export const CreateChargeAllocationBodySchema = z.object({
  itemRef: RefSchema,
  amountCents: CentsSchema,
});

export const CreateChargeBodySchema = z.object({
  sourceChargeRef: z.string().nullable().optional(),
  shipmentRef: RefSchema.nullable().optional(),
  amountCents: CentsSchema,
  /** Settlement currency. Defaults to the order's currency. */
  currency: CurrencySchema.optional(),
  /** Value in the order's currency. Defaults to `amountCents` when currencies match. */
  orderAmountCents: CentsSchema.optional(),
  chargedAt: IsoTimestampSchema.nullable().optional(),
  role: SettlementRoleSchema.optional(),
  paymentHint: z.string().nullable().optional(),
  origin: ChargeOriginSchema.optional(),
  allocations: z.array(CreateChargeAllocationBodySchema).optional(),
});

export const CreateDocumentBodySchema = z.object({
  documentUri: PopsUriSchema,
  shipmentRef: RefSchema.nullable().optional(),
  kind: DocumentKindSchema.optional(),
});

export const CreatePurchaseBodySchema = z.object({
  source: z.string().trim().min(1),
  sourceOrderId: z.string().nullable().optional(),
  ingestMethod: IngestMethodSchema,
  orderedAt: IsoTimestampSchema,
  currency: CurrencySchema,
  subtotalCents: NonNegativeCentsSchema.optional(),
  shippingCents: NonNegativeCentsSchema.optional(),
  taxCents: NonNegativeCentsSchema.optional(),
  surchargeCents: NonNegativeCentsSchema.optional(),
  discountCents: NonNegativeCentsSchema.optional(),
  totalCents: CentsSchema,
  merchantEntityId: z.string().nullable().optional(),
  merchantEntityName: z.string().nullable().optional(),
  settlementMode: SettlementModeSchema.optional(),
  paymentHint: z.string().nullable().optional(),
  rawRef: z.string().nullable().optional(),
  /**
   * Ingest-level dedup key. Required, not derived server-side: only the
   * adapter knows which fields of its source identify an order, and
   * re-uploading the same bundle must be a no-op.
   */
  checksum: z.string().trim().min(1),
  /**
   * Facts about how the order itself was read — `date-uncertain` when the
   * source stated no date, `promotion-offset` when a promotion cancelled
   * the price to zero. Without them an inferred figure is indistinguishable
   * from one the source stated, which is the difference a reviewer needs.
   */
  tags: z.array(PurchaseTagSchema).optional(),
  shipments: z.array(CreateShipmentBodySchema).optional(),
  items: z.array(CreateItemBodySchema).optional(),
  charges: z.array(CreateChargeBodySchema).optional(),
  documents: z.array(CreateDocumentBodySchema).optional(),
});

export const UpsertPurchaseSourceBodySchema = z.object({
  label: z.string().trim().min(1),
  descriptorPattern: z.string().nullable().optional(),
  settlementWindowDays: z.int().min(1).optional(),
  autoLinkPolicy: AutoLinkPolicySchema.optional(),
  ingestAdapter: z.string().nullable().optional(),
});

/**
 * Query filters for the order index. `sources` and `statuses` accept a
 * repeated query parameter; a single value is lifted into an array so
 * `?statuses=linked` and `?statuses=linked&statuses=partial` both work.
 */
export const ListPurchasesQuerySchema = z.object({
  sources: z
    .preprocess((v) => (v === undefined || Array.isArray(v) ? v : [v]), z.array(z.string()))
    .optional(),
  statuses: z
    .preprocess(
      (v) => (v === undefined || Array.isArray(v) ? v : [v]),
      z.array(PurchaseStatusSchema)
    )
    .optional(),
  from: IsoTimestampSchema.optional(),
  to: IsoTimestampSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const ListItemsByTagQuerySchema = z.object({
  tag: ItemTagSchema,
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
