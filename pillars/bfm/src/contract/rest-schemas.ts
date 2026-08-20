import { z } from 'zod';

import { MobileCaptureMetadataSchema } from './capture.js';
import { MobileReceiptPartSchema } from './receipt.js';

export {
  MOBILE_RECEIPT_MEDIA_TYPES,
  MOBILE_UPLOAD_MAX_BYTES,
  MobileExtractedLineSchema,
  MobileExtractedReceiptSchema,
  MobilePayloadTooLargeErrorSchema,
  MobileReceiptOutcomeSchema,
  MobileReceiptPartSchema,
  MobileReceiptProblemSchema,
  MobileReceiptPurchaseSchema,
  type MobileExtractedLine,
  type MobileExtractedReceipt,
  type MobilePayloadTooLargeError,
  type MobileReceiptOutcome,
  type MobileReceiptPart,
  type MobileReceiptPurchase,
} from './receipt.js';

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
 * How many parts one receipt may be sent as. Mirrors `purchases`'
 * `MAX_RECEIPT_PARTS` so an upload bfm accepts is not one the producer will
 * reject — the cheaper refusal is the one that never leaves the handset.
 *
 * Kept in this file rather than moving with the rest of the receipt shapes
 * (`receipt.ts`) because `scripts/ci/check-receipt-max-parts-drift.mjs` pins
 * it by this exact path and pattern.
 */
export const MOBILE_RECEIPT_MAX_PARTS = 8;

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
   * What the handset knew that the paper cannot state — see `capture.ts`,
   * which is also where the reason a location is accepted at all lives.
   *
   * One object for the whole submission rather than one per part: several
   * photographs of one long receipt are one capture event, and a client that
   * could say something different about frame three of the same till slip
   * would be describing a different shop.
   *
   * Forwarded verbatim and judged nowhere, for the same reason bfm mints no
   * idempotency key: the pillar that owns the record owns the judgement, and
   * it is the one holding the upload instant a capture time is measured
   * against (ADR-046, ADR-047).
   */
  capture: MobileCaptureMetadataSchema.optional(),
});

export type MobileReceiptUploadBody = z.infer<typeof MobileReceiptUploadBodySchema>;

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
