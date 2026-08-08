# @pops/bfm

The **bfm** pillar — Backend-for-Mobile. It exists to be the one backend the
native iPhone client dials, fanning out to the rest of the federation on the
client's behalf so the client holds exactly one base URL and one credential.
It listens on port **3014**.

It owns a database — the device allow-list, described under
[Persistence](#persistence) below — which makes it a data pillar by kind
(ADR-035). It has no mobile route yet (POPS-1378, POPS-1379), though the
perimeter those routes will sit behind is already in place, alongside the
operator surface that mints the codes a phone pairs with — see
[The perimeter](#the-perimeter). `/health` is a pure liveness shape rather
than a DB round-trip, which is deliberate for a container healthcheck and is
why the database opens **before** `listen`: the probe cannot tell you the
schema migrated, so boot has to. It carries a shell-side operator surface,
under [`app/`](./app/README.md).

It also holds a service-account credential and one way to spend it — see
[Reaching sibling pillars](#reaching-sibling-pillars) and
[`src/api/pillars/README.md`](src/api/pillars/README.md).

| Surface                        | What it does                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `GET /health`                  | Liveness shape. Served from the ts-rest contract, so it cannot drift from the doc.         |
| `GET /openapi`                 | The committed contract projection, served verbatim so peers build a route map.             |
| `POST /operator/pairing/codes` | Mints a single-use pairing code. The plaintext is returned once and never again.           |
| `GET /operator/devices`        | Paired handsets, revoked ones included. Never returns a token or a key.                    |
| `DELETE /operator/devices/:id` | Soft-revokes, and kills the device's refresh-token family in the same transaction.         |
| `/mobile/*`                    | Reserved for the phone and gated by `requireDevice`. No route lives there yet — see below. |

`/health` answers without a database round-trip, which is why an unreachable
`bfm.db` still reads as live.

When `POPS_REGISTRY_ENABLED=true` it self-registers with the `registry` pillar
on boot via `bootstrapPillar` from `@pops/pillar-sdk/bootstrap`. Registration
runs **after** `app.listen` and never gates boot: an unavailable registry
delays bfm joining the fleet, it does not delay bfm serving traffic.
`src/api/__tests__/registration.test.ts` is the proof — it boots against a
registry that refuses every call and asserts `/health` still answers.

## The perimeter

Everything here follows from a fact that is easy to miss reading the routes:
**bfm answers on two hostnames, and only one of them is behind Cloudflare
Access.**

- The shell's nginx reaches it at `/bfm-api/`, behind Access. That is where an
  operator arrives.
- Its own Cloudflare Tunnel hostname has Access **bypassed** (POPS-1389),
  because the phone has to reach the pairing exchange (POPS-1374) and refresh
  (POPS-1375) without an Access session.

One Express app serves both, so it carries two independent gates on two
different axes: one authenticates a **phone**, the other a **human**.

### `/mobile/*` — the device gate

Everything under `/mobile` is behind the access-token guard in
[`src/api/auth/`](src/api/auth/README.md), mounted as a path prefix in
`src/api/app.ts`. The routes it protects arrive later (POPS-1374, POPS-1378,
POPS-1379); the guard is in front of the prefix now so none of them can arrive
public. A request to an unrouted `/mobile/*` therefore answers `401`, not
`404`.

That directory's README carries the whole of the reasoning: why a rejected
token is a `401` and a revoked device a `403`, why a missing device row is a
`401` rather than either, what is never logged, and what is deliberately absent
(refresh — POPS-1375, rate limiting — POPS-1468, `lastSeenAt` — POPS-1469).

### `/operator/*` — the human gate

Because the bypassed hostname serves this same app, the operator routes are
reachable from the public internet and the `requireOperator` gate in their
handlers is the **actual** perimeter, not defence in depth. The `/operator`
prefix earns its keep by making a _second_ layer expressible: that hostname can
refuse `/operator/*` wholesale at the edge (POPS-1389), which it could not do if
the operator device list and the public `POST /devices/pair` both sat under
`/devices`.

`src/api/middleware/identity.ts` resolves the principal and deliberately drops
two legs of the registry's otherwise-identical chain. Both omissions are
load-bearing and the file states why at length; in short:

- **No service-account leg.** bfm holds no `service_accounts` table and the
  registry exposes no endpoint to verify a presented key, so there is nothing an
  `x-api-key` could be checked against. Machine callers have no business minting
  pairing codes anyway — the account bfm holds is for its _outbound_ calls.
  POPS-1473 tracks the registry-side verify endpoint if that changes.
- **No "trust the tunnel" fallback.** The registry reads a missing
  `CLOUDFLARE_ACCESS_TEAM_NAME` as "we are only reachable through a protected
  tunnel". On a hostname that bypasses Access, that would resolve every caller
  on the internet to an operator. Here it means anonymous: the operator surface
  goes dark rather than open, and a test pins it.

`/health` and `/openapi` sit outside both gates and are deliberately
unauthenticated — the fleet's liveness probes and the SDK's route-map build
both reach them without a device or a session.

### Rate limiting

Pairing-code issuance is budgeted per operator — five per fifteen minutes, in
`src/api/rate-limit.ts`. A code short enough to type is short enough to guess if
the endpoint will mint unlimited attempts against it.

The counter is **in memory**, which is correct for a single-container pillar and
wrong the moment there are two: the limit would become per-replica and the
effective budget would multiply. POPS-1474 holds that, and names whichever
change adds a second replica as the trigger.

The gate runs _before_ the limiter, deliberately. Limiting first would let an
anonymous flood exhaust the real operator's budget and lock them out of pairing
— a denial of service handed to an unauthenticated caller. A test pins the
ordering.

## Persistence

`bfm.db` is the fleet's answer to "which phones may reach it". Three tables in
`src/db/schema/` carry the whole of it — `pairing_codes` is the one-time secret
an operator reads out, `devices` is the handset it turned into, and
`refresh_tokens` is a rotating chain per pairing. Each file states its own
reasoning; the properties that span them are these:

- **No plaintext credential is written.** Both bearer-shaped values — the
  pairing code and the refresh token — are stored as digests, and
  `devices.publicKeyDer` is the public half of a key whose private half is
  non-extractable inside the phone's Secure Enclave.

  That makes `bfm.db` inert for the refresh tokens, which are CSPRNG-generated
  at full width. It is now inert for pairing codes too, and by which of the two
  available routes is worth stating because the column comments were written
  before the choice was made: **entropy, not a pepper.** A pairing code is 12
  characters over a 31-glyph alphabet — every confusable pair (`0`/`O`,
  `1`/`I`/`L`) excluded outright rather than folded on read — which is ~59 bits
  and leaves nothing tractable to enumerate offline. The alternative was a
  shorter code under a keyed digest, which bought four characters at the price
  of a boot-critical secret to provision, mount, rotate and lose. The QR is the
  primary path, so those characters cost nothing real.

  A plain SHA-256 is the right digest here for the same reason a password hash
  would be the wrong one: there is no low-entropy input to slow an attacker
  down over, and pairing is a latency-visible interactive step.

- **Nothing is destroyed to express distrust.** Revoking a device sets
  `devices.revokedAt` and leaves the row; killing a token sets
  `refresh_tokens.revokedAt`, which is deliberately a different column from the
  `consumedAt` a legitimate rotation writes. After a phone is stolen, the
  question is what it held and when it last spoke, and neither is answerable
  against rows that were deleted or overwritten.
- **`foreign_keys = ON` is load-bearing, not hygiene.** `refresh_tokens`
  cascades from `devices` and self-references through `replacedBy`; SQLite
  silently ignores both when the pragma is off, so an opener that forgot it
  would let an orphaned chain read as an intact one.

`migrations/0000_bfm_init.sql` was produced by `drizzle-kit generate` and
committed, but this repo runs no generate step in its build or CI (see the
"Database Management" note in the root `mise.toml`). The drizzle definitions
and the SQL are therefore two independent descriptions that nothing forces to
agree — `src/db/__tests__/schema-migration-drift.test.ts` is what keeps them
honest, introspecting the migrated database and diffing it against the schema
in both directions.

## The operator surface

`app/` is the `@pops/app-bfm` frontend module — the operator's device surface,
mounted by the shell at `/bfm` and labelled **Devices** on the app rail. It
lives in the shell rather than on the phone because the shell already sits
behind Cloudflare Access, which is what makes "only the operator can mint a
pairing code" true. See [`app/README.md`](./app/README.md).

That app is why `src/contract/manifest.ts` now exports a runtime
`ModuleManifest` alongside the contract type: `libs/module-registry` discovers
it through the `./manifest` export and turns it into an installed module in
the shell's static registry, which is what makes `bfm` a gateable id in
`POPS_APPS`. Before there was a shell surface to install, that value would
have installed a phantom app — which is why it waited for the app. Registry
registration is a separate mechanism and still goes through the
`ManifestPayload` in `src/api/manifest.ts`.

## What deliberately does not live here

- **The device-side exchange.** `POST /devices/pair` is POPS-1374 and lands on
  the Access-bypassed surface. The pieces it needs from here already exist:
  `redeemPairingCode` in `src/db/services/pairing-codes.ts` spends a code
  atomically — the whole check is the `WHERE` clause of one `UPDATE`, so two
  requests racing the same code cannot both win — and it takes a `BfmDb`, which
  a transaction handle also satisfies, so the exchange can compose it into the
  same transaction as its device insert. Tests drive exactly that, in both
  directions: a rolled-back transaction leaves the code spendable, a committed
  one does not.
- **Any route that mints an access token.** `mintAccessToken` exists and is
  exercised, but its two callers do not: the pairing exchange (POPS-1374) and
  the refresh route (POPS-1375). Until one lands, no phone can obtain a token
  and every `/mobile/*` request is a `401` by construction.
- **The mobile contract and the nginx route.** The mobile-facing routes
  (POPS-1378, POPS-1379) and the nginx route plus the compiled pillar roster
  (POPS-1386) are each their own ticket. Revocation here sets
  `devices.revokedAt`, which is the column `requireDevice` already reads — so
  "a revoked phone fails its very next request" is live for `/mobile/*` and
  will extend to every route added under it.
- **Any pruning of the credential tables.** Consumed and expired pairing codes
  and dead refresh tokens accumulate; nothing deletes them (POPS-1449).
- **Any enforcement of what the service account may reach.** The grant is
  narrow and auditable, but the registry pillar is the only one in the fleet
  that reads `X-API-Key` at all — every other producer serves any in-network
  caller. Whether that stays the model is POPS-1447.

## Reaching sibling pillars

bfm calls siblings through `pillar()` from `@pops/pillar-sdk/server` — the
authenticated surface, not the identically-shaped `/client` one — behind a
gateway that keeps `unavailable`, `degraded` and `contract-mismatch` distinct
all the way out to the phone. The shape, the trap it avoids, and the test that
guards it are in [`src/api/pillars/README.md`](src/api/pillars/README.md).

### Provisioning the service account

The registry's service-account admin surface is `userOnly` — it rejects a
machine principal unconditionally, so a service account can never mint another
and this is an operator step, done once per environment.

`userOnly` means a Cloudflare Access identity specifically: the handler reads
`cf-access-jwt-assertion` and verifies it. A bare `curl` carries no identity
and gets a `401` — mint a token for the app first (`cloudflared access token`)
and send it in that header, against the registry's admin surface reachable
externally through the shell proxy:

```bash
curl -sS -X POST https://pops.local/registry-api/service-accounts -H 'Content-Type: application/json' -H "cf-access-jwt-assertion: $ACCESS_JWT" -d '{"name":"bfm","scopes":["finance.transactions"]}'
```

Two deployment shapes let a bare `curl` through, which is why this can work on
a laptop and then 401 on the real fleet: outside production the registry
resolves a dev user unconditionally, and a production deployment with no
`CLOUDFLARE_ACCESS_TEAM_NAME` set resolves a tunnel user. The order is written
down in exactly one place — `pillars/registry/src/api/middleware/identity.ts`.

The scopes must match `BFM_SERVICE_ACCOUNT_SCOPES` in
`src/api/pillars/service-account.ts`, which is the source of truth for the
grant; a test pins the value.

The `201` carries `plaintextKey` (`pops_sa_<prefix>.<secret>`) **once** and
never again. Write it into the secret file the deployment mounts —
`pops_bfm_api_key`, shape and first-run steps in
[`infra/secrets.example/bfm/`](../../infra/secrets.example/bfm/README.md) — and
point `POPS_INTERNAL_API_KEY_FILE` at it. bfm gets its own account rather than
sharing `pops_api_key` with moltbot and the MCP gateway, so revoking one
consumer does not take the others down and `last_used_at` attributes traffic to
a single process.

Rotate by minting a replacement, swapping the file, restarting, and only then
revoking the old id (`POST /service-accounts/:id/revoke`) — in that order,
since revocation takes effect on the next request.

## Deployment

`Dockerfile` builds a two-stage image scoped to the `@pops/bfm` subgraph —
`@pops/pillar-sdk` and `@pops/types` today. Adding a workspace dependency to
`package.json` without adding it to both COPY phases breaks this image and
nothing else; no local check catches it, only the Docker Build CI job.

The `bfm-api` service in both compose files mounts **`pops-bfm-data`**, not the
shared `sqlite-data` every other pillar API writes to. bfm is greenfield, so it
starts where ADR-039 workstream S11 wants the fleet to end up, and that makes
`bfm-litestream` the one sidecar replicating a database something writes.
`infra/litestream/bfm.yml` targets `/data/sqlite/bfm.db`, which is where
`BFM_SQLITE_PATH` points the container — check the pair together when either
moves, because a stream aimed at a path nothing writes reports success forever.

`depends_on: registry-api` is `service_started`, never `service_healthy`.
Registration is already non-blocking, so gating the container on the registry's
health would turn a slow registry into a fleet cold-start failure and buy
nothing.

The service-account key arrives as a Docker file-based secret at
`/run/secrets/pops_bfm_api_key`, named by `POPS_INTERNAL_API_KEY_FILE` — a
path, never the value, so the credential stays out of the process environment
and out of `docker inspect`. Provisioning:
[`infra/secrets.example/bfm/README.md`](../../infra/secrets.example/bfm/README.md).

Not here: the nginx route and the compiled pillar roster (POPS-1386), and the
Cloudflare hostname with Access bypassed (POPS-1389). The BFM's public entry
point is that hostname rather than the shell's proxy.

## Layout

```
pillars/bfm/
├── package.json                @pops/bfm
├── mise.toml                    per-pillar tasks
├── scripts/generate-openapi.ts  ts-rest contract → openapi/bfm.openapi.json
├── openapi/bfm.openapi.json
├── migrations/                   committed SQL journal, applied by openBfmDb
├── app/                         @pops/app-bfm — the shell's Devices surface
└── src/
    ├── contract/                 the wire contract — the only description of it
    │   ├── rest.ts               health + the operator sub-router
    │   ├── rest-schemas.ts
    │   ├── rest-operator.ts      the three Access-gated routes, and why /operator
    │   ├── rest-operator-schemas.ts
    │   ├── manifest.ts
    │   └── index.ts
    ├── db/                       the device allow-list — see Persistence above
    │   ├── open-bfm-db.ts         pragmas + migrate, per-pillar by convention
    │   ├── schema.ts              table barrel + row/insert types
    │   ├── schema/                one file per table
    │   └── services/              what the API does to those tables
    │       ├── pairing-codes.ts   mint, normalize, redeem-exactly-once
    │       └── devices.ts         list, and the transactional revoke
    └── api/
        ├── server.ts              HTTP entrypoint (port 3014) — wiring only
        ├── boot-env.ts            the env this pillar's own HTTP surface reads
        ├── app.ts                 Express app factory + route wiring
        ├── manifest.ts            the boot-time ManifestPayload
        ├── rate-limit.ts          issuance budget — in memory, single-replica
        ├── auth/                  the /mobile perimeter — has its own README
        ├── middleware/identity.ts the operator principal, and the two legs it drops
        ├── pillars/               calling siblings — has its own README
        ├── shared/errors.ts       HTTP-shaped domain errors
        └── rest/                  ts-rest handler composers
```

`server.ts` holds no decisions — importing it binds a port and installs signal
handlers, so anything in it can only be tested by spawning a child process.
Every boot-time choice therefore lives in `boot-env.ts`, which is unit-tested;
`server.ts` is excluded from coverage on exactly that basis. Adding logic back
to it invalidates the exclusion.

## Commands

```bash
POPS_INTERNAL_API_KEY=dev BFM_ACCESS_TOKEN_SECRET=$(openssl rand -base64 48) pnpm --filter @pops/bfm dev
```

```bash
pnpm --filter @pops/bfm typecheck
```

```bash
pnpm --filter @pops/bfm test
```

```bash
pnpm --filter @pops/bfm build
```

## Environment

| Var                            | Default                    | Notes                                                                       |
| ------------------------------ | -------------------------- | --------------------------------------------------------------------------- |
| `PORT`                         | `3014`                     | HTTP listen port.                                                           |
| `BFM_SELF_BASE_URL`            | `http://localhost:${PORT}` | Advertised to the registry as this pillar's `baseUrl`.                      |
| `BFM_PUBLIC_BASE_URL`          | `BFM_SELF_BASE_URL`        | The origin the **phone** dials. Baked into the pairing QR — see below.      |
| `BFM_SQLITE_PATH`              | `./data/bfm.db`            | Where `bfm.db` lives. Falls back to `dirname(SQLITE_PATH)`.                 |
| `BUILD_VERSION`                | `dev`                      | Verbatim on `/health`; coerced in the manifest — see below.                 |
| `CLOUDFLARE_ACCESS_TEAM_NAME`  | —                          | **Required in production**, or `/operator/*` answers 401 to all.            |
| `CLOUDFLARE_ACCESS_AUD`        | —                          | Access application `aud`. Set it wherever the team hosts more than one.     |
| `POPS_REGISTRY_ENABLED`        | `false`                    | Opt-in self-registration with the `registry` pillar.                        |
| `POPS_REGISTRY_URL`            | `http://registry-api:3001` | Registry base URL — where bfm both registers and discovers.                 |
| `POPS_INTERNAL_API_KEY_FILE`   | —                          | Path to the mounted service-account secret. Preferred over the next row.    |
| `POPS_INTERNAL_API_KEY`        | —                          | The key inline, for local dev. One of these two is **required**.            |
| `POPS_INTERNAL_BASE_URLS`      | —                          | `id:baseUrl[,…]`. Overrides the discovered base URL for those ids only.     |
| `BFM_ACCESS_TOKEN_SECRET_FILE` | —                          | Path to the mounted access-token signing secret. Preferred over the next.   |
| `BFM_ACCESS_TOKEN_SECRET`      | —                          | The signing secret inline, for local dev. One of these two is **required**. |

`BFM_PUBLIC_BASE_URL` and `BFM_SELF_BASE_URL` are the same host only in dev and
must not be conflated in production. The self URL is the in-cluster origin bfm
advertises to the registry — a `pops-backend` hostname no handset can resolve.
The public URL is bfm's own Access-bypassed tunnel hostname, and it is what goes
into the pairing QR, so getting it wrong produces a code that scans cleanly and
then goes nowhere. It defaults to the self URL for the dev case only, where
`http://localhost:3014` is genuinely what a simulator on the same machine should
dial.

`CLOUDFLARE_ACCESS_TEAM_NAME` is not optional in production the way it is for
the registry. There is no tunnel fallback here (see
[The perimeter](#the-perimeter)), so an unset value means `/operator/*` refuses
everyone — including the operator.

**It is not set on the fleet today.** No pillar in this repo has ever set it —
the registry runs without it and leans on exactly the fallback bfm refuses. The
compose service passes all three variables through as `${VAR:-}`, so the
plumbing is in place and the values are an operator step: **POPS-1487**, which
needs the Access application's AUD tag and bfm's bypassed hostname from
POPS-1389. Until that lands, `/operator/*` answers `401` in production and the
Devices page is dark. It fails closed rather than open, which is the right
direction, but it does mean a deployment that forgets it looks like a broken
page rather than an insecure one.

`CLOUDFLARE_ACCESS_AUD` deserves its own line because it is easy to read as
optional hardening and is not. Access mints one JWT per application off the
**same** team signing keys, so with the team name set but no audience, a token
issued for any other protected app on the team verifies here too.

**It is not set on the fleet today.** No pillar in this repo has ever set it —
the registry runs without it and leans on exactly the fallback bfm refuses. The
compose service passes all three variables through as `${VAR:-}`, so the
plumbing is in place and the values are an operator step: **POPS-1487**, which
needs the Access application's AUD tag and bfm's bypassed hostname from
POPS-1389. Until that lands, `/operator/*` answers `401` to everyone in
production and the Devices page is dark.

`CLOUDFLARE_ACCESS_AUD` deserves its own line because it is easy to read as
optional hardening and is not. Access mints one JWT per application off the
**same** team signing keys, so with the team name set but no audience, a token
issued for any other protected app on the team verifies here too.

`POPS_INTERNAL_BASE_URLS` is deliberately not `POPS_PILLARS`, which carries the
same shape and a different meaning: production stopped plumbing it once the
registry became the source of truth (ADR-039 E25), while
`infra/docker-compose.dev.yml` still sets a static six-pillar roster on every
service. Honouring that here would bypass discovery in dev and nowhere else.
bfm ignores it.

Boot crashes rather than starting misconfigured, in four places:

- A malformed `BFM_SELF_BASE_URL` would publish an invalid
  `PillarRegistryEntry.baseUrl`, and a base URL carrying a path silently breaks
  every consumer that appends a route to it.
- A malformed `POPS_REGISTRY_URL` or `POPS_INTERNAL_BASE_URLS` entry would
  surface later as an indistinguishable `unavailable` on every outbound call.
- **No service-account key at all.** bfm exists to fan out to the federation;
  a process that starts without a credential looks healthy right up until the
  first request from a phone.
- **No access-token signing key, or one shorter than 32 characters.** The same
  bargain from the other direction: without it bfm cannot authenticate the
  phone asking. An unreadable `BFM_ACCESS_TOKEN_SECRET_FILE` is fatal too — it
  does **not** fall back to the inline variable, unlike the fleet's other
  secret readers, because a production process quietly signing with a leftover
  dev value produces tokens indistinguishable from forgeries.

Between them, that is why the `dev` invocation under [Commands](#commands)
carries two variables rather than being the bare `pnpm --filter` line every
other pillar's is. Any non-empty `POPS_INTERNAL_API_KEY` and any long-enough
`BFM_ACCESS_TOKEN_SECRET` will do locally; production mounts both as Docker
file-based secrets and points the `_FILE` variables at them (POPS-1385).

`BUILD_VERSION` reaches two places and they do not agree when it is not semver.
`/health` reports it verbatim, because `createBfmApiApp` is handed the raw
string. The registered manifest does not: `bootstrapPillar` coerces a
non-semver version to `0.0.0-sha.<first 7 chars>` and rewrites the contract tag
to match, so a default `dev` build registers as `0.0.0-sha.dev` /
`contract-bfm@v0.0.0-sha.dev` while `/health` still says `dev`. Read the
registry, not `/health`, when correlating a deployed build.

## Architecture

- [ADR-035](../../docs/architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — the pillar kinds, and what registering with `registry` means
- [ADR-036](../../docs/architecture/adr-036-pillar-id-tool-name-conventions.md) — the `bfm` pillar id convention
