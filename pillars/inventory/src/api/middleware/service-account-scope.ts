/**
 * Inbound service-account gate for the inventory contract surface.
 *
 * Before this, inventory served any request that reached it on the docker
 * backend network: a presented `X-API-Key` was ignored, so a service
 * account's grant constrained nothing here and revoking that account
 * revoked nothing either, because the revocation check only runs where a key
 * is verified (ADR-044). The decision and the registry lookup live in
 * `@pops/pillar-sdk/server`; the Express plumbing lives in
 * `@pops/pillar-express`. What is left here is the choice of what inventory
 * gates, and its posture — the shape purchases already adopted (ADR-044,
 * POPS-3329).
 *
 * **Inventory does not require a credential — in production.** Browser
 * traffic arrives through the shell's nginx with no key, and callers on the
 * docker network that present none must keep working. A caller that
 * presents an `X-API-Key` is a machine, and is held to the service account
 * behind that key: purchases (`inventory.items`), bfm's mobile relay
 * (`inventory.sync`, `inventory.types`, `inventory.codes`, `inventory.media`)
 * and the MCP tools in `pillars/mcp/src/tools/inventory.ts`, which reach
 * this pillar through `pillar('inventory')`. The README records what would
 * reverse the default.
 *
 * {@link REQUIRE_CREDENTIAL_ENV} is that reversal, scoped to a test rather
 * than a deployment: a live-seam suite that only ever sends a credentialled
 * call cannot tell "the grant was checked" from "nothing was checked and
 * happened to agree" unless the uncredentialled path is closed for the
 * duration of the test. Never set in a real deployment — doing so 401s the
 * shell's browser traffic, which carries no key and never will.
 *
 * The required scope is derived from the contract itself, so a route added to
 * `inventoryContract` — including the sync surface `rest-sync.ts` adds — is
 * gated the moment it exists; there is no second list to forget. Paths
 * outside the contract — `/health`, `/pillars`, `/openapi` — resolve to no
 * scope and are untouched.
 *
 * **This gate must not deploy before the registry grants are widened.**
 * bfm's service account needs `inventory.sync`, `inventory.types`,
 * `inventory.codes` and `inventory.media`, and the MCP account's grant must
 * include `inventory`, or every one of those callers starts answering `403`
 * the moment this ships — exactly what POPS-1878 did to purchases when its
 * own gate landed ahead of the MCP grant. See the README's "Who may call
 * it" section.
 */
import { createServiceAccountScopeGate } from '@pops/pillar-express';

import { inventoryContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

/**
 * Root of inventory's scope vocabulary. A grant of `inventory.items`
 * authorises `inventory.items.list` and nothing under `inventory.locations`.
 */
const INVENTORY_SCOPE_ROOT = 'inventory';

/**
 * Test-only escape hatch that flips the gate's posture to mandatory. See this
 * file's header for why a live-seam suite needs it and why nothing else may
 * ever set it.
 */
export const REQUIRE_CREDENTIAL_ENV = 'INVENTORY_REQUIRE_SERVICE_ACCOUNT_CREDENTIAL';

/**
 * Exported so the resolution rule itself is unit-testable without re-loading
 * this module under a different `process.env` — the gate below only ever
 * calls it once, at import time, which is otherwise untestable in isolation.
 *
 * Gated on `NODE_ENV !== 'production'` as well as the flag itself: compose
 * sets `NODE_ENV=production` for every deployed container, so a stray `true`
 * left on that env var in production can never flip the gate to mandatory.
 * `resolveContractScope` covers the whole contract surface, so a mandatory
 * gate 401s the shell's browser traffic outright while `/health`, `/pillars`
 * and `/openapi` — outside the contract — stay green, masking the outage from
 * both the compose healthcheck and the image smoke probe.
 */
export function resolveRequireCredential(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[REQUIRE_CREDENTIAL_ENV] === 'true' && env['NODE_ENV'] !== 'production';
}

const gate = createServiceAccountScopeGate({
  contract: inventoryContract,
  rootScope: INVENTORY_SCOPE_ROOT,
  logPrefix: 'inventory-api',
  requireCredential: resolveRequireCredential(),
});

/**
 * Every contract route projected onto the scope it requires. Built once at
 * module load; exported so a test can assert it actually covers the contract,
 * since an empty table would gate nothing and still pass every other test.
 */
export const inventoryScopeMap: ContractScopeMap = gate.scopeMap;

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
