/**
 * The two-tier budget every internet-facing surface on this pillar is mounted
 * behind, and the client key both tiers are charged against.
 *
 * `rate-limit.ts` is the counter. This is the shape the counter has to be used
 * in on a hostname with Cloudflare Access bypassed (POPS-1389), and it is one
 * shape rather than two because the reasoning does not change between the
 * `/mobile` perimeter (POPS-1468) and the pairing exchange (POPS-1374): only
 * the numbers do, and those stay with the surfaces that choose them.
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
 * anything on the LAN or inside the compose network can reach these paths with
 * a header of its choosing. Nothing in the fleet strips or rewrites
 * `CF-Connecting-IP`.
 *
 * So a surface charges two budgets and refuses if either is spent:
 *
 * - a **global** tier, unkeyed. Nothing a caller sends can move it, so forging
 *   the header buys an attacker at most this, and it is the ceiling everything
 *   else is measured against.
 * - a **per-client** tier on the resolved address. Fine-grained enough that one
 *   hostile source runs out long before it can spend the household's ceiling,
 *   which is what keeps the coarse tier from turning a brute-force into a
 *   denial of service against the real phones.
 *
 * The order matters and is not cosmetic. The global tier is charged **first**,
 * so a request refused there never mints a per-client key. That caps distinct
 * keys per window at the global limit, which is what makes the per-client map
 * — keyed by something an attacker chooses — provably bounded rather than
 * bounded by hope. It is the whole answer to the "unbounded write surface"
 * `rate-limit.ts` names: the limiter drops rolled-over windows on its own, and
 * the ordering here bounds how many live ones can exist at once, so no
 * separate key ceiling is needed.
 */
import { isIP } from 'node:net';

import { createRateLimiter, type RateLimiter } from './rate-limit.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { RateLimitError } from '../contract/rest-schemas.js';

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

export interface TieredRateLimitOptions {
  /** Attempts one resolved client address may make per window. */
  perClientLimit: number;
  /** Attempts the whole surface admits per window, whoever is calling. */
  globalLimit: number;
  windowMs: number;
  /** Injectable clock, matching `createRateLimiter`'s own option name. */
  now?: () => number;
}

export interface TieredRateLimit {
  /**
   * Mount this on the path it budgets, ahead of the body parser — a refused
   * caller should cost a map lookup, not a parsed request.
   */
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
 * sets it. Depending on it would make this key silently change the day someone
 * did.
 *
 * Not normalized beyond that: `203.0.113.7` and its IPv4-mapped spelling
 * `::ffff:203.0.113.7` are two keys for one address, so a forger willing to
 * send both gets two buckets. Left alone because the ceiling that matters is
 * the global tier, and doubling a budget below it changes nothing an attacker
 * can use — canonicalizing would add a parser to a perimeter's hot path to
 * close a factor of two.
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

/**
 * Write the 429 every over-budget caller gets, whichever surface refused it.
 *
 * Nothing is logged. Anyone who can reach the hostname can provoke this, so a
 * log line here would be the log-flooding primitive the budget exists to deny
 * — and more sharply than for a 401, because this is the response a caller
 * sees *because* it is already sending too much.
 */
function refuseOverBudget(res: Response, retryAfterSeconds: number): void {
  const body: RateLimitError = {
    code: 'rate_limited',
    message: 'Too many requests. Retry after the interval this response carries.',
    retryAfterSeconds,
  };
  // RFC 9110 §10.2.3 delta-seconds form. A proxy or URLSession retry policy
  // acts on the header; the client reads the body field.
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(429).json(body);
}

export function createTieredRateLimit(options: TieredRateLimitOptions): TieredRateLimit {
  const { windowMs, now } = options;
  const clockOption = now === undefined ? {} : { now };

  const global: RateLimiter = createRateLimiter({
    limit: options.globalLimit,
    windowMs,
    ...clockOption,
  });

  const perClient: RateLimiter = createRateLimiter({
    limit: options.perClientLimit,
    windowMs,
    ...clockOption,
  });

  return {
    handler(req: Request, res: Response, next: NextFunction): void {
      const globalDecision = global.check(GLOBAL_KEY);
      if (!globalDecision.allowed) {
        refuseOverBudget(res, globalDecision.retryAfterSeconds);
        return;
      }

      const clientDecision = perClient.check(resolveClientKey(req));
      if (!clientDecision.allowed) {
        refuseOverBudget(res, clientDecision.retryAfterSeconds);
        return;
      }

      next();
    },

    trackedClients: () => perClient.size(),
  };
}
