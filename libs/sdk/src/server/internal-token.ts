/**
 * Shared guard for internal-only pillar routes (ADR-039 E22).
 *
 * A pillar exposes a handful of paths that only sibling services may call — the
 * telemetry sink, worker callbacks — and gates them on a shared internal token
 * carried in {@link INTERNAL_TOKEN_HEADER}. Every pillar re-implemented the same
 * check inline; this centralises the security-critical decision (path
 * membership + constant token comparison, fail-closed on an unconfigured
 * callee) so it lives and is tested in one place. Callers keep their thin
 * framework wrapper to format the pillar-specific rejection response.
 *
 * Framework-agnostic on purpose: it takes the request path and the already-read
 * header/env values rather than an Express `Request`, so the SDK carries no web
 * framework dependency and the same helper serves any HTTP layer.
 */

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
  /** The token the callee expects (`POPS_API_INTERNAL_TOKEN`); `undefined` when unset. */
  readonly expectedToken: string | undefined;
}

/**
 * Decide whether a request to a possibly-internal route may proceed.
 *
 * - A path outside `internalPaths` always passes (it is not gated).
 * - An internal path passes only when a configured `expectedToken` exactly
 *   matches the `presentedToken`.
 * - A missing `expectedToken` fails closed — an unconfigured callee never
 *   trusts an internal request rather than accidentally accepting all of them.
 *
 * @returns `true` when the request may proceed, `false` when it must be rejected.
 */
export function passesInternalToken(check: InternalTokenCheck): boolean {
  if (!check.internalPaths.has(check.path)) return true;
  return check.expectedToken !== undefined && check.presentedToken === check.expectedToken;
}
