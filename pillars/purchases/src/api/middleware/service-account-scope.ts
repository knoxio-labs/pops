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
 * **Purchases does not require a credential — in production.** Browser
 * traffic arrives through the shell's nginx with no key, and the two-process
 * test drives the real server without one; requiring a credential would 401
 * both. The ingest CLI and the operator smoke script no longer belong on that
 * list — they present a key and are bound to its grant like any other machine
 * caller, alongside the MCP tools in `pillars/mcp/src/tools/purchases.ts` and
 * the orchestrator's federated search, which reach this pillar through
 * `pillar('purchases')`. The README records what would reverse the default.
 *
 * {@link REQUIRE_CREDENTIAL_ENV} is that reversal, scoped to a test rather
 * than a deployment: a live-seam suite that only ever sends a credentialled
 * call cannot tell "the grant was checked" from "nothing was checked and
 * happened to agree" unless the uncredentialled path is closed for the
 * duration of the test. Never set in a real deployment — doing so 401s the
 * shell's browser traffic, which carries no key and never will.
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

/**
 * Test-only escape hatch that flips the gate's posture to mandatory. See this
 * file's header for why a live-seam suite needs it and why nothing else may
 * ever set it.
 */
export const REQUIRE_CREDENTIAL_ENV = 'PURCHASES_REQUIRE_SERVICE_ACCOUNT_CREDENTIAL';

/**
 * Exported so the resolution rule itself is unit-testable without re-loading
 * this module under a different `process.env` — the gate below only ever
 * calls it once, at import time, which is otherwise untestable in isolation.
 */
export function resolveRequireCredential(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[REQUIRE_CREDENTIAL_ENV] === 'true';
}

const gate = createServiceAccountScopeGate({
  contract: purchasesContract,
  rootScope: PURCHASES_SCOPE_ROOT,
  logPrefix: 'purchases-api',
  requireCredential: resolveRequireCredential(),
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
