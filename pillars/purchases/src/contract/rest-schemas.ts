/**
 * Shared zod building blocks for the purchases REST contract.
 *
 * Split from `rest.ts` so the per-group route files can stay focused on
 * the path map.
 */
import { z } from 'zod';

import {
  AutoLinkPolicySchema,
  CentsSchema,
  CurrencySchema,
  IngestMethodSchema,
  ItemKindSchema,
  NonNegativeCentsSchema,
  PurchaseStatusSchema,
  SettlementModeSchema,
} from './schemas/purchase.js';

export const ErrorBodySchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});

export const OkSchema = z.object({ ok: z.literal(true) });

/**
 * A line item as submitted by an ingest adapter. Server-assigned fields
 * (`id`, `purchaseId`, `refundedCents`, the inventory URI pair) are absent:
 * an adapter describes what was bought, not what POPS later inferred.
 */
export const CreatePurchaseItemBodySchema = z.object({
  name: z.string().trim().min(1),
  sku: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  quantity: z.int().min(1).optional(),
  unitPriceCents: CentsSchema,
  lineTotalCents: CentsSchema,
  merchantCategory: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  kind: ItemKindSchema.nullable().optional(),
});

export const CreatePurchaseBodySchema = z.object({
  source: z.string().trim().min(1),
  sourceOrderId: z.string().nullable().optional(),
  ingestMethod: IngestMethodSchema,
  orderedAt: z.string().trim().min(1),
  currency: CurrencySchema,
  subtotalCents: NonNegativeCentsSchema.optional(),
  shippingCents: NonNegativeCentsSchema.optional(),
  taxCents: NonNegativeCentsSchema.optional(),
  discountCents: NonNegativeCentsSchema.optional(),
  totalCents: CentsSchema,
  merchantEntityId: z.string().nullable().optional(),
  merchantEntityName: z.string().nullable().optional(),
  settlementMode: SettlementModeSchema.optional(),
  paymentHint: z.string().nullable().optional(),
  rawRef: z.string().nullable().optional(),
  /**
   * Ingest-level dedup key. Required, not derived server-side: only the
   * adapter knows which fields of its source identify a document, and
   * re-uploading the same bundle must be a no-op.
   */
  checksum: z.string().trim().min(1),
  items: z.array(CreatePurchaseItemBodySchema).optional(),
});

export const UpsertPurchaseSourceBodySchema = z.object({
  label: z.string().trim().min(1),
  descriptorPattern: z.string().nullable().optional(),
  settlementWindowDays: z.int().min(1).optional(),
  autoLinkPolicy: AutoLinkPolicySchema.optional(),
  ingestAdapter: z.string().nullable().optional(),
});

/**
 * Query filters for the purchase index. `sources` and `statuses` accept a
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
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
