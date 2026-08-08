/**
 * `receipt.*` sub-router — the drop-zone.
 *
 * One entry point for every merchant that never gets a dedicated adapter.
 * The body is base64 rather than multipart because a receipt is a phone
 * photo — hundreds of kilobytes, not hundreds of megabytes — and JSON keeps
 * the surface describable in the same ts-rest contract as everything else.
 *
 * The interesting part of this route is its response, which is a
 * discriminated union rather than a purchase. A vision model reading a
 * crumpled receipt produces three materially different outcomes and
 * collapsing them loses the distinction the whole feature rests on:
 * a reading that agreed with the paper is a fact, a reading that did not is
 * a real purchase needing a human, and a model that could not read it at
 * all is neither.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ExtractedReceiptSchema } from '../ingest/receipt/extraction.js';
import { MEDIA_TYPES } from '../ingest/receipt/vision.js';
import { ErrorBodySchema } from './rest-schemas.js';
import { PopsUriSchema, PurchaseDetailSchema } from './schemas/purchase.js';

const c = initContract();

export const ReceiptImageSchema = z.object({
  /** Closed to what a vision model accepts — see `ingest/receipt/vision.ts`. */
  mediaType: z.enum(MEDIA_TYPES),
  /** The image, base64 with no data-URI prefix. */
  dataBase64: z.string().min(1),
});

/** How many photographs one receipt may be sent as. */
export const MAX_RECEIPT_IMAGES = 8;

export const UploadReceiptBodySchema = z.object({
  /**
   * One receipt, in order, top to bottom. A full supermarket shop does not
   * fit in one frame, so several photographs of one piece of paper are one
   * upload and one purchase — not several receipts.
   *
   * Bounded because every image is paid for in the same model call, and a
   * receipt needing more than eight frames is a scanner's job.
   */
  images: z.array(ReceiptImageSchema).min(1).max(MAX_RECEIPT_IMAGES),
});

/** One thing the gate objected to, in the receipt's own terms. */
export const GateFailureSchema = z.object({
  kind: z.enum([
    'unreadable-total',
    'unreadable-line',
    'no-lines',
    'negative-line',
    'sum-mismatch',
    'damaged',
  ]),
  detail: z.string(),
  /** `Σ lines + tax − discounts − total`, present only on a sum mismatch. */
  deltaCents: z.int().optional(),
});

export const ReceiptOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('created'),
    purchase: PurchaseDetailSchema,
    /** True when these exact bytes were already stored. */
    alreadyStored: z.boolean(),
  }),
  /**
   * Read, but the figures disagree with the total the paper states. A real
   * purchase that a human has to settle, returned in full so the reviewer
   * sees what the model saw. Nothing is written.
   *
   * A receipt that merely states no DATE is not this: it is created, dated
   * from the upload, and tagged `date-uncertain`.
   */
  z.object({
    kind: z.literal('needs-review'),
    /** Every photograph, in the order it was sent. */
    receiptUris: z.array(PopsUriSchema).min(1),
    failures: z.array(GateFailureSchema),
    /**
     * What the model read, typed. A reviewer's whole job is to compare this
     * against the photograph, so a client that cannot render it without
     * ad-hoc parsing cannot do the one thing this outcome exists for.
     */
    extracted: ExtractedReceiptSchema,
  }),
  /** Nothing usable came back. Not a purchase, and not an empty receipt. */
  z.object({
    kind: z.literal('unreadable'),
    receiptUris: z.array(PopsUriSchema).min(1),
    reason: z.string(),
  }),
]);

export const purchasesReceiptContract = c.router({
  upload: {
    method: 'POST',
    path: '/receipts',
    body: UploadReceiptBodySchema,
    responses: {
      200: ReceiptOutcomeSchema,
      // Not an image, or not the type it claims. Checked before the model
      // sees it, because that is an answer the user can act on and a
      // model's confusion about it is not.
      400: ErrorBodySchema,
      // The same photograph has already produced a purchase.
      409: ErrorBodySchema,
      // No vision model is configured. Declined at the edge rather than
      // accepted and failed out of sight.
      503: ErrorBodySchema,
    },
    summary: 'Read a photographed receipt and create the purchase it describes',
  },
});
