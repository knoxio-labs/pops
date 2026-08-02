import { z } from 'zod';

import {
  AUTO_LINK_POLICIES,
  CHARGE_ORIGINS,
  DOCUMENT_KINDS,
  INGEST_METHODS,
  ITEM_KINDS,
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

export const PurchaseSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceOrderId: z.string().nullable(),
  ingestMethod: IngestMethodSchema,
  orderedAt: z.string(),
  currency: CurrencySchema,
  subtotalCents: NonNegativeCentsSchema,
  shippingCents: NonNegativeCentsSchema,
  taxCents: NonNegativeCentsSchema,
  discountCents: NonNegativeCentsSchema,
  totalCents: CentsSchema,
  merchantEntityId: z.string().nullable(),
  merchantEntityName: z.string().nullable(),
  settlementMode: SettlementModeSchema,
  paymentHint: z.string().nullable(),
  rawRef: z.string().nullable(),
  checksum: z.string(),
  status: PurchaseStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PurchaseShipmentSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  sourceShipmentRef: z.string().nullable(),
  position: z.int().min(0),
  carrier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  shippedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  status: ShipmentStatusSchema,
  shippingCents: NonNegativeCentsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
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
  kind: ItemKindSchema.nullable(),
  createdAt: z.string(),
});

export const PurchaseItemUnitSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  serialNumber: z.string().nullable(),
  inventoryItemUri: z.string().nullable(),
  inventoryItemStaleAt: z.string().nullable(),
  createdAt: z.string(),
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
  chargedAt: z.string().nullable(),
  role: SettlementRoleSchema,
  paymentHint: z.string().nullable(),
  origin: ChargeOriginSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PurchaseChargeLinkSchema = z.object({
  id: z.string(),
  chargeId: z.string(),
  transactionUri: z.string(),
  amountCents: CentsSchema,
  linkType: LinkTypeSchema,
  confidence: z.number().min(0).max(1),
  matchRuleId: z.string().nullable(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
});

export const PurchaseItemAllocationSchema = z.object({
  id: z.string(),
  chargeId: z.string(),
  itemId: z.string(),
  amountCents: CentsSchema,
  createdAt: z.string(),
});

export const PurchaseDocumentSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  shipmentId: z.string().nullable(),
  documentUri: z.string(),
  documentStaleAt: z.string().nullable(),
  kind: DocumentKindSchema,
  createdAt: z.string(),
});

export const PurchaseSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  descriptorPattern: z.string().nullable(),
  settlementWindowDays: z.int().min(1),
  autoLinkPolicy: AutoLinkPolicySchema,
  ingestAdapter: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * The accounting split.
 *
 * Part of the wire format on purpose. A consumer that renders spend without
 * it would convert a known unknown into a false certainty, which ADR-042
 * rates as worse than showing nothing — and one that folded
 * `awaitingImportCents` into the residual would flag every recent order as
 * broken until its statement imports.
 */
export const PurchaseAccountingSchema = z.object({
  totalCents: CentsSchema,
  matchedCents: CentsSchema,
  awaitingImportCents: CentsSchema,
  residualCents: CentsSchema,
});

export const PurchaseItemDetailSchema = z.object({
  item: PurchaseItemSchema,
  tags: z.array(z.string()),
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
  purchase: PurchaseSchema,
  shipments: z.array(PurchaseShipmentSchema),
  items: z.array(PurchaseItemDetailSchema),
  charges: z.array(PurchaseChargeDetailSchema),
  documents: z.array(PurchaseDocumentSchema),
  accounting: PurchaseAccountingSchema,
});
