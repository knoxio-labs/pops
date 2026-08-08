/**
 * Inbound service-account gate for the finance contract surface.
 *
 * Finance is a producer for machine callers — bfm's mobile transactions screen
 * reaches it through `pillar('finance')`, which attaches the caller's
 * `X-API-Key` to every request. Until this gate existed the header was ignored
 * here, so the narrow grant those callers hold constrained nothing and a
 * revoked key kept working. The decision, the scope vocabulary and the
 * registry lookup all live in `@pops/pillar-sdk/server`; this file is the
 * Express binding and the choice of what finance gates.
 *
 * **Who this gate answers for.** A request carrying an `X-API-Key` must
 * resolve to a live account whose grant covers the operation, and a key that
 * cannot be resolved is rejected rather than waved through. A request carrying
 * no key is left to the perimeter that already governs it: browser traffic
 * arrives through the shell's nginx and Cloudflare Access with no key at all,
 * and turning that into a 401 here would be a different change — closing the
 * docker-network trust boundary — that finance cannot make unilaterally while
 * its own frontend depends on it.
 *
 * The required scope is derived from the contract itself
 * (`buildContractScopeMap`), so a route added to `financeContract` is gated the
 * moment it exists; there is no second list to forget. Paths outside the
 * contract — `/health`, `/pillars`, `/openapi`, the Up webhook, which carries
 * its own signature check — resolve to no scope and are untouched.
 */
import {
  authorizeServiceAccountRequest,
  buildContractScopeMap,
  resolveContractScope,
  type ContractScopeMap,
  type ServiceAccountAuthResult,
  type ServiceAccountVerifier,
} from '@pops/pillar-sdk/server';

import { financeContract } from '../../contract/rest.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Root of finance's scope vocabulary. A grant of `finance.transactions`
 * authorises `finance.transactions.list` and nothing under `finance.budgets`.
 */
const FINANCE_SCOPE_ROOT = 'finance';

/**
 * Every contract route projected onto the scope it requires. Built once at
 * module load; exported so a test can assert it actually covers the contract,
 * since an empty table would gate nothing and still pass every other test.
 */
export const financeScopeMap: ContractScopeMap = buildContractScopeMap(
  financeContract,
  FINANCE_SCOPE_ROOT
);

function readApiKey(req: Request): string | undefined {
  // `req.get` collapses a repeated header to one string, so a client sending
  // it twice is not silently read as an array and rejected as malformed.
  return req.get('x-api-key');
}

/**
 * Log a rejection with enough detail to act on — the account and the scope it
 * was missing — and never the key. A 403 here is most often an account that
 * needs widening, and the operator cannot widen what the log does not name.
 */
function logRejection(result: ServiceAccountAuthResult): void {
  if (result.reason === 'missing-scope') {
    console.warn(
      `[finance-api] service account '${result.principal?.name ?? 'unknown'}' is not authorised ` +
        `for '${result.requiredScope ?? 'unknown'}'`
    );
    return;
  }
  console.warn(
    `[finance-api] rejected a credentialled request (${result.reason}) for ` +
      `'${result.requiredScope ?? 'unknown'}'`
  );
}

const MESSAGES: Record<number, string> = {
  401: 'Missing or invalid service-account credentials.',
  403: 'This service account is not authorised for this operation.',
  503: 'Service-account credentials could not be verified: the registry is unreachable.',
};

/**
 * Build the gate. Mount it BEFORE `createExpressEndpoints` so it runs ahead of
 * every contract handler.
 *
 * @param verify Resolves a presented key to its principal. Production passes a
 *   registry-backed verifier; tests inject a fake.
 */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    void authorizeServiceAccountRequest({
      requiredScope: resolveContractScope(financeScopeMap, req.method, req.path),
      apiKey: readApiKey(req),
      verify,
    })
      .then((result) => {
        if (result.ok) {
          next();
          return;
        }
        logRejection(result);
        res.status(result.status).json({ message: MESSAGES[result.status] ?? 'Forbidden' });
      })
      .catch(next);
  };
}
