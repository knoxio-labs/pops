/**
 * Who a request is: the operator, a guest, or a machine caller.
 *
 * Cloudflare Access signs in more than one person once a guest is added to
 * its policy, and forwards each session as a `cf-access-jwt-assertion`
 * header. An email in `POPS_OPERATOR_EMAILS` is the operator; any other
 * verified email is a guest. A request with no token arrived over the LAN,
 * Tailscale or a dev machine, never through Access, and is the operator.
 *
 * Classification is off until both `POPS_OPERATOR_EMAILS` and
 * `CLOUDFLARE_ACCESS_TEAM_NAME` are set. A deployment that has not been given
 * them keeps the behaviour it had before guests existed, with the token
 * ignored and nobody refused, because turning either absence into a refusal
 * would lock the owner out of a running system on the next image roll.
 */
import {
  createCloudflareAccessVerifier,
  normalizeEmail,
  OPERATOR_EMAILS_ENV,
  readCloudflareAccessConfig,
  readOperatorEmails,
  type CloudflareAccessVerifier,
} from '@pops/pillar-sdk/access';

import type { Request, Response } from 'express';

/** The header Cloudflare Access forwards a verified session in. */
export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

/**
 * The party behind a request, as the scope gate resolved it.
 *
 * `operator` with a `null` email is a request that carried no Access token.
 * `service` is a request that presented an `X-API-Key`; its grant is the
 * scope gate's business, not this type's.
 */
export type RequestPrincipal =
  | { readonly kind: 'service' }
  | { readonly kind: 'operator'; readonly email: string | null }
  | { readonly kind: 'guest'; readonly email: string };

const PRINCIPAL_LOCAL = 'popsRequestPrincipal';

function isRequestPrincipal(value: unknown): value is RequestPrincipal {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false;
  return value.kind === 'service' || value.kind === 'operator' || value.kind === 'guest';
}

export function setPrincipal(res: Response, principal: RequestPrincipal): void {
  res.locals[PRINCIPAL_LOCAL] = principal;
}

/**
 * The principal the scope gate resolved for this request.
 *
 * Throws when the gate has not run, which is a route mounted ahead of the
 * middleware. Answering "operator" there instead would hand a guest the
 * owner's access through a mounting mistake.
 */
export function readPrincipal(res: Response): RequestPrincipal {
  const principal: unknown = res.locals[PRINCIPAL_LOCAL];
  if (!isRequestPrincipal(principal)) {
    throw new Error(
      'readPrincipal: no principal on this response. Mount the service-account scope gate ' +
        'ahead of the route that reads it.'
    );
  }
  return principal;
}

/** Test seams for the Access leg of the gate. Production passes neither. */
export interface AccessIdentityOptions {
  /** Defaults to `process.env`, read each time a middleware is built. */
  readonly env?: NodeJS.ProcessEnv;
  /** Fetches the team's signing keys. Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof globalThis.fetch;
}

/** Resolves a presented Access token to a principal, or `null` when it does not verify. */
export type AccessClassifier = (token: string) => Promise<RequestPrincipal | null>;

export interface AccessIdentitySource {
  /**
   * The classifier for the current environment, or `null` while classification
   * is off. Warns once per source the first time it is off.
   */
  readonly current: () => AccessClassifier | null;
}

/** Why a token failed, for the log. An `Error` message never carries the token itself. */
function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function classifierFor(
  logPrefix: string,
  verifier: CloudflareAccessVerifier,
  operators: ReadonlySet<string>
): AccessClassifier {
  return async (token) => {
    try {
      const email = normalizeEmail((await verifier.verify(token)).email);
      return operators.has(email) ? { kind: 'operator', email } : { kind: 'guest', email };
    } catch (error) {
      console.warn(`[${logPrefix}] rejected a Cloudflare Access token (${failureReason(error)})`);
      return null;
    }
  };
}

/**
 * Build the per-gate source of Access classification.
 *
 * The environment is read on every {@link AccessIdentitySource.current} call
 * rather than once, so a test can change it between apps; the verifier, and
 * with it the signing-key cache, is kept per configuration so a gate whose
 * middleware is rebuilt per request does not refetch keys each time.
 */
export function createAccessIdentitySource(
  logPrefix: string,
  options: AccessIdentityOptions = {}
): AccessIdentitySource {
  const verifiers = new Map<string, CloudflareAccessVerifier>();
  let warned = false;

  const warnOnce = (missing: string): void => {
    if (warned) return;
    warned = true;
    console.warn(
      `[${logPrefix}] ${missing} is not set, so guest classification is off: Cloudflare Access ` +
        `tokens are not verified here and every browser request is treated as the operator.`
    );
  };

  const current = (): AccessClassifier | null => {
    const env = options.env ?? process.env;
    const operators = readOperatorEmails(env);
    const config = readCloudflareAccessConfig(env);
    if (operators.size === 0 || config === null) {
      warnOnce(operators.size === 0 ? OPERATOR_EMAILS_ENV : 'CLOUDFLARE_ACCESS_TEAM_NAME');
      return null;
    }
    const cacheKey = JSON.stringify([config.teamName, config.audience ?? null]);
    let verifier = verifiers.get(cacheKey);
    if (verifier === undefined) {
      verifier = createCloudflareAccessVerifier({ ...config, fetchImpl: options.fetchImpl });
      verifiers.set(cacheKey, verifier);
    }
    return classifierFor(logPrefix, verifier, operators);
  };

  return { current };
}

interface IdentifyInput {
  readonly classify: AccessClassifier | null;
  readonly req: Request;
  readonly hasApiKey: boolean;
  /** Whether the path resolved to a scope, so a presented key will be verified. */
  readonly scoped: boolean;
}

/**
 * Resolve the principal, or `null` for an Access token that does not verify.
 *
 * A key counts as the caller's identity only where the gate goes on to verify
 * it. On a path outside the scope table a key is never checked, so a guest
 * could attach a made-up one to step around classification; there the Access
 * token decides instead.
 */
export async function identifyRequest(input: IdentifyInput): Promise<RequestPrincipal | null> {
  const { classify, req, hasApiKey, scoped } = input;
  const token = classify === null ? undefined : req.get(ACCESS_JWT_HEADER);
  if (classify === null || token === undefined || token === '' || (hasApiKey && scoped)) {
    return hasApiKey ? { kind: 'service' } : { kind: 'operator', email: null };
  }
  return classify(token);
}
