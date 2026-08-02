import { z } from 'zod';

import {
  AUTO_LINK_POLICIES,
  INGEST_METHODS,
  ITEM_KINDS,
  LINK_TYPES,
  PURCHASE_STATUSES,
  SETTLEMENT_MODES,
} from '../constants.js';

export const IngestMethodSchema = z.enum(INGEST_METHODS);
export const SettlementModeSchema = z.enum(SETTLEMENT_MODES);
export const PurchaseStatusSchema = z.enum(PURCHASE_STATUSES);
export const ItemKindSchema = z.enum(ITEM_KINDS);
export const LinkTypeSchema = z.enum(LINK_TYPES);
export const AutoLinkPolicySchema = z.enum(AUTO_LINK_POLICIES);

/**
 * Money on the wire is an integer count of the minor unit. A float here
 * would silently break subset-sum in the reconciliation ladder, so the
 * schema rejects one rather than rounding it.
 */
export const CentsSchema = z.int();

/** Money that cannot be negative — component amounts, never the total. */
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

export const PurchaseItemSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  quantity: z.int().min(1),
  unitPriceCents: CentsSchema,
  lineTotalCents: CentsSchema,
  refundedCents: NonNegativeCentsSchema,
  merchantCategory: z.string().nullable(),
  tags: z.array(z.string()),
  kind: ItemKindSchema.nullable(),
  inventoryItemUri: z.string().nullable(),
  inventoryItemStaleAt: z.string().nullable(),
  createdAt: z.string(),
});

export const PurchaseTransactionLinkSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  transactionUri: z.string(),
  amountCents: CentsSchema,
  linkType: LinkTypeSchema,
  confidence: z.number().min(0).max(1),
  matchRuleId: z.string().nullable(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
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
 * A purchase with its lines, its links, and the residual.
 *
 * `residualCents` is part of the wire format on purpose. A consumer that
 * renders spend without it would convert a known unknown into a false
 * certainty, which ADR-042 rates as worse than showing nothing.
 */
export const PurchaseDetailSchema = z.object({
  purchase: PurchaseSchema,
  items: z.array(PurchaseItemSchema),
  links: z.array(PurchaseTransactionLinkSchema),
  residualCents: CentsSchema,
});
