/**
 * Inbound service-account gate for the ai pillar's contract surface
 * (POPS-4130).
 *
 * Before this, every contract route the `pops-ai` container served ignored
 * `X-API-Key` entirely: a service account's grant constrained nothing here,
 * and revoking one revoked nothing either (ADR-044's revocation check only
 * runs where a key is actually verified). The decision and the registry
 * lookup live in `@pops/pillar-sdk/server`; the Express plumbing lives in
 * `@pops/pillar-express`. What is left here is the choice of what ai gates,
 * and its posture — the same shape inventory and purchases already adopted.
 *
 * **ai does not require a credential — in production.** The AI-ops UI's
 * traffic arrives through the shell's nginx with no key, and the cross-pillar
 * telemetry ingest (`POST /ai-usage/record`) is authenticated by an entirely
 * separate mechanism — a per-caller `x-pops-internal-credential` checked in
 * `api/app.ts`'s `requireInternalToken`, never `X-API-Key` — so it is
 * unaffected by this gate either way. A caller that DOES present an
 * `X-API-Key` is a machine, and is held to the service account behind that
 * key: today that is only inventory's `codes/suggest`, calling
 * `POST /codes/rank` with the `ai.codes.rank` scope.
 *
 * The required scope is derived from the WHOLE contract, not just the new
 * route, so a future route added to `aiContract` is gated the moment it
 * exists — there is no second list to forget, and no change here when the
 * next contract route ships. This does not change today's existing routes'
 * behaviour: none of their real callers (the shell's browser traffic, and the
 * internal-credentialled telemetry senders) ever present an `X-API-Key`, so
 * every one of them keeps hitting the uncredentialled, unconditionally-admitted
 * path this gate leaves alone.
 */
import { createServiceAccountScopeGate } from '@pops/pillar-express';

import { aiContract } from '../../contract/rest.js';

import type { RequestHandler } from 'express';

import type { ContractScopeMap, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

/**
 * Root of ai's scope vocabulary. A grant of `ai.codes` authorises
 * `ai.codes.rank` and nothing under `ai.aiUsage`.
 */
const AI_SCOPE_ROOT = 'ai';

const gate = createServiceAccountScopeGate({
  contract: aiContract,
  rootScope: AI_SCOPE_ROOT,
  logPrefix: 'ai-api',
  requireCredential: false,
});

/**
 * Every contract route projected onto the scope it requires. Built once at
 * module load; exported so a test can assert it actually covers the contract
 * and names `ai.codes.rank` specifically, since an empty table would gate
 * nothing and still pass every other test.
 */
export const aiScopeMap: ContractScopeMap = gate.scopeMap;

/**
 * Build the gate. Mount it BEFORE `createExpressEndpoints`, after the raw
 * probes (`/health`, `/pillars`, `/openapi`, which carry no scope) and after
 * `requireInternalToken` (which governs a different credential on a
 * different path), so it runs ahead of every contract handler.
 *
 * @param verify Resolves a presented key to its principal. Production passes a
 *   registry-backed verifier; tests inject a fake.
 */
export function createServiceAccountScopeMiddleware(
  verify: ServiceAccountVerifier
): RequestHandler {
  return gate.createMiddleware(verify);
}
