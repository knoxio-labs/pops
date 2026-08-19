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
import { PopsUriSchema, PurchaseDetailSchema } from './schemas/purchase.js';

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

/**
 * Where the device was standing when the shutter fired.
 *
 * **Sensitive, and treated as such throughout.** It is stored because the
 * user photographed their own receipt, and it is never logged, never put in
 * a URL or query string, and never echoed in an error — a refused upload
 * says the body did not match the contract and nothing about what was in
 * it (`api/rest/error-mapping.ts`).
 *
 * WGS-84 signed decimal degrees, the form every phone geolocation API
 * already returns. No accuracy radius: nothing consumes one yet, and a
 * field no reader uses is a field that drifts.
 */
export const CaptureLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/**
 * What the device knew that the paper cannot state.
 *
 * Every field optional, and the whole object optional, so the plain upload
 * path is byte-identical to what it was: a browser drop-zone posting a
 * scanned PDF knows none of this and must not have to say so. The mobile
 * bridge knows all of it directly, and a device clock and a device
 * location are recorded facts where a timezone read off a printed address
 * is an inference.
 *
 * It does NOT override the receipt's own printed date. A photo taken at the
 * till and a photo taken at home a week later must produce the same
 * purchase date, and only the paper knows that one. What `capturedAt`
 * replaces is the *upload* time in the undated fallback — the shop is
 * closer to when the shutter fired than to when the file reached the
 * server — and the purchase still carries `date-uncertain`.
 */
export const CaptureMetadataSchema = z.object({
  /**
   * ISO-8601 instant from the device clock, with an offset.
   *
   * The offset is not decoration: `+11:00` states which offset the device
   * was on, which is evidence about where it was standing. A client that
   * normalises to `Z` still gets a correct instant and simply supplies no
   * such evidence — see `ingest/receipt/capture.ts`.
   */
  capturedAt: z.iso.datetime({ offset: true }).optional(),
  /**
   * IANA zone the device was in — `Australia/Perth`, `Europe/Paris`.
   *
   * The strongest zone evidence there is, because it is a statement rather
   * than an inference, and the only one carrying a DST rule. A name the
   * runtime does not know falls through to the next-best evidence instead
   * of throwing inside a date calculation — the same treatment the zone the
   * model infers already gets.
   */
  timeZone: z.string().trim().min(1).max(64).optional(),
  location: CaptureLocationSchema.optional(),
});

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
   * What the device knew, for a client that has it. Additive and optional:
   * a caller that omits it gets exactly the behaviour it got before this
   * field existed.
   *
   * One object for the whole submission rather than one per part, because
   * several photographs of one long receipt are one capture event — and a
   * client that could say something different about frame three of the same
   * till slip would be saying something about a different shop.
   */
  capture: CaptureMetadataSchema.optional(),
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
