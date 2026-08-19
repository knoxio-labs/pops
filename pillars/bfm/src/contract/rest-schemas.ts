import { z } from 'zod';

import { IsoTimestampSchema } from './iso-timestamp.js';

/**
 * Liveness shape every pillar's `/health` returns. `pillar` is pinned to the
 * literal `bfm` rather than a free string so a misrouted proxy — a request
 * that reached a sibling pillar's health route — fails the client's parse
 * instead of reading as this pillar being up.
 */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  status: z.literal('ok'),
  pillar: z.literal('bfm'),
  version: z.string(),
  ts: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * What the `/mobile` perimeter answers when it refuses a request.
 *
 * The status code is the contract the phone switches on — 401 means refresh,
 * 403 means return to pairing and wipe the keychain — and `code` is the same
 * decision in a form a log line or a crash report can carry. `message` is for
 * a human reading a proxy log; it is never shown to a user and never carries
 * any part of the presented token.
 *
 * They are TWO schemas rather than one with a two-member enum precisely
 * because `code` restates the status. One schema would let the document
 * promise a `401 device_revoked` — a combination the guard cannot produce and
 * a generated client would still have to branch on. A literal per status
 * removes the impossible half from every consumer's type.
 *
 * They live in the contract rather than beside the middleware because the
 * `/mobile/*` routes declare these two statuses on their own ts-rest
 * responses, and two definitions of one wire shape drift.
 *
 * Only one of them is `Mobile`-prefixed, and the asymmetry is the point.
 * `invalid_token` is a statement about a bearer token, which exists only on
 * this perimeter. "This handset is revoked" is a statement about the device,
 * and `POST /devices/refresh` has to make exactly the same one — same shape,
 * same code, same recovery — so the unprefixed name is shared rather than
 * copied, on the same reasoning as {@link RateLimitErrorSchema} below.
 */
export const MobileInvalidTokenErrorSchema = z.object({
  code: z.literal('invalid_token'),
  message: z.string(),
});

export const DeviceRevokedErrorSchema = z.object({
  code: z.literal('device_revoked'),
  message: z.string(),
});

/**
 * Either refusal, for the one place that handles both — the guard's own
 * response helper, and the test that parses whichever came back. No contract
 * route references this: a route knows which status it is describing.
 */
export const MobileAuthErrorSchema = z.discriminatedUnion('code', [
  MobileInvalidTokenErrorSchema,
  DeviceRevokedErrorSchema,
]);

export type MobileInvalidTokenError = z.infer<typeof MobileInvalidTokenErrorSchema>;
export type DeviceRevokedError = z.infer<typeof DeviceRevokedErrorSchema>;
export type MobileAuthError = z.infer<typeof MobileAuthErrorSchema>;

/**
 * The one 403 body, written once.
 *
 * Two independent places answer it — the `/mobile` guard on every request, and
 * `POST /devices/refresh` when the token is fine but its handset is not — and
 * a caller comparing the two responses should find them identical, because the
 * fact they report is identical. Two copies of the sentence would be two
 * things to keep in step for no benefit.
 *
 * It lives beside the schema rather than beside either caller for the same
 * reason the schema does: neither of them owns it.
 */
export const DEVICE_REVOKED_ERROR: DeviceRevokedError = {
  code: 'device_revoked',
  message: 'This device has been revoked. Pair again.',
};

/**
 * What an internet-facing surface answers when a caller exceeds its request
 * budget. Shared by the `/mobile` perimeter (POPS-1468) and the pairing
 * exchange (POPS-1374) — two budgets charged for different reasons, giving the
 * phone the same thing to act on. Unprefixed for that reason, unlike the
 * `Mobile*` shapes around it.
 *
 * Separate from {@link MobileAuthErrorSchema} rather than another `code` in
 * its enum, because a 429 is not a statement about the caller's credentials:
 * it is reachable with a perfectly good token — and on the pairing route, with
 * a perfectly good code — and the recovery, back off then retry the same
 * request unchanged, is none of the recoveries that schema's statuses select
 * between.
 *
 * `retryAfterSeconds` duplicates the `Retry-After` header on purpose. The
 * header is the standard and a proxy may act on it; the body is what the
 * generated Swift client can read as a typed field without reaching for
 * `HTTPURLResponse.allHeaderFields`.
 */
export const RateLimitErrorSchema = z.object({
  code: z.literal('rate_limited'),
  message: z.string(),
  retryAfterSeconds: z.number().int().positive(),
});

export type RateLimitError = z.infer<typeof RateLimitErrorSchema>;

