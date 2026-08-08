# Talking to the rest of the federation

Everything bfm needs to call a sibling pillar, and the one shape every such
call comes back in.

```
server.ts
  └─ configureBfmServerSdk()           sdk-config.ts   ← once, before listen
       ├─ resolveServiceAccountKey()   service-account.ts
       ├─ resolveRegistryUrl()         env.ts
       └─ resolveInternalBaseUrls()    env.ts

a request handler
  └─ createPillarGateway().call(id, …)  gateway.ts
       └─ pillar(id) from @pops/pillar-sdk/server
            → CallResult  ──translated──→  GatewayOutcome
```

## The trap this directory exists to avoid

`@pops/pillar-sdk` exports **two** `pillar()` functions with the same name and
the same shape. `/client` is unauthenticated; `/server` attaches the
service-account key, applies the base-URL overrides, and memoises the handle.
The cross-pillar clients already in `finance`, `inventory` and `purchases` all
import the `/client` one, so copying the obvious neighbour is how a backend
caller silently loses its credential — the code compiles, runs, and the only
symptom is a header that stopped being sent.

`__tests__/service-account-header.test.ts` is what keeps that honest. It stands
up a real HTTP server, drives it through the real SDK, and asserts `X-API-Key`
reaches the wire — with a `/client` control beside it asserting the opposite.
Both must keep passing.

## Failure is a value, all the way out

`pillar()` never throws for an unhealthy federation; it returns a `CallResult`.
`gateway.ts` translates that into bfm's own vocabulary and keeps `unavailable`,
`degraded` and `contract-mismatch` as three separate outcomes with three
separate statuses. The phone is the reason: those answer three different
questions, and the only moment this pillar is worth having is when the fleet is
half-broken.

Two rules follow, and neither is optional:

- **Never float a gateway promise.** An un-awaited call discards the failure
  discriminant in total silence. `typescript/no-floating-promises` is an error
  repo-wide and catches it.
- **Never call `.orThrow()`.** No production call site in this repo does.

Nothing here catches, either. The SDK already folds its own discovery and
OpenAPI failures into `unavailable` / `contract-mismatch`, so an exception
arriving at this layer is a programming fault and must not be dressed up as an
outage.

## What the account can actually reach

`BFM_SERVICE_ACCOUNT_SCOPES` in `service-account.ts` is the grant, and it is
narrow on purpose. It is also, today, enforced by nobody bfm calls: the
registry pillar is the only one in the fleet that checks `X-API-Key`, and its
scope gate covers `core.features.*` / `core.settings.*` only. Whether that
stays the model is POPS-1447.

## What is not here

The gateway classifies failures bfm sees when it calls **out**. Classifying
`unavailable` for bfm's own **inbound** traffic is a separate concern the SDK
deliberately does not own — see the "Unavailable-classification is not the
SDK's" section of [`libs/sdk/README.md`](../../../../../libs/sdk/README.md).

Nor is any parsing. `env.ts` chooses which variables to read and shapes the
result; `parseBareOrigin` and `parsePillarsEnv` belong to
`@pops/pillar-sdk/pillar-env`, which is the fleet's single definition of what
a pillar base URL may look like. A rule that needs tightening is tightened
there, not copied here.

The one thing `env.ts` does not borrow is the variable name: overrides come
from `POPS_INTERNAL_BASE_URLS`, not `POPS_PILLARS`. Its header says why, and
the reason is worth reading before anyone "simplifies" it back.
