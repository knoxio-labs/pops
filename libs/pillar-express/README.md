# @pops/pillar-express

Express bindings for the decisions `@pops/pillar-sdk` makes without an HTTP framework.

Today that is one thing: `createServiceAccountScopeGate`, the inbound service-account gate [ADR-044](../../docs/architecture/adr-044-inbound-service-account-scope-enforcement.md) requires of every producer.

```ts
const gate = createServiceAccountScopeGate({
  contract: purchasesContract,
  rootScope: 'purchases',
  logPrefix: 'purchases-api',
});

export const purchasesScopeMap = gate.scopeMap;
app.use(gate.createMiddleware(createRegistryServiceAccountVerifier()));
```

Mount it **before** `createExpressEndpoints` and after any raw route (`/health`, `/pillars`, `/openapi`) — those are outside the contract, so the scope table has nothing to say about them and they pass untouched either way.

## Why this package exists rather than a subpath of the SDK

`libs/sdk` binds to no HTTP framework, and that is a deliberate, stated property — `authorizeServiceAccountRequest` is pure over an already-read header for the same reason `authenticateInternal` is. The Express plumbing around it is not: it reads `req.get('x-api-key')`, it resolves against `req.method` and `req.path`, and it answers on a `Response`.

That plumbing still has to exist once rather than ten times. Finance's original binding was ~110 lines of which exactly three things varied per pillar — the contract, the root scope, the log prefix — while the header read, the rejection log, the response bodies and the promise handling were the ADR's semantics, not the pillar's. Ten adoptions of that (POPS-1553, 1554, 1555, 1557, 1560, 1561, 1562, 1563, 1564, plus finance) is how the bare-origin parser reached twelve copies before anyone lifted it.

The two homes considered:

| home                        | why not / why                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@pops/pillar-sdk/express`  | Costs nothing to adopt — every pillar already depends on the SDK, so no Dockerfile or tsconfig edit. But it puts an Express binding inside the package whose invariant is that it has none, and that invariant would degrade from "no web framework, checkable in one manifest" to "no _runtime_ web framework on the _core_ subpaths" — a weaker claim nothing enforces. The SDK is also consumed by browser code.                                    |
| **A separate lib (chosen)** | Keeps `libs/sdk/package.json` free of `express` in every dependency field, so the invariant stays mechanically true. The dependency direction is one-way: `@pops/pillar-express` → `@pops/pillar-sdk` + express, and never the reverse. Costs each adopting pillar one dependency line, one `tsconfig.build.json` reference and four Dockerfile `COPY` lines — mechanical, and a missed `COPY` fails the Docker Build job loudly rather than silently. |

The gate's semantics belong to the SDK and stay there. This package holds only the binding, so a non-Express host would write its own ~40 lines against the same `authorizeServiceAccountRequest` without touching either.

## What the gate does not decide

`requireCredential` is the adopting pillar's call, not this package's. It defaults to `false` — the ADR-044 posture, where a caller presenting a key is held to its grant and a caller presenting none is left to the perimeter that already governs it. Setting it `true` closes the unauthenticated in-network path, which is a decision about ADR-027's trust boundary and is only affordable for a pillar all of whose callers carry keys. Both `finance` and `purchases` hold `false` today, and each says so in its own README.

## Testing an adoption

`gate.scopeMap` is returned rather than kept private for one reason: **an empty scope table gates nothing and passes every behavioural test.** A pillar that mounts the middleware but derives its map from the wrong object ships a decorative gate that no 401/403/503 assertion can catch. Export the map from the pillar's middleware module and assert it is non-empty and rooted at the pillar id — `pillars/purchases/src/api/__tests__/service-account-scope.test.ts` is the pattern.