/**
 * What a `/mobile` route answers when the request itself is wrong — as opposed
 * to unauthenticated (`MobileAuthErrorSchema`) or upstream-broken
 * (`MobileUpstreamErrorSchema`). Always a 400, and always the app's own bug.
 *
 * Two codes because the app can act on one of them and not the other.
 * `invalid_cursor` means restart the list from the top — a recovery the app
 * can perform. `invalid_request` means it built a request this server does not
 * accept, which no retry fixes.
 *
 * Both arrive here even though only one comes from a handler: contract-level
 * validation (`limit` past its cap, say) is rejected by ts-rest before any
 * handler runs, and its native error body is nothing like this shape. `app.ts`
 * reshapes those, because a 400 that does not match the one the route declares
 * is a 400 the generated client cannot decode.
 */
export const MobileRequestErrorSchema = z.object({
  code: z.enum(['invalid_cursor', 'invalid_request']),
  message: z.string(),
});

export type MobileRequestError = z.infer<typeof MobileRequestErrorSchema>;

/**
 * What a `/mobile` route answers when a pillar behind bfm could not serve the
 * request.
 *
 * The point of this shape is that it is NOT an empty success. A list endpoint
 * that answers `[]` when finance is down has told the phone "you have no
 * transactions", which is a lie the user cannot distinguish from the truth;
 * a bare 500 tells it nothing it can act on.
 *
 * `code` preserves the gateway's distinctions all the way to the app —
 * "nobody answered" and "answered, but not with a contract we can call" are
 * different operational facts and stay different values. `retryable` is the
 * one decision the app actually makes, carried explicitly rather than
 * re-derived from the status code in a second, drifting table on the client.
 */
export const MobileUpstreamErrorSchema = z.object({
  code: z.enum([
    'upstream_unavailable',
    'upstream_degraded',
    'upstream_contract_mismatch',
    'upstream_misconfigured',
    'upstream_invalid_request',
    'upstream_conflict',
    'not_found',
  ]),
  /** The pillar that could not serve it, by registered id. Operator-facing. */
  pillar: z.string(),
  /** Whether trying the same request again can plausibly succeed. */
  retryable: z.boolean(),
  message: z.string(),
});

export type MobileUpstreamError = z.infer<typeof MobileUpstreamErrorSchema>;

/**
 * The one currency value bfm emits today. Finance carries no currency field
 * at all — the fleet is single-currency and has always assumed it — so this
 * is what {@link import('../api/finance/wire.js').toMobileTransaction} stamps
 * onto every row rather than something finance sent.
 *
 * Not the source of a `z.literal` on the wire schema — see
 * {@link MobileTransactionSchema.shape.currency} for why the wire type must
 * not narrow to this one value.
 */
export const MOBILE_CURRENCY = 'AUD';

/**
 * One row of the mobile transaction list. Deliberately only what a list row
 * renders — the detail screen fetches the rest, and a phone on cellular does
 * not pay for fields it will not draw.
 */
export const MobileTransactionSchema = z.object({
  id: z.string(),
  description: z.string(),
  /**
   * Signed decimal dollars, mirroring finance's own wire field exactly:
   * expenses are negative, income positive. Finance persists integer cents
   * and converts once at its REST edge; re-deriving cents here would be a
   * second money representation and a second chance to round differently.
   */
  amount: z.number(),
  /**
   * ISO 4217 code. Left an open string rather than an `enum`/`literal` on
   * purpose, for the same reason as {@link MobileTransactionSchema.shape.type}
   * below: this app is distributed rather than deployed, so a build already on
   * a phone keeps calling the contract it was compiled against for as long as
   * its owner declines to update. A closed enum here becomes a closed Swift
   * enum on the generated client — the day bfm emits a second currency, every
   * installed build fails to decode it, and because this field sits inside an
   * array element, one unrecognised value fails the whole page, not just the
   * row it is on. bfm only ever emits {@link MOBILE_CURRENCY} today; that is a
   * fact about the current mapping, not a constraint the wire type should
   * assert.
   */
  currency: z.string(),
  /** Date-only `YYYY-MM-DD`. Finance's transactions carry no time component. */
  date: z.string(),
  /**
   * Finance's semantic transaction type (`purchase`, `income`, `transfer`, …).
   * Left an open string rather than an enum on purpose: finance adding a type
   * must not make every transaction fail to render on the phone. It never
   * carries direction — that is the sign of {@link MobileTransactionSchema.shape.amount}.
   */
  type: z.string(),
  /** Display name of the counterparty, or null when finance has none. */
  entityName: z.string().nullable(),
  tags: z.array(z.string()),
});

