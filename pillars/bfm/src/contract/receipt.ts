import { z } from 'zod';

/**
 * What a `/mobile` write answers when the request body is larger than bfm
 * accepts.
 *
 * Declared on the route rather than left to Express's default, which is an
 * HTML error page: a status the generated Swift client cannot decode is a
 * status the app meets as a decoding crash rather than as a refusal it can
 * explain. `maxBytes` is carried so the app can say what the ceiling was
 * without a second copy of the number compiled into it.
 *
 * The cap is bfm's own and is enforced here rather than left to the pillar
 * behind it (ADR-046). Forwarding a payload that was always going to be
 * refused would spend the internal network on it first.
 */
export const MobilePayloadTooLargeErrorSchema = z.object({
  code: z.literal('payload_too_large'),
  maxBytes: z.number().int().positive(),
  message: z.string(),
});

export type MobilePayloadTooLargeError = z.infer<typeof MobilePayloadTooLargeErrorSchema>;

/**
 * The largest JSON body a `/mobile` upload may carry, in bytes.
 *
 * Sized between the two things it sits between: eight phone photographs of one
 * long receipt, base64-inflated by a third, still fit — and it stays well under
 * the 20mb `purchases` accepts, so bfm is always the one that refuses. A cap
 * that matched the producer's would leave the two disagreeing at the boundary,
 * which is the case where the phone gets an upstream error for something bfm
 * could have named itself.
 */
export const MOBILE_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Media types the receipt upload accepts.
 *
 * A mirror of `purchases`' own list rather than an import of it — bfm may not
 * depend on a sibling pillar's package — so the two can drift. That drift is
 * survivable in one direction only, which is why the list is closed on a
 * REQUEST field: a type purchases dropped is refused here as a `400` the app
 * can act on, and a type purchases added is simply not offered yet. The
 * opposite arrangement, an open string, would hand the phone a `502` from a
 * producer refusing bytes bfm promised to accept.
 */
export const MOBILE_RECEIPT_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
] as const;

export const MobileReceiptPartSchema = z.object({
  mediaType: z.enum(MOBILE_RECEIPT_MEDIA_TYPES),
  /** The file, base64 with no data-URI prefix — `purchases`' own encoding. */
  dataBase64: z.string().min(1),
});

export type MobileReceiptPart = z.infer<typeof MobileReceiptPartSchema>;

/**
 * The purchase a read receipt became, as a confirmation screen draws it.
 *
 * Money is `purchases`' and is mirrored, not reinterpreted — integer cents,
 * the representation that pillar persists and publishes. It differs from the
 * finance leg's decimal dollars for exactly that reason: each producer's own
 * representation survives the trip, because converting is where two services
 * come to disagree about what somebody spent.
 */
export const MobileReceiptPurchaseSchema = z.object({
  id: z.string(),
  /** Merchant as purchases resolved it, or null when it could not. */
  merchantName: z.string().nullable(),
  totalCents: z.number().int(),
  /** ISO 4217, an open string for the reason the mobile transaction schema states. */
  currency: z.string(),
  /**
   * ISO-8601 with a timezone — the receipt's own date when it stated one.
   *
   * A string on the wire rather than `z.iso.datetime()`, matching the mobile
   * transaction detail's `lastEditedTime`, and the reason is what the format
   * keyword becomes downstream: a `date-time` generates a `Foundation.Date`
   * on the iOS client, which decodes or fails. purchases' own contract
   * admits `±HH:MM` offsets as readily as `Z`, so declaring the format here
   * would promise a narrower vocabulary than the producer serves and turn a
   * perfectly valid offset timestamp into a decode failure on a handset. The
   * guarantee is enforced instead where a bad value can still be turned into
   * an operator-visible 502 — `api/purchases/wire.ts` validates it against
   * purchases' own pattern before it is ever published here.
   */
  orderedAt: z.string(),
  /** Line items read off the receipt. What "12 items, $84.20" is drawn from. */
  itemCount: z.number().int().nonnegative(),
});

export type MobileReceiptPurchase = z.infer<typeof MobileReceiptPurchaseSchema>;

/** One line as the model read it off the paper, verbatim. */
export const MobileExtractedLineSchema = z.object({
  /** Including receipt-speak abbreviations. Not normalised. */
  description: z.string(),
  /** Printed money for the whole line, as printed — `$12.00`, `4.50`, `12`. */
  amount: z.string(),
  /**
   * Only when the receipt states one. `null` is different from `1`: the paper
   * did not say, and inventing a `1` makes a weighed line look like a counted
   * one.
   */
  quantity: z.number().int().positive().nullable(),
  /** `$4.50/kg`, `2 @ $3.00` — whatever qualifies the price, verbatim. */
  unitNote: z.string().nullable(),
});

export type MobileExtractedLine = z.infer<typeof MobileExtractedLineSchema>;

