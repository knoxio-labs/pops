/**
 * Shared guard for internal-only pillar routes (ADR-039 E22).
 *
 * A pillar exposes a handful of paths that only sibling services may call — the
 * telemetry sink, worker callbacks. Each caller presents `name.secret` in
 * {@link INTERNAL_CREDENTIAL_HEADER}; the callee verifies the secret against the
 * accepting caller's row (constant-time) and checks the caller holds the scope
 * naming the procedure. A valid caller lacking the required scope is rejected
 * outright.
 *
 * Framework-agnostic on purpose: {@link authenticateInternal} takes the request
 * path plus the already-read header/env values rather than an Express `Request`,
 * so the SDK carries no web framework dependency and the same helper serves any
 * HTTP layer.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Canonical header name for the per-caller credential, shaped `name.secret`
 * (the caller's identity, a dot, then its secret). Defined once so the attaching
 * caller and the verifying callee cannot drift.
 */
export const INTERNAL_CREDENTIAL_HEADER = 'x-pops-internal-credential';

/**
 * Constant-time equality for two secrets, independent of their length.
 *
 * Both are hashed to a fixed 32-byte digest so `timingSafeEqual` receives
 * equal-length inputs and the comparison leaks neither the secret nor its length
 * through timing.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** A caller a callee accepts: its name, secret, and the scopes it may exercise. */
export interface InternalCaller {
  /** The caller's identity, matched against the credential's `name` part. */
  readonly name: string;
  /** The caller's shared secret (the credential's `secret` part). */
  readonly secret: string;
  /** The scopes this caller is authorised for at this callee. */
  readonly scopes: ReadonlySet<string>;
}

/**
 * Declarative accepted-caller entry: the caller's static identity + scopes plus
 * the env var carrying its secret. The caller topology is a small, static fact
 * of the architecture and lives in code; only secrets flow through env/vault.
 */
export interface InternalCallerSpec {
  readonly name: string;
  readonly scopes: readonly string[];
  /** Env var holding this caller's secret; an unset/empty value revokes it. */
  readonly secretEnv: string;
}

/**
 * Resolve {@link InternalCallerSpec}s against an env bag into the callers a
 * callee currently accepts. A spec whose `secretEnv` is unset or empty is
 * dropped — that is how a caller is revoked without a code change (blank the
 * vault value and redeploy).
 */
export function parseInternalCallers(
  specs: readonly InternalCallerSpec[],
  env: Record<string, string | undefined>
): InternalCaller[] {
  const callers: InternalCaller[] = [];
  for (const spec of specs) {
    const secret = env[spec.secretEnv];
    if (secret === undefined || secret === '') continue;
    callers.push({ name: spec.name, secret, scopes: new Set(spec.scopes) });
  }
  return callers;
}

/** Configuration a callee verifies each internal request against. */
export interface InternalAuthConfig {
  /** Internal path → the scope a caller must hold to reach it. */
  readonly pathScopes: ReadonlyMap<string, string>;
  /** The per-caller credentials this callee accepts. */
  readonly callers: readonly InternalCaller[];
}

/** Why {@link authenticateInternal} allowed or rejected a request. */
export type InternalAuthReason =
  | 'not-internal'
  | 'ok'
  | 'no-credential'
  | 'unknown-caller'
  | 'bad-secret'
  | 'missing-scope';

/** Outcome of {@link authenticateInternal}. */
export interface InternalAuthResult {
  /** Whether the request may proceed. */
  readonly ok: boolean;
  /** The resolved principal when known. */
  readonly caller?: string;
  /** A machine-readable reason, for logging and tests. */
  readonly reason: InternalAuthReason;
}

/** Inputs to {@link authenticateInternal}. */
export interface InternalAuthRequest {
  readonly path: string;
  /** The {@link INTERNAL_CREDENTIAL_HEADER} value (`name.secret`), if present. */
  readonly credentialHeader: string | undefined;
  readonly config: InternalAuthConfig;
}

/**
 * Split a `name.secret` credential on its first dot. Returns `undefined` when
 * there is no interior dot (no name, or no secret).
 */
function parseCredential(header: string): { name: string; secret: string } | undefined {
  const dot = header.indexOf('.');
  if (dot <= 0 || dot >= header.length - 1) return undefined;
  return { name: header.slice(0, dot), secret: header.slice(dot + 1) };
}

/**
 * Authorise a request to a possibly-internal route.
 *
 * - A path outside `pathScopes` is not gated — always allowed.
 * - Otherwise the request must carry a well-formed per-caller credential naming
 *   a known caller whose secret matches (constant-time) and which holds the
 *   path's scope. A valid caller lacking the scope is rejected `missing-scope`.
 */
export function authenticateInternal(request: InternalAuthRequest): InternalAuthResult {
  const { path, credentialHeader, config } = request;

  const requiredScope = config.pathScopes.get(path);
  if (requiredScope === undefined) return { ok: true, reason: 'not-internal' };

  if (credentialHeader === undefined || credentialHeader === '') {
    return { ok: false, reason: 'no-credential' };
  }

  const parsed = parseCredential(credentialHeader);
  const caller =
    parsed === undefined ? undefined : config.callers.find((c) => c.name === parsed.name);
  if (parsed === undefined || caller === undefined) {
    return { ok: false, reason: 'unknown-caller' };
  }
  if (caller.secret === '' || !secretsMatch(parsed.secret, caller.secret)) {
    return { ok: false, reason: 'bad-secret' };
  }
  if (!caller.scopes.has(requiredScope)) {
    return { ok: false, caller: caller.name, reason: 'missing-scope' };
  }
  return { ok: true, caller: caller.name, reason: 'ok' };
}
