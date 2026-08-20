import { z } from 'zod';

import {
  AUTO_LINK_POLICIES,
  CHARGE_ORIGINS,
  DOCUMENT_KINDS,
  INGEST_METHODS,
  ITEM_TAG_PATTERN,
  LINK_TYPES,
  PURCHASE_STATUSES,
  SETTLEMENT_MODES,
  SETTLEMENT_ROLES,
  SHIPMENT_STATUSES,
} from '../constants.js';
import {
  CentsSchema,
  CurrencySchema,
  IsoTimestampSchema,
  NonNegativeCentsSchema,
  PopsUriSchema,
} from './scalars.js';

export {
  CentsSchema,
  CurrencySchema,
  IsoTimestampSchema,
  NonNegativeCentsSchema,
  PopsUriSchema,
} from './scalars.js';
export {
  ItemKindClassificationSchema,
  ItemKindSchema,
  ItemTagSchema,
  PurchaseItemSchema,
  PurchaseItemTagSchema,
  PurchaseItemUnitSchema,
} from './item.js';

export const IngestMethodSchema = z.enum(INGEST_METHODS);
export const SettlementModeSchema = z.enum(SETTLEMENT_MODES);
export const PurchaseStatusSchema = z.enum(PURCHASE_STATUSES);
export const ShipmentStatusSchema = z.enum(SHIPMENT_STATUSES);
export const LinkTypeSchema = z.enum(LINK_TYPES);
export const SettlementRoleSchema = z.enum(SETTLEMENT_ROLES);
export const ChargeOriginSchema = z.enum(CHARGE_ORIGINS);
export const DocumentKindSchema = z.enum(DOCUMENT_KINDS);
export const AutoLinkPolicySchema = z.enum(AUTO_LINK_POLICIES);

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
 * An order tag: a fact about how the whole order was read, not about a
 * product. `date-uncertain`, `promotion-offset`.
 *
 * Same slug rule as {@link ItemTagSchema} and a separate schema anyway,
 * because the two vocabularies are separate — an order tag records a
 * reading, an item tag classifies a thing — and one of them growing a value
 * must not be able to widen the other.
 */
export const PurchaseTagSchema = z.string().regex(ITEM_TAG_PATTERN, 'expected a lower-case slug');

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
