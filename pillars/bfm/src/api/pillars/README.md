# Talking to the rest of the federation

Everything bfm needs to call a sibling pillar, and the one shape every such
call comes back in.

```
server.ts
  └─ configureBfmServerSdk()           sdk-config.ts   ← once, before listen
       ├─ resolveServiceAccountKey()   service-account.ts
       ├─ resolveRegistryUrl()         env.ts
       ├─ resolveInternalBaseUrls()    env.ts
       └─ returns BfmSdkConfig ────────► createBfmApiApp({ internalBaseUrls })

a request handler
  └─ createPillarGateway().call(id, …)  gateway.ts
       └─ pillar(id) from @pops/pillar-sdk/server
            → CallResult  ──translated──→  GatewayOutcome
```

The one caller today is `../finance/`, which turns finance's transaction list
into the mobile one — see "The mobile shape" in the pillar README for what that
reshaping is allowed to do. `../rest/upstream-error.ts` is where a
`GatewayOutcome`'s failure arm becomes the status a phone sees, and it is the
only place that translation happens.

## Two registry origins, set from one value

The SDK has two surfaces that each keep their own registry origin: the server
`pillar()` factory, configured through `configureServerSdk`, and the discovery
cache behind `pillarRegistry()`, which [`../mobile/`](../mobile/README.md) reads
the pillar roster from. `sdk-config.ts` sets both from the same resolved value,
because a deployment that discovered a roster from one registry and called
pillars discovered by another would report a federation it cannot reach.

It returns the resolved base-URL overrides for the same reason. The mobile
reachability probe has to aim at the hosts outbound calls will actually use, and
re-reading the environment somewhere else is how the two come to disagree.

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
  in `.oxlintrc.json` and catches it — but the rule is switched **off** for
  test files, so a floated call in a `__tests__/` file passes lint and then
  passes the assertion it was supposed to make.
- **Never call `.orThrow()`.** No production call site in this repo does.

Nothing here catches, either. The SDK already folds its own discovery and
OpenAPI failures into `unavailable` / `contract-mismatch`, so an exception
arriving at this layer is a programming fault and must not be dressed up as an
outage.

## What the account can actually reach

`BFM_SERVICE_ACCOUNT_SCOPES` in `service-account.ts` is the grant, and it is
narrow on purpose. It is also enforced: `finance` — the only pillar bfm calls —
resolves the presented `X-API-Key` against the registry and refuses any
operation the grant does not cover, so widening the mobile surface to a second
finance module means widening the grant in the same change. Producers that have
not adopted the guard yet still serve any in-network caller; each has its own
adoption ticket.

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
