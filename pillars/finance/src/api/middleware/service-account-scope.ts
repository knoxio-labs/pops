/**
 * Inbound service-account gate for the finance contract surface.
 *
 * Finance is a producer for machine callers — bfm's mobile transactions screen
 * reaches it through `pillar('finance')`, which attaches the caller's
 * `X-API-Key` to every request. Until this gate existed the header was ignored
 * here, so the narrow grant those callers hold constrained nothing and a
 * revoked key kept working. The decision, the scope vocabulary and the
 * registry lookup live in `@pops/pillar-sdk/server`; the Express plumbing
 * around them lives in `@pops/pillar-express`, because it was identical in
 * every adopting pillar. What is left here is the choice of what finance gates.
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
 * The required scope is derived from the contract itself, so a route added to
 * `financeContract` is gated the moment it exists; there is no second list to
 * forget. Paths outside the contract — `/health`, `/pillars`, `/openapi`, the
 * Up webhook, which carries its own signature check — resolve to no scope and
 * are untouched.
 */
import { createServiceAccountScopeGate } from '@pops/pillar-express';

import { financeContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

/**
 * Root of finance's scope vocabulary. A grant of `finance.transactions`
 * authorises `finance.transactions.list` and nothing under `finance.budgets`.
 */
const FINANCE_SCOPE_ROOT = 'finance';

const gate = createServiceAccountScopeGate({
  contract: financeContract,
  rootScope: FINANCE_SCOPE_ROOT,
  logPrefix: 'finance-api',
});

/**
 * Every contract route projected onto the scope it requires. Built once at
 * module load; exported so a test can assert it actually covers the contract,
 * since an empty table would gate nothing and still pass every other test.
 */
export const financeScopeMap: ContractScopeMap = gate.scopeMap;

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
  return gate.createMiddleware(verify);
}
