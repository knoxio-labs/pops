import { z } from 'zod';

import { MobileCaptureMetadataSchema } from './capture.js';
import { MobileReceiptPartSchema } from './receipt.js';

export {
  MobileAccountBalancePointSchema,
  MobileAccountDetailSchema,
  MobileAccountSchema,
  MobileAccountsPageSchema,
  type MobileAccount,
  type MobileAccountBalancePoint,
  type MobileAccountDetail,
  type MobileAccountsPage,
} from './account.js';

export {
  MOBILE_CURRENCY,
  MobileTransactionDetailSchema,
  MobileTransactionSchema,
  MobileTransactionsPageSchema,
  type MobileTransaction,
  type MobileTransactionDetail,
  type MobileTransactionsPage,
} from './transaction.js';

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
 * The third refusal on this perimeter, and the one that is not about
 * credentials at all (ADR-048).
 *
 * The token verified and the handset is trusted; this device's grant simply
 * does not cover the route it asked for. That makes it a `403` alongside
 * `device_revoked` and a completely different instruction: refreshing changes
 * nothing, and returning to pairing would destroy a working credential over a
 * screen the device was never entitled to open. The app's recovery is to stop
 * offering the feature, not to end the session.
 *
 * `capability` names what the route required rather than what the grant holds.
 * A refusal that enumerated the grant would hand an attacker who reached this
 * far a map of everything else the handset can do, for no gain to the app —
 * which only needs to know which door it just found locked.
 */
export const MobileCapabilityDeniedErrorSchema = z.object({
  code: z.literal('capability_not_granted'),
  message: z.string(),
  capability: z.string(),
});

export type MobileCapabilityDeniedError = z.infer<typeof MobileCapabilityDeniedErrorSchema>;

/**
 * What a `/mobile` route's `403` can be, either way round.
 *
 * A union rather than one schema with a two-member `code` enum, on the same
 * reasoning that keeps 401 and 403 apart above: the two bodies do not carry
 * the same fields — a revocation has no capability to name — and a shape whose
 * `capability` was optional would have every consumer branch on a field the
 * document could not tell it when to expect.
 */
export const MobileForbiddenErrorSchema = z.discriminatedUnion('code', [
  DeviceRevokedErrorSchema,
  MobileCapabilityDeniedErrorSchema,
]);

export type MobileForbiddenError = z.infer<typeof MobileForbiddenErrorSchema>;

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
    /**
     * The producer holds the record and will not give it in the form asked
     * for — a receipt that is a PDF, asked for as an image. Settled: the app
     * draws its placeholder and does not ask again. Only routes that request
     * a particular representation declare the 415 this rides on.
     */
    'upstream_unsupported_media',
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
 * One row of the mobile purchases list.
 *
 * Everything a row draws and nothing else. Two of these fields are the whole
 * reason this shape exists rather than a proxy of `purchases`' own record:
 * `itemCount` and `receiptUri` are aggregates the producer computes for the
 * page, so a list of twenty orders is one request rather than twenty-one.
 */
export const MobilePurchaseSchema = z.object({
  id: z.string(),
  /** Display name of the merchant, or null when purchases resolved none. */
  merchantName: z.string().nullable(),
  /**
   * Integer cents, mirroring `purchases`' own wire field exactly. The finance
   * leg beside this one mirrors decimal dollars because that is what finance
   * publishes; normalising the two here would put a conversion and a rounding
   * rule between a producer and a screen.
   */
  totalCents: z.int(),
  /** ISO 4217, as the order states it. Open string — see {@link MobileTransactionSchema.shape.currency}. */
  currency: z.string(),
  /**
   * The calendar day the order is dated, `YYYY-MM-DD`.
   *
   * A DAY, not an instant, because that is what a row renders and what the
   * reader means by "when". `purchases` stores the instant in UTC and the
   * offset it was placed at separately, and the day is computed here from
   * the pair — the local day where the order happened — rather than left to
   * a client that would resolve it in whatever zone the handset is currently
   * standing in. A phone that flies to another timezone must not re-date a
   * purchase it already showed.
   *
   * Falls back to the day in UTC for an order whose offset that pillar never
   * recorded, which is every row written before it had a column for one.
   */
  orderedOn: z.string(),
  /** How many lines the order has. `0` is normal for a receipt read as a total alone. */
  itemCount: z.int().min(0),
  /**
   * Reconciliation state, verbatim from `purchases`: `awaiting_settlement`,
   * `linked`, `partial`, `settled_cash`, `ignored`.
   *
   * An open string rather than an enum, and NOT collapsed to a boolean.
   * `awaiting_settlement` is a normal permanent state rather than a problem,
   * and `partial` is neither settled nor unsettled — a `settled: false` would
   * make two different facts look like one. Open for the distribution reason
   * every other vocabulary on this wire is open: a value added by the producer
   * must not fail the whole page's decode on an installed build.
   */
  status: z.string(),
  /**
   * The `pops://` URI of the order's receipt, or null when it has none.
   *
   * A reference rather than the image: a page of orders carrying inline
   * base64 is a megabyte on cellular, and the same receipt would be re-sent
   * every time it appeared. Nothing serves these bytes yet — the phone can
   * key a cache on it and recognise two rows as the same receipt, and cannot
   * draw it. See the pillar README.
   */
  receiptUri: z.string().nullable(),
});

