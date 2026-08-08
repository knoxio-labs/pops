import { z } from 'zod';

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
 * It lives in the contract rather than beside the middleware because the
 * `/mobile/*` routes declare these two statuses on their own ts-rest
 * responses, and two definitions of one wire shape drift.
 */
export const MobileAuthErrorSchema = z.object({
  code: z.enum(['invalid_token', 'device_revoked']),
  message: z.string(),
});

export type MobileAuthError = z.infer<typeof MobileAuthErrorSchema>;

/**
 * What the `/mobile` perimeter answers when a caller exceeds its request
 * budget (POPS-1468).
 *
 * Separate from {@link MobileAuthErrorSchema} rather than another `code` in
 * its enum, because a 429 is not a statement about the caller's credentials:
 * it is reachable with a perfectly good token, and the phone's recovery —
 * back off, then retry the same request unchanged — is neither of the two
 * recoveries that schema's statuses select between.
 *
 * `retryAfterSeconds` duplicates the `Retry-After` header on purpose. The
 * header is the standard and a proxy may act on it; the body is what the
 * generated Swift client can read as a typed field without reaching for
 * `HTTPURLResponse.allHeaderFields`.
 */
export const MobileRateLimitErrorSchema = z.object({
  code: z.literal('rate_limited'),
  message: z.string(),
  retryAfterSeconds: z.number().int().positive(),
});

export type MobileRateLimitError = z.infer<typeof MobileRateLimitErrorSchema>;

/**
 * What a `/mobile` route answers when the request itself is wrong — as opposed
 * to unauthenticated (`MobileAuthErrorSchema`) or upstream-broken
 * (`MobileUpstreamErrorSchema`). Always a 400, and always the app's own bug.
 */
export const MobileRequestErrorSchema = z.object({
  code: z.enum(['invalid_cursor']),
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
 * The currency every amount on the mobile surface is denominated in.
 *
 * Finance carries no currency field at all — the fleet is single-currency and
 * has always assumed it. Stating the assumption on the wire rather than
 * leaving the phone to guess is the whole point: it is a `literal`, so the
 * generated Swift client gets a constant, and the day finance grows real
 * multi-currency support this contract fails to describe it loudly instead of
 * mislabelling somebody's money.
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
  currency: z.literal(MOBILE_CURRENCY),
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
