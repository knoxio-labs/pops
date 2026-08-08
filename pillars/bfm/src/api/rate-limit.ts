/**
 * A fixed-window rate limiter, in memory.
 *
 * Pairing-code issuance needs one because a code short enough to type is short
 * enough to guess if an attacker can ask for unlimited attempts against it —
 * and the same reasoning applies, keyed differently, to the pairing exchange
 * itself (POPS-1374), which is why this takes its key from the caller rather
 * than deciding what a "caller" is.
 *
 * ## Why in memory, and what that costs
 *
 * bfm runs as a single container with a single process (see the compose
 * service in POPS-1385), so a process-local counter sees every request. Two
 * consequences follow and both are accepted rather than overlooked:
 *
 * - **A restart forgives the window.** An attacker who could restart the
 *   pillar could do considerably worse than reset a counter.
 * - **It does not survive horizontal scaling.** If bfm ever runs more than one
 *   replica this becomes per-replica and the effective limit multiplies. That
 *   is a real invalidation, not a rounding error — the fix is a shared store,
 *   and it belongs with whatever change introduces the second replica.
 *
 * A fixed window rather than a sliding one or a token bucket: the limits here
 * are small integers over minutes, where the fixed window's worst case (a
 * double burst across a boundary) is a handful of extra codes, and the operator
 * minting them is authenticated anyway.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until the current window rolls. Surfaced as `Retry-After`. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Count one attempt against `key` and decide whether it may proceed. */
  check(key: string): RateLimitDecision;
}

export interface RateLimiterOptions {
  /** Attempts permitted per key per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock, for tests. */
  now?: () => number;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Issuance budget for one operator: enough to cover a pairing that goes wrong
 * twice, far short of enough to sweep the code space.
 */
export const PAIRING_CODE_RATE_LIMIT = 5;
export const PAIRING_CODE_RATE_WINDOW_MS = 15 * 60 * 1000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = options;
  const windows = new Map<string, Window>();

  /**
   * Drop windows that have already rolled. Without this the map is an
   * unbounded write surface keyed by whatever the caller derives its key from
   * — which for the device-facing routes will be a client-influenced value.
   */
  function evictExpired(at: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= at) windows.delete(key);
    }
  }

  return {
    check(key: string): RateLimitDecision {
      const at = now();
      evictExpired(at);

      const window = windows.get(key);
      if (window === undefined) {
        windows.set(key, { count: 1, resetAt: at + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (window.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - at) / 1000)),
        };
      }

      window.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
