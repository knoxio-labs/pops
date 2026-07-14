/**
 * Shared guard for internal-only pillar routes (ADR-039 E22).
 *
 * A pillar exposes a handful of paths that only sibling services may call — the
 * telemetry sink, worker callbacks — and gates them on a credential. Two schemes
 * coexist during the E22 migration:
 *
 * - **Legacy** — one shared token (`POPS_API_INTERNAL_TOKEN`) carried in
 *   {@link INTERNAL_TOKEN_HEADER}, verified by {@link passesInternalToken}.
 * - **Per-caller** — each caller presents `name.secret` in
 *   {@link INTERNAL_CREDENTIAL_HEADER}; the callee verifies the secret against
 *   the accepting caller's row and checks the caller holds the scope naming the
 *   procedure. {@link authenticateInternal} implements accept-both: a request is
 *   authorised if it carries a valid per-caller credential OR (until cutover) the
 *   legacy shared token. A known caller presenting a valid secret but lacking the
 *   required scope is rejected outright — a legacy token cannot launder a
 *   scope failure.
 *
 * Framework-agnostic on purpose: these take the request path plus already-read
 * header/env values rather than an Express `Request`, so the SDK carries no web
 * framework dependency and the same helpers serve any HTTP layer.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Canonical header name for the legacy shared internal token.
 * Defined once so the attaching caller and the verifying callee cannot drift.
 */
export const INTERNAL_TOKEN_HEADER = 'x-pops-internal-token';

/**
 * Canonical header name for the per-caller credential, shaped `name.secret`
 * (the caller's identity, a dot, then its secret). Distinct from the legacy
 * header so a caller can present both during the accept-both window.
 */
export const INTERNAL_CREDENTIAL_HEADER = 'x-pops-internal-credential';

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
 * Decide whether a request to a possibly-internal route may proceed under the
 * legacy shared-token scheme.
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
  /**
   * The legacy shared token still accepted during transition; `undefined` (or
   * empty) once cut over, after which only per-caller credentials authorise.
   */
  readonly legacyToken: string | undefined;
}

/** Why {@link authenticateInternal} allowed or rejected a request. */
export type InternalAuthReason =
  | 'not-internal'
  | 'ok'
  | 'legacy'
  | 'no-credential'
  | 'unknown-caller'
  | 'bad-secret'
  | 'missing-scope';

/** Outcome of {@link authenticateInternal}. */
export interface InternalAuthResult {
  /** Whether the request may proceed. */
  readonly ok: boolean;
  /** The resolved principal when known (`'legacy'` for the shared token). */
  readonly caller?: string;
  /** A machine-readable reason, for logging and tests. */
  readonly reason: InternalAuthReason;
}

/** Inputs to {@link authenticateInternal}. */
export interface InternalAuthRequest {
  readonly path: string;
  /** The {@link INTERNAL_CREDENTIAL_HEADER} value (`name.secret`), if present. */
  readonly credentialHeader: string | undefined;
  /** The legacy {@link INTERNAL_TOKEN_HEADER} value, if present. */
  readonly legacyTokenHeader: string | undefined;
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

function legacyMatches(legacyToken: string | undefined, presented: string | undefined): boolean {
  if (legacyToken === undefined || legacyToken === '') return false;
  if (presented === undefined) return false;
  return secretsMatch(presented, legacyToken);
}

/**
 * Authorise a request to a possibly-internal route under the accept-both scheme.
 *
 * Order of decision:
 * 1. A path outside `pathScopes` is not gated — always allowed.
 * 2. A well-formed per-caller credential naming a known caller whose secret
 *    matches: allowed iff that caller holds the path's scope, else **rejected**
 *    for missing scope (no fallthrough — a valid identity lacking authorisation
 *    is a hard 403, even while the legacy token is still accepted).
 * 3. Otherwise the legacy shared token, if configured and matching: allowed as
 *    principal `legacy`.
 * 4. Otherwise rejected (`no-credential` when nothing was presented, else
 *    `bad-secret`/`unknown-caller`).
 */
export function authenticateInternal(request: InternalAuthRequest): InternalAuthResult {
  const { path, credentialHeader, legacyTokenHeader, config } = request;

  const requiredScope = config.pathScopes.get(path);
  if (requiredScope === undefined) return { ok: true, reason: 'not-internal' };

  let credentialReason: InternalAuthReason = 'no-credential';
  if (credentialHeader !== undefined && credentialHeader !== '') {
    const parsed = parseCredential(credentialHeader);
    const caller =
      parsed === undefined ? undefined : config.callers.find((c) => c.name === parsed.name);
    if (parsed === undefined || caller === undefined) {
      credentialReason = 'unknown-caller';
    } else if (caller.secret === '' || !secretsMatch(parsed.secret, caller.secret)) {
      credentialReason = 'bad-secret';
    } else if (!caller.scopes.has(requiredScope)) {
      return { ok: false, caller: caller.name, reason: 'missing-scope' };
    } else {
      return { ok: true, caller: caller.name, reason: 'ok' };
    }
  }

  if (legacyMatches(config.legacyToken, legacyTokenHeader)) {
    return { ok: true, caller: 'legacy', reason: 'legacy' };
  }

  return { ok: false, reason: credentialReason };
}
