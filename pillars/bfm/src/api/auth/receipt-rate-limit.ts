/**
 * The request budget in front of `POST /mobile/purchases/receipts`, ahead of
 * the general `/mobile` perimeter's own budget and of `requireDevice`.
 *
 * `mobile-rate-limit.ts`'s numbers were chosen when every `/mobile` route was
 * a page of rows out of finance — cheap to answer, and cheap to answer wrong.
 * A receipt upload is neither: bfm buffers up to `MOBILE_UPLOAD_MAX_BYTES`,
 * forwards it to `purchases`, and that pillar spends one Claude vision call
 * reading it. A paired handset spends the read budget on model calls at the
 * same rate it could previously spend it on list pages, and this pillar has
 * no other place that turns a request into real money.
 *
 * The threat this bounds is not a hostile internet — `requireDevice` already
 * stands between an anonymous caller and this route, so nobody without a
 * paired handset's key reaches purchases through here at all. It is a buggy
 * client or a retry loop on a real device: a foregrounding bug that resends
 * on every frame, a network layer that retries a slow response instead of
 * waiting for it, each burning a vision call the household never asked for.
 * Sizing this against that failure mode, not against an attacker with a
 * budget, is why the numbers below are generous for a real shopping trip and
 * still a firm ceiling on how many model calls one goes wrong.
 *
 * Mechanism, client key and tier ordering: `api/tiered-rate-limit.ts`, shared
 * with every other budget on this pillar. Only the numbers are chosen here.
 *
 * A second limiter rather than a wider mount of the general one, for the same
 * reason `PAIRING_PATH` gets its own: the two bound different things, so
 * sharing a counter would let an ordinary run of list-page traffic spend the
 * receipt budget, or a slow morning of receipts lock a handset out of its own
 * transaction list.
 *
 * ## Why a flat per-request cost, not one weighted by part count
 *
 * A receipt sent as eight parts costs `purchases` roughly the same one vision
 * call a single-part receipt does — the model reads a batch of pages in one
 * request, not one call per image (`ingest/receipt/read-receipt.ts`). Weighting
 * by part count would therefore be tracking a number that does not track the
 * cost it is meant to stand in for, in exchange for a second config knob and a
 * second thing a reviewer has to check stays in step with `purchases`' own
 * batching. A flat cost per upload is both simpler and the more accurate model
 * of what is actually being spent.
 */
import { createTieredRateLimit, type TieredRateLimit } from '../tiered-rate-limit.js';

/**
 * Five minutes. Long enough that a real shopping trip — photograph a receipt,
 * wait for the read, photograph the next — fits inside one window rather than
 * rolling over mid-trip; short enough that a runaway client recovers on its
 * own without an operator having to intervene.
 */
export const MOBILE_RECEIPT_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Uploads one client address may make per window.
 *
 * A big grocery run's worth of separate receipts, uploaded one at a time,
 * with room to re-shoot a couple that came back blurry — comfortably above
 * what a person does with a camera in five minutes. A loop resending on every
 * frame hits this in seconds, not minutes, which is the point: the budget
 * exists to make that failure loud and stop it quickly, not to accommodate
 * it.
 */
export const MOBILE_RECEIPT_PER_CLIENT_LIMIT = 20;

/**
 * Uploads the whole route admits per window, whoever is calling.
 *
 * Three clients' worth of the per-client budget — enough for every phone in a
 * household to be mid-shopping-trip at once — and, unlike the per-client
 * tier, the number that actually caps what one window can cost: at most this
 * many vision calls, however many addresses a forged `CF-Connecting-IP` mints.
 * A tighter ratio than the general `/mobile` perimeter's ten-to-one on
 * purpose — that budget bounds an HMAC check; this one bounds a paid API
 * call, and the cost asymmetry is the reason to keep the ceiling closer to
 * the per-client number rather than proportionally as far above it.
 */
export const MOBILE_RECEIPT_GLOBAL_LIMIT = 60;

export interface ReceiptRateLimitOptions {
  perClientLimit?: number;
  globalLimit?: number;
  windowMs?: number;
  /** Injectable clock, matching `createRateLimiter`'s own option name. */
  now?: () => number;
}

/**
 * Build the receipt-upload budget.
 *
 * Mount it on {@link MOBILE_RECEIPT_UPLOAD_PATH} ahead of `requireDevice` and
 * ahead of the route's own `express.json()`, so a caller past its budget
 * costs bfm a map lookup rather than a signature check and a buffered body.
 */
export function createReceiptRateLimit(options: ReceiptRateLimitOptions = {}): TieredRateLimit {
  const now = options.now;
  return createTieredRateLimit({
    perClientLimit: options.perClientLimit ?? MOBILE_RECEIPT_PER_CLIENT_LIMIT,
    globalLimit: options.globalLimit ?? MOBILE_RECEIPT_GLOBAL_LIMIT,
    windowMs: options.windowMs ?? MOBILE_RECEIPT_RATE_LIMIT_WINDOW_MS,
    ...(now === undefined ? {} : { now }),
  });
}
