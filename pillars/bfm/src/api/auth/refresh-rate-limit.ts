/**
 * The request budget in front of `POST /devices/challenge` and
 * `POST /devices/refresh`.
 *
 * The third internet-facing surface on this pillar, and the most expensive per
 * request: `/mobile` costs an HMAC verification, pairing costs a lookup, and a
 * refresh costs an ECDSA P-256 verification plus a write. It is also the one
 * surface that allocates — every challenge is an entry in the nonce map.
 *
 * Mechanism, client key and tier ordering: `api/tiered-rate-limit.ts`, shared
 * with the other two. Only the numbers are chosen here.
 *
 * ## One budget across both routes, not one each
 *
 * They are two halves of a single exchange — a phone that fetches a nonce is
 * about to refresh, and a refresh without a nonce cannot succeed — so two
 * separate budgets would just be one budget an attacker could spend twice by
 * alternating paths. `app.ts` mounts this same limiter instance on both.
 *
 * It is NOT shared with the pairing exchange, for the reason that file gives:
 * budgets that answer different questions must not be able to exhaust each
 * other. A handset failing to refresh must never be what stops another one
 * from pairing.
 *
 * ## The invariant this file owns
 *
 * {@link REFRESH_GLOBAL_LIMIT} is the ceiling on live entries in the nonce map,
 * and that only holds while `CHALLENGE_TTL_MS` is at or below
 * {@link REFRESH_RATE_LIMIT_WINDOW_MS} — a nonce that outlived the window that
 * bounded its issuance would let two windows' worth accumulate.
 * `refresh-challenge.ts` states the same constraint from the other side, and a
 * test asserts the two constants against each other so neither can be raised
 * alone.
 */
import { createTieredRateLimit, type TieredRateLimit } from '../tiered-rate-limit.js';

/**
 * Five minutes.
 *
 * Longer than the `/mobile` window because the honest traffic here is far
 * sparser — an access token lives ten minutes, so a working handset passes
 * through this surface roughly twice per ten, against dozens of `/mobile`
 * calls a minute. A one-minute window would make the per-client number below
 * either meaninglessly large or a limit real retries could hit.
 */
export const REFRESH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Per client address, per window.
 *
 * A phone needs two requests per refresh and refreshes about once per window.
 * Twenty is an order of magnitude above that, which covers a flapping
 * connection retrying, and is still small enough that a single source cannot
 * spend a meaningful share of the ceiling below.
 */
export const REFRESH_PER_CLIENT_LIMIT = 20;

/**
 * Across both routes, per window, whoever is calling.
 *
 * Ten clients' worth — the same ratio the other two surfaces use. It is also
 * the number that bounds the nonce map, at twice this many live entries:
 * `rate-limit.ts` is a fixed-window counter, so a caller can spend one
 * window's budget just before a boundary and the next one's just after, and a
 * nonce TTL as long as the window keeps both alive at once.
 * `refresh-challenge.ts` carries the full argument. Raising this raises that
 * ceiling by two, which is the second thing to think about before touching it.
 */
export const REFRESH_GLOBAL_LIMIT = 200;

export interface RefreshRateLimitOptions {
  perClientLimit?: number;
  globalLimit?: number;
  windowMs?: number;
  /** Injectable clock, matching `createRateLimiter`'s own option name. */
  now?: () => number;
}

export function createRefreshRateLimit(options: RefreshRateLimitOptions = {}): TieredRateLimit {
  const now = options.now;
  return createTieredRateLimit({
    perClientLimit: options.perClientLimit ?? REFRESH_PER_CLIENT_LIMIT,
    globalLimit: options.globalLimit ?? REFRESH_GLOBAL_LIMIT,
    windowMs: options.windowMs ?? REFRESH_RATE_LIMIT_WINDOW_MS,
    ...(now === undefined ? {} : { now }),
  });
}
