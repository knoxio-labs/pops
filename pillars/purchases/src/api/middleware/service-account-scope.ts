/**
 * Inbound service-account gate for the purchases contract surface.
 *
 * Before this, purchases served any request that reached it on the docker
 * backend network: a presented `X-API-Key` was ignored, so a service account's
 * grant constrained nothing here and revoking that account revoked nothing
 * either, because the revocation check only runs where a key is verified
 * (ADR-044). The decision and the registry lookup live in
 * `@pops/pillar-sdk/server`; the Express plumbing lives in
 * `@pops/pillar-express`. What is left here is the choice of what purchases
 * gates, and its posture.
 *
 * **Purchases does not require a credential.** Every caller it has today
 * presents none — the ingest CLI, the operator smoke script, the two-process
 * test — and it has no credentialled caller at all: nothing in the tree calls
 * `pillar('purchases')`. Requiring one would 401 the pillar's only working
 * data paths in order to constrain an empty set. The gate still installs the
 * whole mechanism, so the first credentialled caller is bound to its grant and
 * to revocation without a second change. The README records the reversal
 * precondition.
 *
 * The required scope is derived from the contract itself, so a route added to
 * `purchasesContract` is gated the moment it exists; there is no second list to
 * forget. Paths outside the contract — `/health`, `/pillars`, `/openapi` —
 * resolve to no scope and are untouched.
 */
import { createServiceAccountScopeGate } from '@pops/pillar-express';

import { purchasesContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

/**
 * Root of purchases' scope vocabulary. A grant of `purchases.purchase`
 * authorises `purchases.purchase.list` and nothing under `purchases.source`.
 */
const PURCHASES_SCOPE_ROOT = 'purchases';

const gate = createServiceAccountScopeGate({
  contract: purchasesContract,
  rootScope: PURCHASES_SCOPE_ROOT,
  logPrefix: 'purchases-api',
});

/**
 * Every contract route projected onto the scope it requires. Built once at
 * module load; exported so a test can assert it actually covers the contract,
 * since an empty table would gate nothing and still pass every other test.
 */
export const purchasesScopeMap: ContractScopeMap = gate.scopeMap;

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
