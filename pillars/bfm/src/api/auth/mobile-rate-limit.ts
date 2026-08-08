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
 * ## Two tiers, because the only usable client key is forgeable
 *
 * The tunnel's ingress rule points at `bfm-api:3014` directly rather than
 * through the shell, so there is no nginx hop on the device path and
 * `req.socket.remoteAddress` is cloudflared's bridge address — the same value
 * for every phone on earth. `CF-Connecting-IP`, set by Cloudflare's edge, is
 * the only real client identity available.
 *
 * It is also forgeable, because bfm is reachable a second way: the operator
 * routes come through the shell at `/bfm-api/`, which strips the prefix, so
 * anything on the LAN or inside the compose network can reach `/mobile/*` with
 * a header of its choosing. Nothing in the fleet strips or rewrites
 * `CF-Connecting-IP`.
 *
 * So the perimeter charges two budgets and refuses if either is spent:
 *
 * - {@link MOBILE_GLOBAL_LIMIT} — unkeyed, across the whole prefix. Nothing a
 *   caller sends can move it, so forging the header buys an attacker at most
 *   this, and it is the ceiling everything else is measured against.
 * - {@link MOBILE_PER_CLIENT_LIMIT} — per resolved client address. Fine-grained
 *   enough that one hostile source runs out long before it can spend the
 *   household's ceiling, which is what keeps the coarse tier from turning a
 *   brute-force into a denial of service against the real phones.
 *
 * The order matters and is not cosmetic. The global tier is charged **first**,
 * so a request refused there never mints a per-client key. That caps distinct
 * keys per window at the global limit, which is what makes the per-client map
 * — keyed by something an attacker chooses — provably bounded rather than
 * bounded by hope. It is the whole answer to the "unbounded write surface"
 * `rate-limit.ts` names: the limiter drops rolled-over windows on its own, and
 * the ordering here bounds how many live ones can exist at once, so no
 * separate key ceiling is needed at this call site.
 *
 * ## What it counts
 *
 * Every `/mobile/*` request, authenticated or not. The tiers sit ahead of the
 * guard precisely so an anonymous caller never reaches the HMAC, which means
 * they cannot know whether a request was going to succeed. Both limits are set
 * far above what a household of handsets generates, so a device past the guard
 * is unaffected; the numbers say how far.
 */
import { isIP } from 'node:net';

import { createRateLimiter, type RateLimiter } from '../rate-limit.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { MobileRateLimitError } from '../../contract/rest-schemas.js';

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

/** The single key the unkeyed tier charges against. */
const GLOBAL_KEY = 'global';

/**
 * Fallback client key when no usable address can be read.
 *
 * A single shared bucket rather than a per-request unique value: an unreadable
 * address must not be a way to get a fresh budget. It collapses every such
 * caller into one, which is the conservative direction.
 */
const UNKNOWN_CLIENT_KEY = 'unknown';

export interface MobileRateLimitOptions {
  perClientLimit?: number;
  globalLimit?: number;
  windowMs?: number;
  /** Injectable clock, matching `createRateLimiter`'s own option name. */
  now?: () => number;
}

export interface MobileRateLimit {
  /** Mount this at the prefix, ahead of the guard. */
  handler: RequestHandler;
  /**
   * Distinct client addresses currently tracked.
   *
   * Exposed because the ordering above is a claim about this number — that a
   * request refused by the global tier mints no per-client key, so an attacker
   * rotating addresses cannot grow this past the global limit however many it
   * sends. That is the difference between a bounded map and a hopeful one, and
   * a test that cannot see the count cannot tell the two apart: both answer
   * 429 either way.
   */
  trackedClients: () => number;
}

/**
 * Resolve the address a request is charged to.
 *
 * `CF-Connecting-IP` when it holds exactly one syntactically valid IP address,
 * otherwise the socket peer, otherwise {@link UNKNOWN_CLIENT_KEY}.
 *
 * The `isIP` check is doing real work, not tidiness. Without it the key is an
 * arbitrary attacker-supplied string and every request can carry a fresh one,
 * which turns the per-client tier from a limit into a no-op and its map into a
 * memory sink. With it, a forged value still has to be IP-shaped, and the
 * global tier bounds how many of those can be minted per window.
 *
 * Node joins repeated headers with a comma, so a request carrying two of them
 * produces a value `isIP` rejects — falling back to the socket peer rather
 * than letting the first one silently win, which would otherwise be a way to
 * spend someone else's budget or dodge one's own.
 *
 * `req.socket.remoteAddress` rather than `req.ip`, deliberately: `req.ip`
 * reads `X-Forwarded-For` once `trust proxy` is set, and no app in this fleet
 * sets it. Depending on it would make this limiter's key silently change the
 * day someone did.
 */
export function resolveClientKey(req: Request): string {
  const forwarded = req.headers['cf-connecting-ip'];
  if (typeof forwarded === 'string') {
    const candidate = forwarded.trim();
    if (isIP(candidate) !== 0) return candidate;
  }
  const peer = req.socket.remoteAddress;
  return peer === undefined || peer === '' ? UNKNOWN_CLIENT_KEY : peer;
}

function refuse(res: Response, retryAfterSeconds: number): void {
  const body: MobileRateLimitError = {
    code: 'rate_limited',
    message: 'Too many requests. Retry after the interval this response carries.',
    retryAfterSeconds,
  };
  // RFC 9110 §10.2.3 delta-seconds form. A proxy or URLSession retry policy
  // acts on the header; the client reads the body field.
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(429).json(body);
}

/**
 * Build the perimeter limiter.
 *
 * Mount it at the same prefix as the guard and **before** it, so a refused
 * request costs a map lookup rather than a signature verification.
 *
 * Nothing is logged on a refusal, for the reason `README.md` gives for the
 * guard's 401: anyone who can reach the hostname can provoke one, so a log
 * line here would be the log-flooding primitive this middleware exists to
 * deny.
 */
export function createMobileRateLimit(options: MobileRateLimitOptions = {}): MobileRateLimit {
  const windowMs = options.windowMs ?? MOBILE_RATE_LIMIT_WINDOW_MS;
  const now = options.now;
  const clockOption = now === undefined ? {} : { now };

  const global: RateLimiter = createRateLimiter({
    limit: options.globalLimit ?? MOBILE_GLOBAL_LIMIT,
    windowMs,
    ...clockOption,
  });

  const perClient: RateLimiter = createRateLimiter({
    limit: options.perClientLimit ?? MOBILE_PER_CLIENT_LIMIT,
    windowMs,
    ...clockOption,
  });

  return {
    handler(req: Request, res: Response, next: NextFunction): void {
      const globalDecision = global.check(GLOBAL_KEY);
      if (!globalDecision.allowed) {
        refuse(res, globalDecision.retryAfterSeconds);
        return;
      }

      const clientDecision = perClient.check(resolveClientKey(req));
      if (!clientDecision.allowed) {
        refuse(res, clientDecision.retryAfterSeconds);
        return;
      }

      next();
    },

    trackedClients: () => perClient.size(),
  };
}
