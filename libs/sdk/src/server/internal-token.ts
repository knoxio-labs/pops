/**
 * Shared guard for internal-only pillar routes (ADR-039 E22).
 *
 * A pillar exposes a handful of paths that only sibling services may call — the
 * telemetry sink, worker callbacks — and gates them on a shared internal token
 * carried in {@link INTERNAL_TOKEN_HEADER}. Every pillar re-implemented the same
 * check inline; this centralises the security-critical decision (path
 * membership + a constant-time token comparison, fail-closed on an unset or
 * empty expected token) so it lives and is tested in one place. Callers keep
 * their thin framework wrapper to format the pillar-specific rejection response.
 *
 * Framework-agnostic on purpose: it takes the request path and the already-read
 * header/env values rather than an Express `Request`, so the SDK carries no web
 * framework dependency and the same helper serves any HTTP layer.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Canonical header name for the shared internal service-to-service token.
 * Defined once so the attaching caller and the verifying callee cannot drift.
 */
export const INTERNAL_TOKEN_HEADER = 'x-pops-internal-token';

/** Inputs to {@link passesInternalToken}. */
export interface InternalTokenCheck {
  /** The incoming request path (e.g. Express `req.path`). */
  readonly path: string;
  /** Paths that require the internal token; any other path passes untouched. */
  readonly internalPaths: ReadonlySet<string>;
  /** The token presented on the request (the {@link INTERNAL_TOKEN_HEADER} value). */
  readonly presentedToken: string | undefined;
  /**
   * The token the callee expects (`POPS_API_INTERNAL_TOKEN`); `undefined` when
   * unset. An empty string is treated the same as unset (unconfigured).
   */
  readonly expectedToken: string | undefined;
}

/**
 * Constant-time equality for two secrets, independent of their length.
 *
 * Both are hashed to a fixed 32-byte digest so `timingSafeEqual` receives
 * equal-length inputs and the comparison leaks neither the token nor its length
 * through timing.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Decide whether a request to a possibly-internal route may proceed.
 *
 * - A path outside `internalPaths` always passes (it is not gated).
 * - An internal path passes only when a configured `expectedToken` matches the
 *   `presentedToken` under a constant-time comparison.
 * - An unset OR empty `expectedToken` fails closed — a callee misconfigured with
 *   an empty token never authorises an internal route (in particular it must not
 *   accept an empty presented header as a match).
 *
 * @returns `true` when the request may proceed, `false` when it must be rejected.
 */
export function passesInternalToken(check: InternalTokenCheck): boolean {
  if (!check.internalPaths.has(check.path)) return true;
  const { expectedToken, presentedToken } = check;
  if (expectedToken === undefined || expectedToken === '') return false;
  if (presentedToken === undefined) return false;
  return secretsMatch(presentedToken, expectedToken);
}
