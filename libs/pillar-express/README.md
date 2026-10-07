# @pops/pillar-express

Express bindings for the decisions `@pops/pillar-sdk` makes without an HTTP framework.

The centre of it is `createServiceAccountScopeGate`: the inbound service-account gate [ADR-044](../../docs/architecture/adr-044-inbound-service-account-scope-enforcement.md) requires of every producer, which also resolves who a browser request is.

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

## Who the request is

The same middleware resolves a principal and puts it on the response; a handler reads it with `readPrincipal(res)`.

| request carries                                 | principal                           |
| ----------------------------------------------- | ----------------------------------- |
| `X-API-Key`                                     | `{ kind: 'service' }`               |
| a verified `cf-access-jwt-assertion`            | `operator` or `guest`, by its email |
| neither (LAN, Tailscale, dev, never via Access) | `{ kind: 'operator', email: null }` |

An email in `POPS_OPERATOR_EMAILS` (comma-separated, compared trimmed and lower-cased) is the operator. Any other verified email is a guest, and a guest is refused with 403 before any handler runs on everything except a contract route whose metadata is `guestRoute()` (from `@pops/pillar-sdk/server`) and `/health`. That includes declared raw routes and paths outside the contract, so a route mounted after the gate is closed to guests until its contract entry says otherwise. A token that does not verify is 401.

**Classification is off until both `POPS_OPERATOR_EMAILS` and `CLOUDFLARE_ACCESS_TEAM_NAME` are set.** Until then the token is not read, nobody is a guest, every request without a key is the operator, and the gate logs one warning when its first middleware is built. An unset variable never refuses anyone; it means a guest added to the Access policy would be treated as the operator, so set both before adding one.

Two edges worth knowing:

- A key is the caller's identity only where the gate verifies it. On a path outside the scope table a key is never checked, so there a token riding beside it decides instead; otherwise a guest could attach a made-up key to reach every unscoped path.
- An Access service token carries no email, so with classification on it is 401 unless the request also presents an `X-API-Key` on a scoped route.

### A guest a service account speaks for

bfm's hostname bypasses Access, so a guest's phone has no token to classify. A pillar that passes `delegatedSubjectScope` lets a service account name the guest instead:

```ts
createServiceAccountScopeGate({ ..., delegatedSubjectScope: 'finance.delegatedSubject' });
```

A request whose key holds that scope and which carries `X-Pops-Subject-Email` is answered as `{ kind: 'guest', email }`, the email trimmed and lower-cased, and every guest rule above applies to it. The key must still cover the route's own scope.

| request                                                     | answer                               |
| ----------------------------------------------------------- | ------------------------------------ |
| no header                                                   | exactly as without the option        |
| header, key holds the scope                                 | the named guest                      |
| header, key lacks the scope                                 | 403                                  |
| header, no key (a browser session, LAN, a path never keyed) | 403                                  |
| header is not one email address                             | 400, `<pillar>.auth.subject_invalid` |

The header is refused rather than ignored from a caller that may not delegate, so nothing can quietly be answered as the service when it asked to be answered as a guest. Delegation does not wait for `POPS_OPERATOR_EMAILS`: it only narrows what the key could already do, and a named guest must never see the service's reach. A pillar that omits the option does not read the header at all.

`readPrincipal` throws on a response the gate never saw. A route mounted ahead of the middleware has no principal, and answering "operator" there would be a mounting mistake handing a guest the owner's access.

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

`gate.scopeMap` is returned rather than kept private for one reason: **an empty scope table gates nothing and passes every behavioural test.** A pillar that mounts the middleware but derives its map from the wrong object would otherwise ship a decorative gate that no 401/403/503 assertion can catch, because `resolveContractScope` treats every unmatched path as outside the contract and the auth decision admits those unconditionally.

`createServiceAccountScopeGate` now throws at construction time when the projected map is empty, naming the pillar's `logPrefix` and `rootScope`, so passing the wrong object (an OpenAPI document, a handler map, an empty object) is a boot failure rather than a silent hole. That closes the hazard for a pillar that never runs the gate at all in its tests, but it is still worth exporting the map and asserting it is non-empty and rooted at the pillar id — `pillars/purchases/src/api/__tests__/service-account-scope.test.ts` is the pattern — because the throw only proves the map is non-empty, not that it covers the routes you meant to gate.
