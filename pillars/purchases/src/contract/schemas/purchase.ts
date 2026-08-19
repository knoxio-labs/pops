import { z } from 'zod';

import {
  AUTO_LINK_POLICIES,
  CHARGE_ORIGINS,
  DOCUMENT_KINDS,
  INGEST_METHODS,
  ITEM_KINDS,
  ITEM_TAG_PATTERN,
  LINK_TYPES,
  PURCHASE_STATUSES,
  SETTLEMENT_MODES,
  SETTLEMENT_ROLES,
  SHIPMENT_STATUSES,
} from '../constants.js';

export const IngestMethodSchema = z.enum(INGEST_METHODS);
export const SettlementModeSchema = z.enum(SETTLEMENT_MODES);
export const PurchaseStatusSchema = z.enum(PURCHASE_STATUSES);
export const ShipmentStatusSchema = z.enum(SHIPMENT_STATUSES);
export const ItemKindSchema = z.enum(ITEM_KINDS);
export const LinkTypeSchema = z.enum(LINK_TYPES);
export const SettlementRoleSchema = z.enum(SETTLEMENT_ROLES);
export const ChargeOriginSchema = z.enum(CHARGE_ORIGINS);
export const DocumentKindSchema = z.enum(DOCUMENT_KINDS);
export const AutoLinkPolicySchema = z.enum(AUTO_LINK_POLICIES);

/**
 * Money on the wire is an integer count of the minor unit. A float here
 * would silently break subset-sum in the reconciliation ladder, so the
 * schema rejects one rather than rounding it.
 */
export const CentsSchema = z.int();

/** Money that cannot be negative — component amounts, never a signed charge. */
export const NonNegativeCentsSchema = z.int().min(0);

/** ISO 4217. Uppercase three letters, so `aud` is a validation error, not a silent second currency. */
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'expected an ISO 4217 code');

/**
 * An ISO-8601 timestamp carrying an explicit timezone.
 *
 * Enforced rather than merely documented, because the failure is silent:
 * `orderedAt` is what the reconciliation ladder's date window is measured
 * against, so a value the window cannot parse does not error — it simply
 * never matches, and the order sits in `awaiting_settlement` forever
 * looking like a purchase nobody paid for.
 *
 * The timezone is required for the same reason. A naive local timestamp
 * compared against a transaction date is ambiguous by up to a day, which
 * is a meaningful fraction of a 14–21 day matching window.
 */
export const IsoTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u,
    'expected an ISO-8601 timestamp with a timezone, e.g. 2026-02-02T01:41:21Z'
  );

/**
 * A soft cross-pillar reference: `pops://<pillar>/<type>/<id>`.
 *
 * These are resolved by a nightly cron and never at read time, so a
 * malformed one produces no error at ingest and no error on read — it just
 * never resolves, and the link to `finance`, `inventory` or `documents`
 * quietly stays broken. Validating the shape at the boundary is the only
 * place the mistake is cheap to catch.
 */
export const PopsUriSchema = z
  .string()
  .regex(
    /^pops:\/\/[a-z0-9-]+\/[a-z0-9-]+\/[^/\s]+$/u,
    'expected a pops:// URI, e.g. pops://finance/transaction/<id>'
  );

export const PurchaseSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceOrderId: z.string().nullable(),
  ingestMethod: IngestMethodSchema,
  orderedAt: IsoTimestampSchema,
  currency: CurrencySchema,
  subtotalCents: NonNegativeCentsSchema,
  /** A fee the merchant added: a card surcharge, a small-order fee. */
  surchargeCents: NonNegativeCentsSchema,
  shippingCents: NonNegativeCentsSchema,
  taxCents: NonNegativeCentsSchema,
  discountCents: NonNegativeCentsSchema,
  totalCents: CentsSchema,
  merchantEntityId: z.string().nullable(),
  merchantEntityName: z.string().nullable(),
  settlementMode: SettlementModeSchema,
  paymentHint: z.string().nullable(),
  /**
   * Where the receipt was PHOTOGRAPHED, in signed decimal degrees, when the
   * image carried a fix (ADR-047).
   *
   * Not where the shop is, and not to be relabelled as such: a receipt
   * photographed at home a week after the shop carries home's coordinate.
   * Null on every purchase that did not arrive as a photograph, and on most
   * that did — phones strip EXIF on share, and a device with no lock writes
   * zeros the reader refuses.
   */
  captureLatitude: z.number().min(-90).max(90).nullable(),
  captureLongitude: z.number().min(-180).max(180).nullable(),
  rawRef: z.string().nullable(),
  checksum: z.string(),
  status: PurchaseStatusSchema,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export const PurchaseShipmentSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  sourceShipmentRef: z.string().nullable(),
  position: z.int().min(0),
  carrier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  shippedAt: IsoTimestampSchema.nullable(),
  deliveredAt: IsoTimestampSchema.nullable(),
  status: ShipmentStatusSchema,
  shippingCents: NonNegativeCentsSchema,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

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
  sku: z.string().nullable(),
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
  createdAt: IsoTimestampSchema,
});

