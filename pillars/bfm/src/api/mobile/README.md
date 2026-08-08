# What the phone is told

The routes below `/mobile`, and the one decision they all inherit: the app
renders what this pillar says is available, and never holds a list of pillars
of its own.

```
GET /mobile/bootstrap        (behind requireDevice)
  └─ buildMobileBootstrap()                    bootstrap.ts
       ├─ touchDevice(db, id, now)             ../../db  ← written first, always
       ├─ pillarRegistry()                     @pops/pillar-sdk/discovery (TTL'd)
       ├─ probeFederation(pillars)             reachability.ts   ← one live GET each
       └─ deriveFeatures(probed)               features.ts
```

## Why a pillar's reachability takes two sources to answer

`reachability.ts` asks the registry first and the pillar second, and the order
is the design rather than an optimisation.

The registry's answer is a **veto**. `pillar()` refuses a call to an
unregistered or unhealthy peer on exactly that basis, so a probe that reached
past the veto could report `healthy` for a pillar every subsequent call then
fails on — a bootstrap that promises a feature the next request cannot deliver
is worse than one that admits the feature is off.

Everything the registry has not vetoed gets one live `GET ${baseUrl}/openapi`.
That endpoint rather than `/health` because it is what a cross-pillar call
actually needs: the SDK builds its route map from that document, and a pillar
serving none is uncallable however alive it is. One request separates the two
answers that matter — a request that never completed means nobody answered, and
a request that completed with anything but 2xx JSON means somebody answered
without a contract.

The body is never read. Pillar OpenAPI documents run to hundreds of kilobytes
and app launch is not the moment to move megabytes to learn something the
response headers already carry. The cost is that a pillar answering `200
application/json` with a body that is not an OpenAPI document reads as healthy;
that is accepted deliberately, and it is the only gap between this probe's
verdict and what a real call would find.

Base-URL overrides apply here too. The map `configureServerSdk` hands
`InternalBaseUrlTransport` for outbound calls is threaded into the probe by
`src/api/rest/handlers.ts`, because probing the registry-advertised hostname
while calls go somewhere else would report a federation nobody is talking to.

## The four states, and the pair that must not collapse

`unavailable`, `degraded`, `contract-mismatch` and `healthy` — the same
vocabulary `src/api/pillars/gateway.ts` speaks, so the answer bootstrap gives
the phone cannot disagree with the answer a real call gives it a moment later.
`../../contract/rest-schemas.ts` carries what each one means.

The one that earns the whole endpoint is `unavailable` versus
`contract-mismatch`: "nobody answered" and "answered, but uncallably" send an
operator to different places, and the only moment this pillar is worth having
is when the fleet is half-broken.

## Features, and what the phone never learns

`features.ts` is the one place a mobile surface is declared, and a feature is
reported as exactly as reachable as the pillar behind it. Every known feature
is always listed. Omitting the unreachable ones would leave the app unable to
tell "finance is down, try again" from "this build is talking to a server that
has never heard of transactions", and those need different words on screen.

What crosses the wire is a feature id and a reachability — never the pillar
behind it. That is what lets the app explain an absence without learning the
federation's topology.

## A registry outage is not a failed launch

If the discovery cache cannot answer at all, `/mobile/bootstrap` still returns
`200`, with no pillars, no reachable features, and `registry.source:
'unavailable'`. A `500` would be a phone stuck on its splash screen because a
sibling container blinked. The SDK does the rest: while the cache holds
anything, a failed refresh serves last-known-good and says so through
`stale-fallback`.

An error that is _not_ a registry outage propagates. The SDK folds every
reachability failure into a value, so an exception arriving here is a fault in
this process and must not be dressed up as an unhealthy federation.

## `lastSeenAt` is written here, and also in the guard

The device's check-in is recorded before the registry is read, because it is
true regardless of how the rest of the call goes. This route's write is
unconditional and uses its own instant (`deps.now()`) rather than the
coalesced one `require-device.ts` may or may not have just written, because
`BootstrapDeviceSchema` promises the response carries the exact value this
request wrote — not a value up to a minute stale.

Every other `/mobile/*` route relies on the guard's coalesced write instead
(`auth/README.md`); bootstrap is the one place that needs an uncoalesced
instant, so it is the one place that takes the extra write rather than reading
back what the guard already did.
