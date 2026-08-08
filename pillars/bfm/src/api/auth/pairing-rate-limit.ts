/**
 * The request budget in front of `POST /devices/pair`.
 *
 * The pairing exchange is the more attractive of this pillar's two
 * internet-facing surfaces, and for a different reason than `/mobile`. There,
 * the credential is a 256-bit HMAC and the budget exists to bound *work*.
 * Here, the credential is short enough for a human to read off a screen and
 * type into a handset, and the budget exists to bound *guesses*.
 *
 * It is the second of the two things that make guessing pointless, and the
 * weaker one. The code's own ~59 bits over a five-minute life is what actually
 * closes the attack; this closes the case where that reasoning is wrong —
 * where a future change shortens the code, lengthens its life, or adds a
 * second issuance path — and it does so without needing to be revisited.
 *
 * Mechanism, client key and tier ordering: `api/tiered-rate-limit.ts`, shared
 * with the `/mobile` perimeter. Only the numbers are chosen here.
 *
 * ## Why it is middleware and not a check inside the handler
 *
 * The same reason the `/mobile` budget is: mounted on the path, it runs ahead
 * of `express.json()`, so a refused caller never gets bfm to parse a body. A
 * check inside the ts-rest handler would run after parsing and after schema
 * validation, which is most of the work an attacker can make this route do.
 */
import { createTieredRateLimit, type TieredRateLimit } from '../tiered-rate-limit.js';

/**
 * Five minutes — one pairing-code lifetime.
 *
 * Deliberately tied to that rather than to the `/mobile` window: a client that
 * spends its budget has, at worst, to wait for the code it was failing against
 * to expire anyway. A longer window would punish a mistyped code past the
 * point where retrying it could have worked.
 */
export const PAIRING_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Attempts one client address may make per window.
 *
 * A phone that scanned the QR needs one. A person typing twelve characters off
 * a screen might need three. Ten is generous for the honest case and
 * irrelevant to the hostile one: the code space is ~59 bits, so the number
 * that matters is the global ceiling below, not this.
 */
export const PAIRING_PER_CLIENT_LIMIT = 10;

/**
 * Attempts the route admits per window, whoever is calling.
 *
 * Ten clients' worth — the same ratio the `/mobile` perimeter uses, and for
 * the same reason: enough that every handset in a household could be pairing
 * badly at once, and an absolute cap on what a forged `CF-Connecting-IP` buys.
 * At this rate a distributed attacker sweeps ~2.9e4 codes a day against a
 * ~7.9e17 space whose members live five minutes. That is not a race anyone
 * wins; it is a number that stays true if the entropy argument stops being.
 */
export const PAIRING_GLOBAL_LIMIT = 100;

export interface PairingRateLimitOptions {
  perClientLimit?: number;
  globalLimit?: number;
  windowMs?: number;
  /** Injectable clock, matching `createRateLimiter`'s own option name. */
  now?: () => number;
}

export function createPairingRateLimit(options: PairingRateLimitOptions = {}): TieredRateLimit {
  const now = options.now;
  return createTieredRateLimit({
    perClientLimit: options.perClientLimit ?? PAIRING_PER_CLIENT_LIMIT,
    globalLimit: options.globalLimit ?? PAIRING_GLOBAL_LIMIT,
    windowMs: options.windowMs ?? PAIRING_RATE_LIMIT_WINDOW_MS,
    ...(now === undefined ? {} : { now }),
  });
}