/**
 * What the model read off a receipt whose figures did not reconcile.
 *
 * Money is left as the strings the model transcribed rather than parsed into
 * cents, because that is what the reading IS — a transcription of what is
 * printed, not a fact. `purchases` only converts once its gate has agreed with
 * the receipt's own total, which by definition has not happened on this arm,
 * and a phone that showed a parsed figure here would be presenting a number
 * nobody has checked as though it had been.
 *
 * Every field carried is one the review screen has a label for. The producer's
 * inferred `timeZone` is not: it exists to place a purchase in time, which is
 * not something a reviewer can check against the paper, and a field nothing
 * draws is weight on cellular for nothing.
 */
export const MobileExtractedReceiptSchema = z.object({
  /** As printed at the top. `null` is a valid reading, not a failure. */
  merchantName: z.string().nullable(),
  /** The shop's address, verbatim. */
  address: z.string().nullable(),
  /** `YYYY-MM-DD`, as the receipt's own date format resolved. */
  purchasedOn: z.string().nullable(),
  /** `HH:MM`, 24-hour, when the receipt prints one. */
  purchasedAt: z.string().nullable(),
  /** ISO-4217, as printed or inferred from the currency symbol. */
  currency: z.string().nullable(),
  /** The total the receipt states — what everything else is checked against. */
  total: z.string(),
  /** Stated tax, when the receipt separates it. */
  tax: z.string().nullable(),
  /** Stated discounts, as positive printed amounts. */
  discounts: z.array(z.string()),
  /** Fees the merchant added. Separate from discounts: they move the total the other way. */
  surcharges: z.array(z.string()),
  /** The delivery charge the receipt states, or `null` when it states no amount. */
  shipping: z.string().nullable(),
  lines: z.array(MobileExtractedLineSchema),
  /**
   * Where the model could not read the paper — a torn corner, a smudged line.
   * What lets a reviewer tell "the model is wrong" from "the receipt is
   * damaged".
   */
  unreadableNotes: z.array(z.string()),
});

export type MobileExtractedReceipt = z.infer<typeof MobileExtractedReceiptSchema>;

/** One thing the producer's arithmetic gate objected to, in the receipt's terms. */
export const MobileReceiptProblemSchema = z.object({
  /**
   * The producer's own failure kind, left an open string: a gate that grows a
   * seventh reason must not make every needs-review upload fail to decode on a
   * handset that has not been updated. Nothing on the phone branches on it —
   * it selects a phrasing, and an unrecognised code falls back to a generic
   * one rather than sinking the outcome.
   */
  code: z.string(),
  detail: z.string(),
  /**
   * How far the receipt's own arithmetic falls from the total it states, in
   * cents, present only on a sum mismatch. Negative means the components fall
   * short.
   *
   * The one number on this arm that makes a refusal specific rather than
   * categorical: "the lines don't add up" is a restatement of the outcome,
   * "$2.40 short" is something a reviewer can go and find on the paper.
   */
  deltaCents: z.number().int().nullable(),
});

/**
 * What became of an uploaded receipt.
 *
 * Three arms rather than success-or-failure, because the producer's three
 * outcomes are materially different and the app draws each one differently: a
 * reading that agreed with the receipt's own total is a purchase, a reading
 * that did not is a real purchase awaiting a human, and a receipt the model
 * could not read at all is neither. Collapsing any two loses the distinction
 * the whole feature rests on.
 *
 * `needs-review` carries the reading the model produced as well as the gate's
 * objections. The two are one answer: an objection names a discrepancy, and
 * the only way to settle it is against what was read. A phone told a receipt
 * needs review and shown nothing that was read has been told the outcome and
 * withheld the reason, which is not a smaller payload — it is a screen that
 * cannot do the one thing it exists for.
 *
 * What is NOT carried is the stored parts' `pops://` URIs. They address blobs
 * inside `purchases`, and no mobile route serves those bytes; a handset given
 * one holds a pointer it cannot follow. `receiptCount` is the part of it the
 * screen actually draws.
 */
export const MobileReceiptOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('created'),
    purchase: MobileReceiptPurchaseSchema,
    /** True when these exact bytes had already been stored — a retry, not a duplicate. */
    alreadyStored: z.boolean(),
  }),
  z.object({
    kind: z.literal('needs-review'),
    /** How many parts `purchases` stored for this receipt. */
    receiptCount: z.number().int().positive(),
    problems: z.array(MobileReceiptProblemSchema),
    extracted: MobileExtractedReceiptSchema,
  }),
  z.object({
    kind: z.literal('unreadable'),
    /** How many parts `purchases` stored for this receipt. */
    receiptCount: z.number().int().positive(),
    reason: z.string(),
  }),
]);

export type MobileReceiptOutcome = z.infer<typeof MobileReceiptOutcomeSchema>;