export type MobileTransaction = z.infer<typeof MobileTransactionSchema>;

/** The fuller record behind one list row, for the detail screen. */
export const MobileTransactionDetailSchema = MobileTransactionSchema.extend({
  account: z.string(),
  entityId: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  notes: z.string().nullable(),
  /** The other leg of a matched transfer, when finance paired one. */
  relatedTransactionId: z.string().nullable(),
  /** ISO-8601 timestamp of finance's last write to this row. */
  lastEditedTime: z.string(),
});

export type MobileTransactionDetail = z.infer<typeof MobileTransactionDetailSchema>;

/**
 * One page of the transaction list.
 *
 * `nextCursor` is opaque and `null` on the last page — the app asks for the
 * next page by echoing it back, never by counting rows. Cursors rather than
 * offsets because the underlying list mutates: an import that lands while
 * somebody is scrolling shifts every offset by one, so an offset walk re-shows
 * a row it already served and skips one it never did.
 */
export const MobileTransactionsPageSchema = z.object({
  data: z.array(MobileTransactionSchema),
  nextCursor: z.string().nullable(),
});

export type MobileTransactionsPage = z.infer<typeof MobileTransactionsPageSchema>;

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

/**
 * How many parts one receipt may be sent as. Mirrors `purchases`'
 * `MAX_RECEIPT_PARTS` so an upload bfm accepts is not one the producer will
 * reject — the cheaper refusal is the one that never leaves the handset.
 */
export const MOBILE_RECEIPT_MAX_PARTS = 8;

export const MobileReceiptPartSchema = z.object({
  mediaType: z.enum(MOBILE_RECEIPT_MEDIA_TYPES),
  /** The file, base64 with no data-URI prefix — `purchases`' own encoding. */
  dataBase64: z.string().min(1),
});

export type MobileReceiptPart = z.infer<typeof MobileReceiptPartSchema>;

/**
 * One receipt, in order, top to bottom. Several photographs of one piece of
 * paper are one upload and one purchase, not several receipts.
 *
 * No idempotency key. `purchases` content-addresses the bytes, so a phone
 * retrying a timed-out upload sends the same photograph and gets the same
 * purchase back with `alreadyStored` set. A key minted here would be a second
 * dedup rule, and the first time the two disagreed the user would have two
 * purchases for one receipt (ADR-046).
 */
export const MobileReceiptUploadBodySchema = z.object({
  parts: z.array(MobileReceiptPartSchema).min(1).max(MOBILE_RECEIPT_MAX_PARTS),
  /**
   * When the shutter fired, by the handset's own clock.
   *
   * Optional, and forwarded verbatim. `purchases` decides what to do with it
   * — it replaces the upload instant for a receipt whose paper states no
   * date, and is discarded outright if it names a moment that could not have
   * happened. None of that judgement is bfm's, for the same reason the
   * dedup rule is not: two pillars deciding the same question is two answers
   * the first time they disagree.
   *
   * The pattern is `purchases`' own `IsoTimestampSchema`, offsets included,
   * so a value bfm accepts is not one the producer will refuse — the cheaper
   * refusal is the one that never leaves the handset.
   */
  capturedAt: IsoTimestampSchema.optional(),
  /**
   * The IANA zone the handset was in, e.g. `Australia/Sydney`.
   *
   * Not validated against the runtime here. bfm's clock and the producer's
   * are different processes on different images, so a zone this one happens
   * not to know is a refusal the user cannot act on; `purchases` checks it
   * against its own runtime and falls back when it does not resolve.
   *
   * A zone, not coordinates. Nothing on this surface accepts a location: the
   * producer reads one off the photograph's own EXIF where there is one
   * (ADR-047), and a device that stripped its EXIF contributes none
   * (POPS-2326).
   */
  timeZone: z.string().min(1).max(64).optional(),
});

