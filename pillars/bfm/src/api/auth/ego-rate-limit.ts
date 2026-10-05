/**
 * A separate budget for mobile Ego chat turns.
 *
 * The general mobile budget covers cheap row reads. A chat turn can spend
 * model tokens and tool calls, so it gets its own tighter ceiling instead of
 * sharing that counter. This bounds a buggy client or retry loop on a real
 * device; it is not a defence against a hostile internet caller.
 *
 * BFM-13 owns mounting this limiter on the Ego route.
 */
import { createTieredRateLimit, type TieredRateLimit } from '../tiered-rate-limit.js';

/** One minute, matching the mobile request window. */
export const MOBILE_EGO_RATE_LIMIT_WINDOW_MS = 60_000;

/** Chat turns one client may start in a minute. */
export const MOBILE_EGO_PER_CLIENT_LIMIT = 12;

/** Three clients' worth of turns, as a whole-route ceiling. */
export const MOBILE_EGO_GLOBAL_LIMIT = 36;

export interface EgoRateLimitOptions {
  perClientLimit?: number;
  globalLimit?: number;
  windowMs?: number;
  /** Injectable clock, matching `createRateLimiter`'s own option name. */
  now?: () => number;
}

/** Build the independent mobile Ego chat budget. */
export function createEgoRateLimit(options: EgoRateLimitOptions = {}): TieredRateLimit {
  const now = options.now;
  return createTieredRateLimit({
    perClientLimit: options.perClientLimit ?? MOBILE_EGO_PER_CLIENT_LIMIT,
    globalLimit: options.globalLimit ?? MOBILE_EGO_GLOBAL_LIMIT,
    windowMs: options.windowMs ?? MOBILE_EGO_RATE_LIMIT_WINDOW_MS,
    ...(now === undefined ? {} : { now }),
  });
}
