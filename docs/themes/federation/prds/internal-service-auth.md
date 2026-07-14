# Internal service auth — per-caller credentials

> Theme: [Federation](../README.md)
>
> Status: In progress (E23). Delivers ADR-039 (#3679) workstream #3700 entanglements **E22** and **E23**. Prod-gated: needs per-caller secret minting + vault edits on live capivara. **E22 is Done + verified live in prod** via **option C** (per-caller static secrets): Stage 1 (shared verifier), Stage 2 (accept-both `name.secret` credential + scope), Stage 3 (mint/wire), Stage 4 (cutover — shared `POPS_API_INTERNAL_TOKEN` dropped from code, env, compose, and vault). **E23** (split the shared `pops_api_key` via registry service accounts) remains.

## Purpose

Every internal trust boundary is guarded by a credential unique to one `(caller)` or `(caller, callee)` relationship, so revoking or rotating one caller never re-keys any other. Two shared secrets stand in the way today and are retired here:

- **E22** — a single internal token shared by every service-to-service call (worker→api callbacks, AI-usage telemetry sinks, the registry settings fan-out).
- **E23** — a single inbound key presented by two structurally different callers (the moltbot assistant and the MCP server), so their audit trails and revocation cannot be separated.

Both converge onto **one** verification mechanism: the registry's service-account credentials (`pops_sa_*` keys, scrypt-verified against scoped `service_accounts` rows), which already back the SDK's `pillar()` transport. No new credential primitive is introduced.

## Direction

| Boundary                                             | Build                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal callback + telemetry + settings calls (E22) | Each caller carries its own credential; each callee verifies against the set it accepts, gated by a scope naming the procedure it may reach. A single shared verifier helper replaces the per-pillar inline checks so no callee re-implements it. |
| Inbound assistant / MCP calls (E23)                  | Two distinct service accounts (`moltbot`, `pops-mcp`), each scoped to only what that surface calls, each delivered its own secret. The shared key is accepted only until both surfaces present their own, then retired.                           |
| Enforcement gap                                      | Callees that accept a machine key but perform no verification today gain the registry identity middleware, accepting old and new credentials before cutover.                                                                                      |

Migration is **accept-both → cutover** at every seam: a callee accepts the legacy secret and the new credential simultaneously; only once every caller presents the new one is the legacy branch and its env/vault entry removed. No flag day.

### Open decision

How a non-registry callee verifies a minted key (the key store lives only in the registry) has three shapes, to be settled before E22 stages 3–4:

| Option                          | Mechanism                                                    | Trade-off                                                                     |
| ------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **A** Registry verify endpoint  | callee asks the registry to validate the key, caches briefly | central mint/revoke; adds a registry round-trip to a hot path                 |
| **B** Signed short-lived tokens | registry issues tokens callees verify offline                | no per-request registry call; new token infra + lifecycle                     |
| **C** Per-caller static secrets | one secret per caller, callee holds its accepted set         | smallest change, no new dependency; revocation is a vault edit, not a DB flip |

Recommendation: **C** for E22 (the internal caller→callee graph is small and static), and the existing service-account path for E23 (both callers already present `pops_sa_*` keys). A/B become worth it only if central DB-driven revocation of internal callers is required. Stages 1–2 below are identical under any option.

## Sequencing

1. **Shared verifier (safe, no prod).** Extract the duplicated internal-token check into one tested helper taking the accepted-secret source and the internal-path allow-list. Pure refactor, backward-compatible, lands ahead of the decision.
2. **Accept-both.** The helper accepts the legacy secret and the new credential; every current caller keeps working unchanged.
3. **Mint + wire (prod-gated).** Create per-caller credentials (service accounts and/or vault secrets), inject one per caller, and have each caller present the new credential alongside the legacy one.
4. **Cutover.** Once every caller presents the new credential, drop the legacy secret from verifiers, env, compose, and vault.
5. **E23 split.** Mint `moltbot` + `pops-mcp` accounts, give each its own secret, prefer it in the reader with the shared key as fallback, roll identity middleware onto the unverified callees, then retire the shared key.

The MCP front-door bearer token is a separate inbound secret and is out of scope.

## Ops steps that gate deployment

- Mint the per-caller / per-surface service accounts against the **live** registry (admin-only), capturing each one-time plaintext.
- Write those plaintexts into the capivara vault — not automatable from the repo.
- Otherwise standard homelab auto-deploy, verified per callee.

## Acceptance Criteria

- [x] A single shared verifier helper enforces internal auth; no pillar re-implements the check inline. Its unit tests cover accept, reject, and missing-secret. (`authenticateInternal` in `@pops/pillar-sdk/server`; ai + food callees delegate to it.)
- [x] Every internal caller→callee pair (worker→food-api callback; food-worker / cerebrum / finance → ai-api usage; ops backfill → ai-api) authenticates with a credential unique to that caller; revoking one caller leaves the others working (a caller whose secret env is blank is dropped by `parseInternalCallers`, covered by a test that rejects it while a sibling still passes).
- [x] Each internal callee gates its internal path on a scope naming that procedure; a caller lacking the scope is rejected with 403.
- [ ] `moltbot` and `pops-mcp` present distinct credentials; a request is attributable to exactly one of them at the verification point (asserted by a test on the resolved principal name). (E23)
- [ ] Callees that accept a machine key verify it (no path trusts the docker network implicitly for an authenticated route); accept-both is proven by tests passing with either credential during transition. (E22 callees verified; the remaining unverified enforcement-gap callees land with E23.)
- [x] `POPS_API_INTERNAL_TOKEN` is removed from code, env, compose, and vault once the E22 cutover completes; a repo search finds no remaining reader.
- [ ] The shared `pops_api_key` is removed from code, env, compose, and vault once the E23 cutover completes; a repo search finds no remaining reader.
- [ ] Existing internal-auth and service-account tests continue to pass unchanged through each accept-both stage. (Held through the E22 stages; re-asserted through E23.)

## Out of scope

- Distinct per-pillar Anthropic keys (a separate isolation step).
- The MCP front-door bearer token (`MCP_INBOUND_TOKEN`).
- Replacing the unauthenticated pillar self-registration handshake.
