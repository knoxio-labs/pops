/**
 * The `receipt.extract` shape bfm reads from `purchases`, and its mapping to
 * the mobile draft (POPS-2454).
 *
 * Validated for the same reason `wire.ts` validates the upload leg: the SDK
 * proxy resolves routes from the producer's OpenAPI at runtime, so the local
 * router type is an assertion, and here the stakes are an editable form — a
 * producer-side rename would reach a phone as a draft with no items rather
 * than as the loud failure a mismatch should be.
 *
 * Money is `purchases`' and is mirrored: integer cents, exactly as that
 * pillar persists and publishes it, matching `wire.ts`'s own reasoning.
 */
import { z } from 'zod';

import type { MobileExtractOutcome, MobileResolvedCapture } from '../../contract/receipt-draft.js';

const PurchasesResolvedCaptureSchema = z.object({
  capturedAt: z.string().nullable(),
  capturedAtSource: z.string().nullable(),
  utcOffsetMinutes: z.number().int().nullable(),
  declaredTimeZone: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  locationSource: z.string().nullable(),
});

const PurchasesDraftLineSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive().optional(),
  unitPriceCents: z.number().int(),
  lineTotalCents: z.number().int(),
  notes: z.array(z.string()).optional(),
});

const PurchasesDraftDocumentSchema = z.object({
  documentUri: z.string(),
  kind: z.literal('receipt'),
});

/** `purchases`' `ReceiptDraftSchema` — the fields a reviewer can edit. */
const PurchasesReceiptDraftSchema = z.object({
  merchantEntityName: z.string().nullable().optional(),
  orderedAt: z.string(),
  orderedAtOffsetMinutes: z.number().int().nullable().optional(),
  currency: z.string(),
  totalCents: z.number().int(),
  subtotalCents: z.number().int().optional(),
  taxCents: z.number().int().optional(),
  surchargeCents: z.number().int().optional(),
  shippingCents: z.number().int().optional(),
  discountCents: z.number().int().optional(),
  items: z.array(PurchasesDraftLineSchema),
  documents: z.array(PurchasesDraftDocumentSchema).optional(),
  capture: PurchasesResolvedCaptureSchema.optional(),
});

const PurchasesDraftGateFailureSchema = z.object({
  kind: z.string(),
  detail: z.string(),
  deltaCents: z.number().int().optional(),
});

/** `purchases`' `ExtractReceiptOutcomeSchema`, validated. */
export const PurchasesExtractOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('draft'),
    receiptUris: z.array(z.string()).min(1),
    reconciled: z.boolean(),
    failures: z.array(PurchasesDraftGateFailureSchema),
    draft: PurchasesReceiptDraftSchema,
  }),
  z.object({
    kind: z.literal('unreadable'),
    receiptUris: z.array(z.string()).min(1),
    reason: z.string(),
  }),
]);

export type PurchasesExtractOutcome = z.infer<typeof PurchasesExtractOutcomeSchema>;

function toMobileCapture(
  capture: z.infer<typeof PurchasesResolvedCaptureSchema> | undefined
): MobileResolvedCapture | null {
  if (capture === undefined) return null;
  return {
    capturedAt: capture.capturedAt,
    capturedAtSource:
      capture.capturedAtSource === 'client' || capture.capturedAtSource === 'exif'
        ? capture.capturedAtSource
        : null,
    utcOffsetMinutes: capture.utcOffsetMinutes,
    declaredTimeZone: capture.declaredTimeZone,
    latitude: capture.latitude,
    longitude: capture.longitude,
    locationSource:
      capture.locationSource === 'client' || capture.locationSource === 'exif'
        ? capture.locationSource
        : null,
  };
}

/** purchases' extract outcome → the mobile one. Field-for-field; no arithmetic. */
export function toMobileExtractOutcome(outcome: PurchasesExtractOutcome): MobileExtractOutcome {
  if (outcome.kind === 'unreadable') {
    return { kind: 'unreadable', receiptUris: outcome.receiptUris, reason: outcome.reason };
  }

  const { draft } = outcome;
  return {
    kind: 'draft',
    receiptUris: outcome.receiptUris,
    reconciled: outcome.reconciled,
    failures: outcome.failures.map((failure) => ({
      code: failure.kind,
      detail: failure.detail,
      deltaCents: failure.deltaCents ?? null,
    })),
    draft: {
      merchantName: draft.merchantEntityName ?? null,
      orderedAt: draft.orderedAt,
      orderedAtOffsetMinutes: draft.orderedAtOffsetMinutes ?? null,
      currency: draft.currency,
      totalCents: draft.totalCents,
      subtotalCents: draft.subtotalCents ?? 0,
      taxCents: draft.taxCents ?? 0,
      surchargeCents: draft.surchargeCents ?? 0,
      shippingCents: draft.shippingCents ?? 0,
      discountCents: draft.discountCents ?? 0,
      items: draft.items.map((item) => ({
        name: item.name,
        quantity: item.quantity ?? null,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        notes: item.notes ?? [],
      })),
      documents: (draft.documents ?? []).map((document) => ({
        documentUri: document.documentUri,
        kind: 'receipt' as const,
      })),
      capture: toMobileCapture(draft.capture),
    },
  };
}