export type MobileReceiptUploadBody = z.infer<typeof MobileReceiptUploadBodySchema>;

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
  /** ISO 4217, an open string for the reason {@link MobileTransactionSchema} states. */
  currency: z.string(),
  /**
   * ISO-8601 with a timezone — the receipt's own date when it stated one.
   *
   * A string on the wire rather than `z.iso.datetime()`, matching
   * {@link MobileTransactionDetailSchema.shape.lastEditedTime}, and the reason
   * is what the format keyword becomes downstream: a `date-time` generates a
   * `Foundation.Date` on the iOS client, which decodes or fails. purchases'
   * own contract admits `±HH:MM` offsets as readily as `Z`, so declaring the
   * format here would promise a narrower vocabulary than the producer serves
   * and turn a perfectly valid offset timestamp into a decode failure on a
   * handset. The guarantee is enforced instead where a bad value can still be
   * turned into an operator-visible 502 — `api/purchases/wire.ts` validates it
   * against purchases' own pattern before it is ever published here.
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

/**
 * How reachable one member of the federation is, as bfm observed it.
 *
 * Four values rather than a boolean, and the same four the cross-pillar
 * gateway already speaks (`src/api/pillars/gateway.ts`), so the answer bfm
 * gives the phone here cannot disagree with the answer a real call gives it a
 * moment later:
 *
 * - `healthy` — answering, and serving a contract bfm could call.
 * - `degraded` — the registry is mid-reconcile about it, and a call would come
 *   back `degraded` too. Worth retrying.
 * - `unavailable` — nobody answered.
 * - `contract-mismatch` — answered, but not with a contract bfm can call.
 *
 * The last two are the pair that must never collapse. "Not answering" and
 * "registered but uncallable" send an operator to different places, and the
 * one moment this endpoint earns its keep is when the fleet is half-broken —
 * exactly when a boolean has thrown the useful half away.
 */
export const ReachabilitySchema = z.enum([
  'healthy',
  'degraded',
  'unavailable',
  'contract-mismatch',
]);

export type Reachability = z.infer<typeof ReachabilitySchema>;

/**
 * The mobile surfaces bfm knows how to serve.
 *
 * A plain string on the wire, not a `z.enum`. This field sits inside every
 * element of the `features` array on `GET /mobile/bootstrap` — the app's
 * first authenticated call — so a closed enum here is the currency/type
 * hazard already resolved for `MobileTransactionSchema` (see the wire-shape
 * test's comment there), except sharper: a build already on a handset
 * decodes the WHOLE bootstrap payload or none of it, not just the one row
 * carrying the unrecognised value. The day bfm ships a second feature id,
 * every installed build that predates it would fail to launch, on hardware
 * the operator cannot roll forward (ADR-043).
 *
 * `MOBILE_FEATURE_IDS` below is where the closed, exhaustive-switch-friendly
 * list still lives for code written against this pillar today — it is a
 * compile-time convenience, not a wire contract.
 */
export const MobileFeatureIdSchema = z.string();

export type MobileFeatureId = z.infer<typeof MobileFeatureIdSchema>;

/**
 * The known feature ids, closed, for call sites in this pillar that want
 * exhaustiveness now. Never used as the wire schema — see
 * `MobileFeatureIdSchema` for why.
 */
export const MOBILE_FEATURE_IDS = ['transactions', 'receipt-capture'] as const;

export type KnownMobileFeatureId = (typeof MOBILE_FEATURE_IDS)[number];

/**
 * Where the pillar list came from — the SDK discovery cache's own vocabulary,
 * plus `unavailable` for the case it could not answer at all.
 *
 * The phone needs it to know how far to trust the rest of the payload. A
 * `stale-fallback` list is last-known-good rather than current, and an
 * `unavailable` one carries no pillars and no features — which is a different
 * claim from a federation that genuinely has none.
 */
export const RegistrySourceSchema = z.enum(['fresh', 'cached', 'stale-fallback', 'unavailable']);

export type RegistrySource = z.infer<typeof RegistrySourceSchema>;

export const BootstrapPillarSchema = z.object({
  id: z.string(),
  reachability: ReachabilitySchema,
});

/**
 * A feature carries its own reachability rather than the id of the pillar
 * behind it. That is what keeps the promise the app is built on: it renders
 * what the server says is available, and never has to learn the federation's
 * topology in order to explain why something is missing.
 */
export const BootstrapFeatureSchema = z.object({
  id: MobileFeatureIdSchema,
  reachability: ReachabilitySchema,
});

/**
 * The device as bfm now holds it. `lastSeenAt` is the value this very request
 * wrote rather than the one it superseded, so the response and the row agree.
 */
export const BootstrapDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastSeenAt: z.iso.datetime(),
});

export const MobileBootstrapResponseSchema = z.object({
  device: BootstrapDeviceSchema,
  registry: z.object({ source: RegistrySourceSchema }),
  pillars: z.array(BootstrapPillarSchema),
  features: z.array(BootstrapFeatureSchema),
});

export type BootstrapDevice = z.infer<typeof BootstrapDeviceSchema>;
export type BootstrapPillar = z.infer<typeof BootstrapPillarSchema>;
export type BootstrapFeature = z.infer<typeof BootstrapFeatureSchema>;
export type MobileBootstrapResponse = z.infer<typeof MobileBootstrapResponseSchema>;