export type MobilePurchase = z.infer<typeof MobilePurchaseSchema>;

/** One line of an order, as the detail screen lists it. */
export const MobilePurchaseItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.int().min(1),
  /** What the line cost in total, integer cents. Not the unit price times quantity — the source states it. */
  lineTotalCents: z.int(),
});

export type MobilePurchaseItem = z.infer<typeof MobilePurchaseItemSchema>;

/**
 * The fuller record behind one list row.
 *
 * It adds the breakdown and the lines, and it adds `orderedAt` beside the day
 * — the instant, offset included, for anything that genuinely needs one. The
 * day stays authoritative for rendering: a client must never re-derive
 * `orderedOn` from `orderedAt`, which is how a purchase made at 9pm comes to
 * show yesterday's date on a phone that has since moved west.
 */
export const MobilePurchaseDetailSchema = MobilePurchaseSchema.extend({
  /** ISO-8601 with the offset `purchases` recorded. Evidence, not a rendering instruction. */
  orderedAt: z.string(),
  subtotalCents: z.int(),
  taxCents: z.int(),
  shippingCents: z.int(),
  discountCents: z.int(),
  /** A fee the merchant added: a card surcharge, a small-order fee. */
  surchargeCents: z.int(),
  /** Where the order came from — an adapter id, or the receipt drop-zone. Open string. */
  source: z.string(),
  items: z.array(MobilePurchaseItemSchema),
});

export type MobilePurchaseDetail = z.infer<typeof MobilePurchaseDetailSchema>;

/**
 * One page of the purchases list.
 *
 * Same shape as {@link MobileTransactionsPageSchema} and the same rule: the
 * cursor is opaque, `null` on the last page, and the app asks for the next
 * page by echoing it back rather than by counting rows.
 */
export const MobilePurchasesPageSchema = z.object({
  data: z.array(MobilePurchaseSchema),
  nextCursor: z.string().nullable(),
});

export type MobilePurchasesPage = z.infer<typeof MobilePurchasesPageSchema>;

/**
 * The bytes behind a list row's `receiptUri`, or behind a detail screen's.
 *
 * Base64 in JSON, matching the upload leg in the other direction and matching
 * what `purchases` serves: one representation of these bytes across the whole
 * federation, describable in the contract the Swift client is generated from.
 *
 * `sha256` is echoed rather than assumed from the request so a client that
 * pipelined several can match answers to asks without holding the order.
 */
export const MobileReceiptBytesSchema = z.object({
  sha256: z.string(),
  /** `image/jpeg` for a thumbnail; whatever it was uploaded as for the original. */
  mediaType: z.string(),
  byteLength: z.int(),
  dataBase64: z.string(),
});

export type MobileReceiptBytes = z.infer<typeof MobileReceiptBytesSchema>;

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
export const MOBILE_FEATURE_IDS = [
  'transactions',
  'accounts',
  'purchases',
  'receipt-capture',
] as const;

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
  /**
   * What this handset's grant holds (ADR-048), so the app can decline to offer
   * what it would only be refused for.
   *
   * Open strings rather than an enum, for the reason every other vocabulary on
   * this wire is open: the app is distributed rather than deployed, so a build
   * already on a phone must be able to decode a payload naming a capability
   * that build has never heard of. It ignores the ones it does not know, which
   * is exactly right — a capability an installed build cannot use is one it
   * has no screen for.
   *
   * The grant, not the vocabulary. Two devices can be told different things
   * here, and that is the point of the model.
   */
  capabilities: z.array(z.string()),
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
