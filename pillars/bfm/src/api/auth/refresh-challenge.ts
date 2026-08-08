/**
 * The server nonce a refresh is signed over — issuing one, and spending it
 * exactly once.
 *
 * Proof of possession needs something the phone cannot have signed in advance.
 * Without it, a signature captured from one refresh would authorise every
 * later one, and the Secure Enclave key would stop being a second factor: a
 * stolen refresh token plus a recorded signature would be the whole
 * credential. The nonce is what makes each signature good for one exchange.
 *
 * ## Why in memory
 *
 * A challenge is worthless the moment it is spent and worthless a minute after
 * it is issued, so the durability a table would buy is durability of nothing.
 * The costs are real, though: `bfm.db` already grows without bound
 * (POPS-1449), and a table here would hand an unauthenticated,
 * internet-reachable route a write primitive — every `POST /devices/challenge`
 * becoming a row on the same disk the credential tables live on.
 *
 * Two consequences, both accepted deliberately:
 *
 * - **A restart drops every live challenge.** A phone mid-refresh gets one
 *   `challenge_expired`, fetches another nonce and retries. It never reaches a
 *   user.
 * - **The counter is process-local.** Exact for one container, wrong for two
 *   — a nonce issued by one replica would not verify at the other. The same
 *   condition the rate-limit counters carry, and tracked in the same place
 *   (POPS-1474), with the trigger pinned to whichever change first adds a
 *   replica.
 *
 * ## Why the map is bounded
 *
 * Anyone who can reach the hostname can ask for a nonce, so an unbounded map
 * here would be a memory sink reachable by a stranger. Three things bound it,
 * and the first is the one that matters:
 *
 * 1. the tiered budget mounted on the route in `app.ts`, whose global tier
 *    caps issuance per window. {@link CHALLENGE_TTL_MS} is at or below that
 *    window, so live entries cannot exceed one window's global limit;
 * 2. expiry pruning on every issue, which is cheap because entries expire in
 *    insertion order — see {@link pruneExpired};
 * 3. {@link DEFAULT_MAX_LIVE_CHALLENGES}, a hard ceiling that (1) should make
 *    unreachable. It is here for the case where (1) is misconfigured rather
 *    than as the primary defence, and it evicts the oldest entry, which costs
 *    a phone one retry rather than costing this process its heap.
 */
import { randomBytes } from 'node:crypto';

/**
 * Width of the nonce. The same 256 bits as the refresh token: a nonce narrow
 * enough to guess would let an attacker sign in advance against a value it
 * expects to be issued, which is the one property this exists to deny.
 */
export const CHALLENGE_NONCE_BYTES = 32;

/**
 * How long an unspent challenge stays redeemable.
 *
 * One minute, which is a round trip and a retry, not a session. The phone
 * fetches a nonce immediately before it refreshes, so this is never load-
 * bearing for an honest client; it is the window in which a nonce observed in
 * flight is worth anything, and the ceiling on how much of this map a burst
 * can occupy.
 *
 * Must stay at or below the challenge route's rate-limit window, or the bound
 * in this file's header stops holding. `refresh-rate-limit.ts` states the same
 * invariant from the other side.
 */
export const CHALLENGE_TTL_MS = 60_000;

/**
 * Ceiling on live challenges — the backstop, not the budget. See the header:
 * the rate limiter's global tier is what should keep this out of reach, and
 * this is what stops a misconfigured one from mattering.
 */
export const DEFAULT_MAX_LIVE_CHALLENGES = 1_000;

export interface RefreshChallenge {
  nonce: string;
  /** What the phone should treat as this challenge's shelf life. */
  expiresInSeconds: number;
}

export interface RefreshChallengeStore {
  /** Draw a nonce and remember it until it is spent or expires. */
  issue: () => RefreshChallenge;
  /**
   * Spend a nonce. `true` only for one that was issued, has not been spent and
   * has not expired.
   *
   * A known nonce is deleted whether or not it had expired: "single use" has
   * to mean single *presentation*, or an expired nonce would stay in the map
   * as a slot an attacker could keep probing.
   */
  consume: (nonce: string) => boolean;
  /**
   * Live entries. Exposed for the same reason `tieredRateLimit.trackedClients`
   * is: the bound above is a claim about this number, and a test that cannot
   * read it cannot tell a bounded map from a hopeful one.
   */
  size: () => number;
}

export interface RefreshChallengeStoreOptions {
  ttlMs?: number;
  maxLive?: number;
  /** Injectable clock, matching `createRateLimiter`'s own option name. */
  now?: () => number;
  /** Injectable draw, so a test can pin the nonce it is about to sign over. */
  generateNonce?: () => string;
}

/** Draw one nonce. base64url, so it survives a JSON body and a header alike. */
export function generateChallengeNonce(): string {
  return randomBytes(CHALLENGE_NONCE_BYTES).toString('base64url');
}

/**
 * Drop expired entries from the front of the map.
 *
 * Entries are inserted in clock order with a constant TTL, so the expired ones
 * are always a prefix and the scan can stop at the first live entry — the cost
 * is proportional to what it removes rather than to what it keeps. Deleting
 * during `Map` iteration is defined behaviour and does not disturb the walk.
 *
 * A clock that went backwards would end the scan early and prune less than it
 * could, which is the harmless direction; the ceiling still holds.
 */
function pruneExpired(entries: Map<string, number>, at: number): void {
  for (const [nonce, expiresAt] of entries) {
    if (expiresAt > at) return;
    entries.delete(nonce);
  }
}

export function createRefreshChallengeStore(
  options: RefreshChallengeStoreOptions = {}
): RefreshChallengeStore {
  const {
    ttlMs = CHALLENGE_TTL_MS,
    maxLive = DEFAULT_MAX_LIVE_CHALLENGES,
    now = Date.now,
    generateNonce = generateChallengeNonce,
  } = options;

  /** nonce → the instant it stops being redeemable. */
  const entries = new Map<string, number>();

  return {
    issue(): RefreshChallenge {
      const at = now();
      pruneExpired(entries, at);

      // Only reachable if the route's budget is not doing its job. Evicting the
      // oldest live entry costs whoever holds it one `challenge_expired` and a
      // retry; the alternative is an unbounded map on a public route.
      while (entries.size >= maxLive) {
        const oldest = entries.keys().next();
        if (oldest.done === true) break;
        entries.delete(oldest.value);
      }

      const nonce = generateNonce();
      entries.set(nonce, at + ttlMs);
      // Rounded up, and floored at one: the contract promises a positive
      // integer, and a sub-second TTL truncating to `0` would describe a
      // challenge that was already dead on arrival.
      return { nonce, expiresInSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) };
    },

    consume(nonce: string): boolean {
      const expiresAt = entries.get(nonce);
      if (expiresAt === undefined) return false;
      entries.delete(nonce);
      return expiresAt > now();
    },

    size: () => entries.size,
  };
}
