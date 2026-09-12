/**
 * The mobile shapes for separating a receipt's extraction from its
 * persistence, and for a purchase typed by hand (POPS-2454).
 *
 * `receipt.ts` describes the upload leg this replaces on the phone; this
 * file is additive rather than a rewrite of it, because the old
 * upload-and-persist outcome and this one answer different questions:
 * `receipt.ts`'s `MobileReceiptOutcomeSchema` says what became of an
 * upload, this file's `MobileExtractOutcomeSchema` says what a reading
 * looks like BEFORE anything is decided about it.
 *
 * Money here is integer cents throughout, unlike `MobileExtractedReceipt`'s
 * printed strings — the draft mirrors what `purchases` now returns from
 * `receipt.extract`, which parses every reconciled or unreconciled reading
 * into the same shaped fields a reviewer edits (`pillars/purchases/src/
 * ingest/receipt/draft.ts`). There is exactly one editable shape regardless
 * of whether the receipt's own arithmetic agreed with it.
 */
import { z } from 'zod';

const MOBILE_CAPTURE_SOURCES = ['client', 'exif'] as const;

/** Who stated a capture fact, as `purchases` resolved it — not what the device sent. */
export const MobileCaptureSourceSchema = z.enum(MOBILE_CAPTURE_SOURCES);

/**
 * What the device and the photograph said about themselves, ALREADY
 * RESOLVED by `purchases` — every field present, `null` where nothing
 * claimed it. Distinct from `receipt.ts`'s `CaptureMetadataSchema`, which is
 * what a client SENDS before any of this is decided.
 */
export const MobileResolvedCaptureSchema = z.object({
  capturedAt: z.string().nullable(),
  capturedAtSource: MobileCaptureSourceSchema.nullable(),
  utcOffsetMinutes: z.number().int().nullable(),
  declaredTimeZone: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  locationSource: MobileCaptureSourceSchema.nullable(),
});

export type MobileResolvedCapture = z.infer<typeof MobileResolvedCaptureSchema>;

/** One line, editable — a plain quantity and two cent figures, not printed text. */
export const MobileDraftLineSchema = z.object({
  name: z.string().min(1),
  /** `null` when the receipt did not state a count; never invented as `1`. */
  quantity: z.number().int().positive().nullable(),
  unitPriceCents: z.number().int(),
  lineTotalCents: z.number().int(),
  notes: z.array(z.string()),
});

export type MobileDraftLine = z.infer<typeof MobileDraftLineSchema>;

/** One receipt image already stored, referenced by a draft or a save. */
export const MobileDraftDocumentSchema = z.object({
  documentUri: z.string(),
  kind: z.literal('receipt'),
});

export type MobileDraftDocument = z.infer<typeof MobileDraftDocumentSchema>;

/**
 * Everything a reviewer can edit before a receipt-derived draft — or a
 * purchase typed by hand — is saved. `merchant, printed date, currency,
 * total, line items, adjustments, capture metadata` from the ticket's own
 * words; `idempotencyKey` and `documents` are the two save-only additions.
 */
const MobileDraftPurchaseFieldsSchema = z.object({
  merchantName: z.string().nullable(),
  /** ISO-8601 with an offset — the date and time the reviewer confirmed. */
  orderedAt: z.string(),
  /**
   * The offset `orderedAt` was resolved against, when one is known.
   *
   * Carried apart from the instant because the two name DIFFERENT dates: a
   * receipt printed 08:15 on the 13th in Sydney is 22:15 UTC on the 12th,
   * and a save that drops this dates the shop to the day before (POPS-2530).
   */
  orderedAtOffsetMinutes: z.number().int().nullable().optional(),
  currency: z.string(),
  totalCents: z.number().int(),
  taxCents: z.number().int().optional(),
  surchargeCents: z.number().int().optional(),
  shippingCents: z.number().int().optional(),
  discountCents: z.number().int().optional(),
  items: z.array(MobileDraftLineSchema).min(1),
  capture: MobileResolvedCaptureSchema.nullable().optional(),
  /**
   * Chosen by the reviewer's device, not by bfm — the same key resubmitted
   * refuses as a retry rather than writing a second purchase.
   */
  idempotencyKey: z.string().trim().min(1).max(200),
});

/** `POST /mobile/purchases/manual` — a purchase typed by hand, no receipt. */
export const MobileCreateManualPurchaseBodySchema = MobileDraftPurchaseFieldsSchema;

export type MobileCreateManualPurchaseBody = z.infer<typeof MobileCreateManualPurchaseBodySchema>;

/** `POST /mobile/purchases/receipts` (repurposed) — saving a corrected draft. */
export const MobileSaveReceiptDraftBodySchema = MobileDraftPurchaseFieldsSchema.extend({
  documents: z.array(MobileDraftDocumentSchema).min(1),
});

export type MobileSaveReceiptDraftBody = z.infer<typeof MobileSaveReceiptDraftBodySchema>;

/** The draft `receipt.extract` answers — not yet anything the phone may keep unedited. */
export const MobileReceiptDraftSchema = z.object({
  merchantName: z.string().nullable(),
  orderedAt: z.string(),
  /** The offset the instant above was resolved against. See the save body. */
  orderedAtOffsetMinutes: z.number().int().nullable(),
  currency: z.string(),
  totalCents: z.number().int(),
  subtotalCents: z.number().int(),
  taxCents: z.number().int(),
  surchargeCents: z.number().int(),
  shippingCents: z.number().int(),
  discountCents: z.number().int(),
  items: z.array(MobileDraftLineSchema),
  documents: z.array(MobileDraftDocumentSchema),
  capture: MobileResolvedCaptureSchema.nullable(),
});

export type MobileReceiptDraft = z.infer<typeof MobileReceiptDraftSchema>;

/** One thing the arithmetic gate objected to — same vocabulary as the upload leg. */
export const MobileDraftFailureSchema = z.object({
  code: z.string(),
  detail: z.string(),
  deltaCents: z.number().int().nullable(),
});

/**
 * What `receipt.extract` answers.
 *
 * Two arms, matching `purchases`' own separation of extraction from
 * persistence: every USABLE reading is a `draft`, reconciled or not, and
 * only a reading with nothing to edit is `unreadable`. No outcome here
 * gates field editability — that is the whole point of this route existing
 * apart from `receipt.upload`.
 */
export const MobileExtractOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('draft'),
    receiptUris: z.array(z.string()).min(1),
    reconciled: z.boolean(),
    failures: z.array(MobileDraftFailureSchema),
    draft: MobileReceiptDraftSchema,
  }),
  z.object({
    kind: z.literal('unreadable'),
    receiptUris: z.array(z.string()).min(1),
    reason: z.string(),
  }),
]);

export type MobileExtractOutcome = z.infer<typeof MobileExtractOutcomeSchema>;
