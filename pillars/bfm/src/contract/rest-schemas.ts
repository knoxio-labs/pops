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
  FALLBACK_MOBILE_CURRENCY,
  MobileTransactionDetailSchema,
  MobileTransactionSchema,
  MobileTransactionsPageSchema,
  type MobileTransaction,
  type MobileTransactionDetail,
  type MobileTransactionsPage,
} from './transaction.js';

// `/mobile/inventory/*`'s wire schemas are NOT re-exported here: unlike
// finance/purchases/receipt, nothing outside `rest-mobile-inventory.ts` and
// `api/inventory/*` needs them, and this file is already at the line budget
// `check-line-budget-headroom` enforces. Import `mobile-inventory-schemas.js`
// directly instead.

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
     * `PATCH /mobile/purchases/:id` refused because the edit targets a
     * field `purchases` has locked for this purchase's reconciliation
     * state (merchant, date or total on a matched or part-matched order).
     * Distinct from `purchase_stale` so the app can draw two different
     * recoveries: re-opening the edit does not help here.
     */
    'purchase_locked',
    /**
     * `PATCH /mobile/purchases/:id` refused because the purchase changed
     * since this edit was opened (`expectedUpdatedAt` no longer matches).
     * The app's recovery is to re-fetch the detail and let the person
     * re-apply their edit, unlike `purchase_locked`.
     */
    'purchase_stale',
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

export {
  MobileMerchantIdentitySchema,
  MobileMonthCurrencyTotalSchema,
  MobileMonthMerchantLeaderSchema,
  MobileMonthSummarySchema,
  MobilePurchaseDetailSchema,
  MobilePurchaseEditSchema,
  MobilePurchaseFieldChangeSchema,
  MobilePurchaseItemSchema,
  MobilePurchaseSchema,
  MobilePurchasesPageSchema,
  MobileUpdatePurchaseBodySchema,
  MobileUpdatePurchaseLineSchema,
  type MobileMerchantIdentity,
  type MobileMonthCurrencyTotal,
  type MobileMonthMerchantLeader,
  type MobileMonthSummary,
  type MobilePurchase,
  type MobilePurchaseDetail,
  type MobilePurchaseEdit,
  type MobilePurchaseFieldChange,
  type MobilePurchaseItem,
  type MobilePurchasesPage,
  type MobileUpdatePurchaseBody,
} from './mobile-purchases-schemas.js';

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

/** One of a merchant's recorded addresses (ADR-053) — what the address picker draws. */
export const MobileAddressSchema = z.object({
  id: z.string(),
  value: z.string(),
});

export type MobileAddress = z.infer<typeof MobileAddressSchema>;

export const MobileAddressListSchema = z.object({
  data: z.array(MobileAddressSchema),
});

/**
 * One `contacts` entity, as the merchant select draws it (POPS-3753) — id and
 * a display name, nothing else. `contacts`' own `Entity` carries a type, an
 * ABN, avatars and more; none of it is what a merchant picker or a "you
 * created this" confirmation shows.
 */
export const MobileMerchantSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type MobileMerchant = z.infer<typeof MobileMerchantSchema>;

export const MobileMerchantListSchema = z.object({
  data: z.array(MobileMerchantSchema),
});

/**
 * One receipt, in order, top to bottom. Several photographs of one piece of
 * paper are one upload and one purchase, not several receipts.
 *
 * No idempotency key. `purchases` content-addresses the bytes, so a phone
 * retrying a timed-out upload sends the same photograph and gets the same
 * purchase back with `alreadyStored` set. A key minted here would be a second
 * dedup rule, and the first time the two disagreed the user would have two
 * purchases for one receipt (ADR-046).
 *
 * No count ceiling on `parts`: a long shop is not told to stop partway
 * through. `MOBILE_UPLOAD_MAX_BYTES` is the only real bound on how many
 * parts one upload can carry — see ADR-052
 * (`docs/architecture/adr-052-receipt-part-count-ceiling.md`).
 */
export const MobileReceiptUploadBodySchema = z.object({
  parts: z.array(MobileReceiptPartSchema).min(1),
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

export {
  BootstrapDeviceSchema,
  BootstrapFeatureSchema,
  BootstrapPillarSchema,
  MOBILE_FEATURE_IDS,
  MobileBootstrapResponseSchema,
  MobileFeatureIdSchema,
  ReachabilitySchema,
  RegistrySourceSchema,
  type BootstrapDevice,
  type BootstrapFeature,
  type BootstrapPillar,
  type KnownMobileFeatureId,
  type MobileBootstrapResponse,
  type MobileFeatureId,
  type Reachability,
  type RegistrySource,
} from './mobile-bootstrap-schemas.js';
