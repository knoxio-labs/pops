/**
 * The Express binding for `@pops/pillar-sdk`'s inbound service-account
 * decision (ADR-044).
 *
 * The SDK owns the decision and deliberately owns nothing else: the scope
 * vocabulary, the contract projection and `authorizeServiceAccountRequest` are
 * pure over an already-read header, so `libs/sdk` binds to no HTTP framework.
 * That leaves every adopting producer to write the same ~110 lines of Express
 * plumbing, of which only three things differ — the contract, the root scope,
 * and the log prefix. `readApiKey`, the rejection log, the response bodies and
 * the promise handling are identical everywhere by construction, because the
 * semantics they implement are the ADR's, not the pillar's.
 *
 * So they live here once. This package is where the express dependency is
 * allowed to be; `@pops/pillar-sdk` stays framework-agnostic, which is the
 * property that lets the same decision serve a non-Express host later.
 */
import {
  authorizeServiceAccountRequest,
  buildContractScopeMap,
  resolveContractScope,
  type ContractScopeMap,
  type ServiceAccountAuthResult,
  type ServiceAccountVerifier,
} from '@pops/pillar-sdk/server';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** What a pillar has to say to get a gate. */
export interface ServiceAccountScopeGateOptions {
  /**
   * The pillar's ts-rest contract router. Projected onto the scope table, so
   * a route added to the contract is gated the moment it exists and there is
   * no second list to forget.
   */
  readonly contract: unknown;
  /**
   * Root of the pillar's scope vocabulary — the pillar id. A grant of
   * `finance.transactions` authorises `finance.transactions.list` and nothing
   * under `finance.budgets`.
   */
  readonly rootScope: string;
  /** Prefix for rejection logs, conventionally `<pillar>-api`. */
  readonly logPrefix: string;
  /**
   * Whether a credential is mandatory on scoped paths. Defaults to `false`,
   * the ADR-044 posture: a caller presenting a key is held to its grant, and a
   * caller presenting none is left to the perimeter that already governs it.
   * Setting `true` additionally closes the unauthenticated in-network path,
   * which is a separate decision about ADR-027's trust boundary and only
   * affordable for a pillar all of whose callers carry keys.
   */
  readonly requireCredential?: boolean;
}

/** A pillar's gate: the scope table it derived, and the middleware over it. */
export interface ServiceAccountScopeGate {
  /**
   * Every contract route projected onto the scope it requires. Exported by
   * convention from the adopting pillar so a test can assert it is non-empty:
   * an empty table gates nothing and still passes every behavioural test.
   */
  readonly scopeMap: ContractScopeMap;
  /**
   * Build the middleware. Mount it BEFORE `createExpressEndpoints` so it runs
   * ahead of every contract handler, and after any raw route that carries no
   * scope.
   *
   * @param verify Resolves a presented key to its principal. Production passes
   *   `createRegistryServiceAccountVerifier()`; tests inject a fake.
   */
  readonly createMiddleware: (verify: ServiceAccountVerifier) => RequestHandler;
}

const MESSAGES: Record<number, string> = {
  401: 'Missing or invalid service-account credentials.',
  403: 'This service account is not authorised for this operation.',
  503: 'Service-account credentials could not be verified: the registry is unreachable.',
};

function readApiKey(req: Request): string | undefined {
  // `req.get` collapses a repeated header to one string, so a client sending
  // it twice is not silently read as an array and rejected as malformed.
  return req.get('x-api-key');
}

/**
 * Log a rejection with enough detail to act on — the account and the scope it
 * was missing — and never the key. A 403 is most often an account that needs
 * widening, and the operator cannot widen what the log does not name.
 */
function logRejection(logPrefix: string, result: ServiceAccountAuthResult): void {
  if (result.reason === 'missing-scope') {
    console.warn(
      `[${logPrefix}] service account '${result.principal?.name ?? 'unknown'}' is not authorised ` +
        `for '${result.requiredScope ?? 'unknown'}'`
    );
    return;
  }
  console.warn(
    `[${logPrefix}] rejected a credentialled request (${result.reason}) for ` +
      `'${result.requiredScope ?? 'unknown'}'`
  );
}

/**
 * Derive a pillar's scope table from its contract and bind ADR-044's decision
 * to Express.
 *
 * @param options The three things that vary per pillar, plus the posture.
 * @returns The scope table and a middleware factory over it.
 */
export function createServiceAccountScopeGate(
  options: ServiceAccountScopeGateOptions
): ServiceAccountScopeGate {
  const scopeMap = buildContractScopeMap(options.contract, options.rootScope);
  const { logPrefix, requireCredential } = options;

  const createMiddleware = (verify: ServiceAccountVerifier): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
      void authorizeServiceAccountRequest({
        requiredScope: resolveContractScope(scopeMap, req.method, req.path),
        apiKey: readApiKey(req),
        verify,
        requireCredential,
      })
        .then((result) => {
          if (result.ok) {
            next();
            return;
          }
          logRejection(logPrefix, result);
          res.status(result.status).json({ message: MESSAGES[result.status] ?? 'Forbidden' });
        })
        .catch(next);
    };
  };

  return { scopeMap, createMiddleware };
}
