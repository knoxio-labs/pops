/**
 * Inbound service-account authorisation — the producer half of the credential
 * the server SDK's `pillar()` already attaches to every cross-pillar call.
 *
 * The registry pillar owns the service-account table, so it is the only party
 * that can turn a presented `X-API-Key` into a principal. Every other producer
 * asks it, through a {@link ServiceAccountVerifier}, and then applies the same
 * dot-prefix scope rule the registry applies to itself
 * ({@link hasScopeFor}). One mechanism, one vocabulary.
 *
 * Framework-agnostic on purpose, exactly like `authenticateInternal`:
 * {@link authorizeServiceAccountRequest} takes an already-read header and an
 * already-resolved scope rather than an Express `Request`, so the SDK carries
 * no web-framework dependency and the same decision serves any HTTP layer.
 *
 * **Fail closed.** A presented credential that cannot be turned into a
 * principal never falls through to the network-trust model — an unverifiable
 * key is a rejected key (`503` while the registry is unreachable, `401` once it
 * answers). The only request this function lets past unauthenticated is one
 * that presented no credential at all, and only when the mounting pillar sets
 * {@link ServiceAccountAuthRequest.requireCredential} to `false` — see the
 * discussion of that flag below.
 */
import { hasScopeFor } from './service-account-scope.js';

/** The registry-resolved identity behind a presented key. */
export interface ServiceAccountPrincipal {
  readonly id: string;
  readonly name: string;
  readonly scopes: readonly string[];
}

/**
 * What a verifier concluded about a presented key.
 *
 * `rejected` and `unavailable` are deliberately distinct: the first is the
 * registry's answer (unknown key, or one that has been revoked), the second is
 * the absence of an answer. Collapsing them would either hide a revocation
 * behind a network blip or turn a network blip into a permanent 401.
 */
export type ServiceAccountVerification =
  | { readonly outcome: 'authenticated'; readonly principal: ServiceAccountPrincipal }
  | { readonly outcome: 'rejected' }
  | { readonly outcome: 'unavailable'; readonly detail?: string };

/** Turns a presented key into a {@link ServiceAccountVerification}. */
export type ServiceAccountVerifier = (apiKey: string) => Promise<ServiceAccountVerification>;

/** Why {@link authorizeServiceAccountRequest} allowed or rejected a request. */
export type ServiceAccountAuthReason =
  /** The path is not in the pillar's scope table — this gate has no opinion. */
  | 'not-scoped'
  /** No credential presented, and the pillar accepts unauthenticated callers. */
  | 'anonymous'
  /** No credential presented, and the pillar requires one. */
  | 'no-credential'
  /** The registry knows nothing about this key, or it has been revoked. */
  | 'invalid-credential'
  /** The registry could not be reached, so the key could not be checked. */
  | 'unavailable'
  /** A real account, but its grant does not cover the requested operation. */
  | 'missing-scope'
  /** A real account holding the scope. */
  | 'ok';

/** Outcome of {@link authorizeServiceAccountRequest}. */
export interface ServiceAccountAuthResult {
  /** Whether the request may proceed. */
  readonly ok: boolean;
  /** HTTP status the rejecting layer should send. `200` when `ok`. */
  readonly status: 200 | 401 | 403 | 503;
  /** Machine-readable reason, for logging and tests. */
  readonly reason: ServiceAccountAuthReason;
  /** The resolved principal, when the key authenticated. */
  readonly principal?: ServiceAccountPrincipal;
  /** The scope the operation required, when one applied. */
  readonly requiredScope?: string;
}

/** Inputs to {@link authorizeServiceAccountRequest}. */
export interface ServiceAccountAuthRequest {
  /**
   * The scope this operation demands, or `undefined` when the path is outside
   * the pillar's contract. Resolve it with `resolveContractScope`.
   */
  readonly requiredScope: string | undefined;
  /** The raw `X-API-Key` header value, if the request carried one. */
  readonly apiKey: string | undefined;
  readonly verify: ServiceAccountVerifier;
  /**
   * Whether a credential is mandatory on scoped paths.
   *
   * `false` (the default) gates only requests that present a key: a browser
   * session arriving through the Cloudflare Access perimeter carries no
   * `X-API-Key` and is left to the perimeter that already governs it, while
   * every machine caller — which the server SDK always credentials — becomes
   * subject to its grant and to revocation. `true` additionally closes the
   * unauthenticated in-network path, which is a separate decision about the
   * docker-network trust boundary and belongs to whichever pillar has a
   * credentialled story for all of its callers.
   */
  readonly requireCredential?: boolean;
}

/**
 * Decide whether a request may reach a scoped operation.
 *
 * @returns An {@link ServiceAccountAuthResult}; `ok === false` carries the
 *   status the HTTP layer should return and never leaks the key.
 */
export async function authorizeServiceAccountRequest(
  request: ServiceAccountAuthRequest
): Promise<ServiceAccountAuthResult> {
  const { requiredScope, apiKey, verify } = request;

  if (requiredScope === undefined) return { ok: true, status: 200, reason: 'not-scoped' };

  if (apiKey === undefined || apiKey === '') {
    return request.requireCredential === true
      ? { ok: false, status: 401, reason: 'no-credential', requiredScope }
      : { ok: true, status: 200, reason: 'anonymous', requiredScope };
  }

  const verification = await verify(apiKey);

  if (verification.outcome === 'unavailable') {
    return { ok: false, status: 503, reason: 'unavailable', requiredScope };
  }
  if (verification.outcome === 'rejected') {
    return { ok: false, status: 401, reason: 'invalid-credential', requiredScope };
  }

  const { principal } = verification;
  if (!hasScopeFor(principal.scopes, requiredScope)) {
    return { ok: false, status: 403, reason: 'missing-scope', principal, requiredScope };
  }
  return { ok: true, status: 200, reason: 'ok', principal, requiredScope };
}
