/**
 * The request budget in front of every `/mobile/*` route — the first thing an
 * unauthenticated caller meets, ahead of `requireDevice` and ahead of the body
 * parser.
 *
 * `requireDevice` fails closed and fails cheap, but "cheap" is per request and
 * nothing bounded how often one could arrive: every attempt costs an HMAC
 * verification, and every signature-valid attempt costs an indexed lookup on
 * top. Cheap and unbounded is still unbounded, and this hostname has
 * Cloudflare Access bypassed (POPS-1389), so there is no other limiter in
 * front of it.
 *
 * The mechanism — two tiers, the client key they are charged against, and why
 * the coarse one is charged first — is `api/tiered-rate-limit.ts`, shared with
 * the pairing exchange. What is chosen here is the numbers.
 *
 * ## What it counts
 *
 * Every `/mobile/*` request, authenticated or not. The tiers sit ahead of the
 * guard precisely so an anonymous caller never reaches the HMAC, which means
 * they cannot know whether a request was going to succeed. Both limits are set
 * far above what a household of handsets generates, so a device past the guard
 * is unaffected; the numbers say how far.
 */
import { createTieredRateLimit, type TieredRateLimit } from '../tiered-rate-limit.js';

/** One minute. Short enough that a refused phone recovers quickly. */
export const MOBILE_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Per client address, per window.
 *
 * A foregrounding app issues a handful of calls; sixty a minute is roughly an
 * order of magnitude above that and roughly six orders of magnitude below what
 * guessing an HS256 signature would need. The gap is the point — there is no
 * value here that inconveniences a real handset and also meaningfully helps an
 * attacker.
 */
export const MOBILE_PER_CLIENT_LIMIT = 60;

/**
 * Across the whole prefix, per window, regardless of who is calling.
 *
 * Ten clients' worth of the per-client budget. A household runs a handful of
 * handsets, so this is headroom for every phone in the house to be busy at
 * once and still an absolute cap on what a forged `CF-Connecting-IP` can buy.
 */
export const MOBILE_GLOBAL_LIMIT = 600;

export interface MobileRateLimitOptions {
  perClientLimit?: number;
  globalLimit?: number;
  windowMs?: number;
  /** Injectable clock, matching `createRateLimiter`'s own option name. */
  now?: () => number;
}

/**
 * Build the perimeter limiter.
 *
 * Mount it at the same prefix as the guard and **before** it, so a refused
 * request costs a map lookup rather than a signature verification.
 */
export function createMobileRateLimit(options: MobileRateLimitOptions = {}): TieredRateLimit {
  const now = options.now;
  return createTieredRateLimit({
    perClientLimit: options.perClientLimit ?? MOBILE_PER_CLIENT_LIMIT,
    globalLimit: options.globalLimit ?? MOBILE_GLOBAL_LIMIT,
    windowMs: options.windowMs ?? MOBILE_RATE_LIMIT_WINDOW_MS,
    ...(now === undefined ? {} : { now }),
  });
}