export const PurchaseChargeSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  shipmentId: z.string().nullable(),
  sourceChargeRef: z.string().nullable(),
  position: z.int().min(0),
  amountCents: CentsSchema,
  currency: CurrencySchema,
  orderAmountCents: CentsSchema,
  chargedAt: IsoTimestampSchema.nullable(),
  role: SettlementRoleSchema,
  paymentHint: z.string().nullable(),
  origin: ChargeOriginSchema,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export const PurchaseChargeLinkSchema = z.object({
  id: z.string(),
  chargeId: z.string(),
  transactionUri: PopsUriSchema,
  amountCents: CentsSchema,
  linkType: LinkTypeSchema,
  confidence: z.number().min(0).max(1),
  matchRuleId: z.string().nullable(),
  createdAt: IsoTimestampSchema,
  confirmedAt: IsoTimestampSchema.nullable(),
});

export const PurchaseItemAllocationSchema = z.object({
  id: z.string(),
  chargeId: z.string(),
  itemId: z.string(),
  amountCents: CentsSchema,
  createdAt: IsoTimestampSchema,
});

export const PurchaseDocumentSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  shipmentId: z.string().nullable(),
  documentUri: PopsUriSchema,
  documentStaleAt: IsoTimestampSchema.nullable(),
  kind: DocumentKindSchema,
  createdAt: IsoTimestampSchema,
});

export const PurchaseSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  descriptorPattern: z.string().nullable(),
  settlementWindowDays: z.int().min(1),
  autoLinkPolicy: AutoLinkPolicySchema,
  ingestAdapter: z.string().nullable(),
  createdAt: IsoTimestampSchema,
});

/**
 * The accounting split.
 *
 * Part of the wire format on purpose, and pre-split so no consumer has to
 * derive it. A view that drops the residual converts a known unknown into a
 * false certainty, which ADR-042 rates as worse than showing nothing; one
 * that folds `awaitingImportCents` into it flags every recent order as
 * broken until its statement imports; and one that folds refunds in reports
 * returned money as missing money.
 *
 * The identity consumers can rely on:
 * `totalCents === matchedCents + awaitingImportCents + residualCents`,
 * with `refundedCents` orthogonal and `netSpendCents` the headline figure,
 * `totalCents − refundedCents`. That last one answers what the order cost,
 * not how much of it has been proven — "money we can prove moved, net of
 * refunds" stays derivable as `matched + awaitingImport − refunded`.
 */
export const PurchaseAccountingSchema = z.object({
  totalCents: CentsSchema,
  matchedCents: CentsSchema,
  awaitingImportCents: CentsSchema,
  residualCents: CentsSchema,
  /** Positive magnitude, so `refundedCents: 1179` reads as "$11.79 came back". */
  refundedCents: NonNegativeCentsSchema,
  /** Signed and unclamped: negative is a genuine over-refund, not an artefact. */
  netSpendCents: CentsSchema,
});

export const PurchaseItemDetailSchema = z.object({
  item: PurchaseItemSchema,
  /** POPS classification, each carrying whether it is asserted or proposed. */
  tags: z.array(PurchaseItemTagSchema),
  /** Verbatim merchant prose, in the order it was printed. */
  notes: z.array(z.string()),
  units: z.array(PurchaseItemUnitSchema),
  landedCostCents: CentsSchema,
});

export const PurchaseChargeDetailSchema = z.object({
  charge: PurchaseChargeSchema,
  links: z.array(PurchaseChargeLinkSchema),
  allocations: z.array(PurchaseItemAllocationSchema),
});

/** An order and every list hanging off it. */
export const PurchaseDetailSchema = z.object({
  /**
   * Facts about the order that are not fields — `date-uncertain` when the
   * receipt stated no date, `timezone-uncertain` when the shop's zone had
   * to be guessed. A reviewer needs these to know which figures the source
   * actually stated.
   */
  tags: z.array(z.string()),
  purchase: PurchaseSchema,
  shipments: z.array(PurchaseShipmentSchema),
  items: z.array(PurchaseItemDetailSchema),
  charges: z.array(PurchaseChargeDetailSchema),
  documents: z.array(PurchaseDocumentSchema),
  accounting: PurchaseAccountingSchema,
});
