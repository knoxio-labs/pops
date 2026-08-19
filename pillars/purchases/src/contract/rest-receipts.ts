/**
 * `receipt.*` sub-router — the drop-zone.
 *
 * One entry point for every merchant that never gets a dedicated adapter,
 * and for the shapes a receipt actually arrives in: a photographed till
 * slip, the merchant's PDF tax invoice, or the body of an order
 * confirmation. All three state their own total, which is what lets one
 * gate decide whether any of them may be believed.
 *
 * The body is base64 rather than multipart because these are phone photos
 * and invoices — hundreds of kilobytes, not hundreds of megabytes — and
 * JSON keeps the surface describable in the same ts-rest contract as
 * everything else. The API's own 20mb body limit is the effective ceiling;
 * an upload past it is a 413 before this contract sees it.
 *
 * The interesting part of this route is its response, which is a
 * discriminated union rather than a purchase. A model reading a crumpled
 * receipt produces three materially different outcomes and collapsing them
 * loses the distinction the whole feature rests on: a reading that agreed
 * with the receipt is a fact, a reading that did not is a real purchase
 * needing a human, and a model that could not read it at all is neither.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ExtractedReceiptSchema } from '../ingest/receipt/extraction.js';
import { MEDIA_TYPES } from '../ingest/receipt/vision.js';
import { ErrorBodySchema } from './rest-schemas.js';
import { IsoTimestampSchema, PopsUriSchema, PurchaseDetailSchema } from './schemas/purchase.js';

const c = initContract();

export const ReceiptPartSchema = z.object({
  /**
   * Closed to what the model accepts — see `ingest/receipt/vision.ts`. The
   * kind is derived from this rather than declared beside it, so an upload
   * cannot claim to be something its own bytes are not.
   */
  mediaType: z.enum(MEDIA_TYPES),
  /**
   * The file, base64 with no data-URI prefix. `text/plain` is base64 too:
   * one representation means one content-addressed store, one dedup key and
   * one edge check for every shape.
   */
  dataBase64: z.string().min(1),
});

/** How many parts one receipt may be sent as. */
export const MAX_RECEIPT_PARTS = 8;

export const UploadReceiptBodySchema = z.object({
  /**
   * One receipt, in order, top to bottom. A full supermarket shop does not
   * fit in one frame, so several photographs of one piece of paper are one
   * upload and one purchase — not several receipts. A PDF or a pasted body
   * is ordinarily the whole receipt and arrives on its own.
   *
   * Bounded because every part is paid for in the same model call, and a
   * receipt needing more than eight frames is a scanner's job.
   */
  parts: z.array(ReceiptPartSchema).min(1).max(MAX_RECEIPT_PARTS),
  /**
   * When the shutter fired, by the uploading device's own clock.
   *
   * Optional, and the plain upload path is unchanged without it: a `curl` of
   * a scanned PDF knows nothing about a capture, and a browser drop-zone
   * re-encodes the image before sending it, which drops the EXIF that would
   * otherwise have said. A phone photographing a receipt at the till knows
   * directly, and directly beats both inference and the moment the file
   * happened to reach the server.
   *
   * It does not override the date the receipt itself prints — a slip
   * photographed at the till and the same slip photographed at home a week
   * later are one purchase on one date, and only the paper knows which. What
   * it replaces is the *upload* instant in the undated fallback, which still
   * carries `date-uncertain` because it is still not something the receipt
   * said.
   *
   * A value outside the window it could plausibly have happened in — a dead
   * battery's epoch, a clock set years forward — is discarded rather than
   * refused, and the upload proceeds as though none had been sent. The bytes
   * are the evidence; a handset with a wrong clock cannot fix it by retrying.
   */
  capturedAt: IsoTimestampSchema.optional(),
  /**
   * The IANA zone the uploading device was in, e.g. `Australia/Sydney`.
   *
   * Outranks the zone the model infers from the printed address, which is the
   * only field the extraction schema asks it to guess. A zone the runtime
   * does not know is dropped, not trusted.
   *
   * A zone, not coordinates. This route accepts no location and the pillar
   * stores none: an IANA identifier is what a date needs to be unambiguous,
   * and it is the coarsest thing that answers that question. Where a purchase
   * physically happened is a separate decision nobody has taken, and reading
   * it off a photograph without taking it is the one thing not to do — see
   * `src/ingest/receipt/exif.ts`.
   */
  timeZone: z.string().min(1).max(64).optional(),
});

/** One thing the gate objected to, in the receipt's own terms. */
export const GateFailureSchema = z.object({
  kind: z.enum([
    'unreadable-total',
    'unreadable-line',
    'no-lines',
    'negative-line',
    'sum-mismatch',
    'ambiguous-tax',
    'damaged',
  ]),
  detail: z.string(),
  /**
   * How far the receipt's own arithmetic falls from the total it states,
   * present only on a sum mismatch — never on `ambiguous-tax`, where the
   * arithmetic agrees under both readings and there is no discrepancy to
   * state:
   * `Σ lines − discounts + surcharges + shipping (+ tax, when the prices
   * exclude it) − total`, reported under whichever tax convention came
   * closer. Negative means the components fall short of the stated total.
   */
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
   * Read, but the figures disagree with the total the receipt states. A
   * real purchase that a human has to settle, returned in full so the
   * reviewer sees what the model saw. Nothing is written.
   *
   * A receipt that merely states no DATE is not this: it is created, dated
   * from the upload, and tagged `date-uncertain`.
   */
  z.object({
    kind: z.literal('needs-review'),
    /** Every part, in the order it was sent. */
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
      // Not the type it claims. Checked before the model sees it, because
      // that is an answer the user can act on and a model's confusion about
      // it is not.
      400: ErrorBodySchema,
      // The same file has already produced a purchase.
      409: ErrorBodySchema,
      // No vision model is configured. Declined at the edge rather than
      // accepted and failed out of sight.
      503: ErrorBodySchema,
    },
    summary: 'Read an uploaded receipt — photograph, PDF or pasted body — and create its purchase',
  },
});
