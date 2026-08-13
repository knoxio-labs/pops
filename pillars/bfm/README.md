# @pops/bfm

The **bfm** pillar — Backend-for-Mobile. It exists to be the one backend the
native iPhone client dials, fanning out to the rest of the federation on the
client's behalf so the client holds exactly one base URL and one credential.
It listens on port **3014**.

It owns a database — the device allow-list, described under
[Persistence](#persistence) below — which makes it a data pillar by kind
(ADR-035). Its mobile surfaces are the transaction list and detail under
`/mobile/finance/*` and the receipt upload under `/mobile/purchases/*`, behind
the perimeter that guards them — and the whole path a
phone takes to get behind that perimeter is here too: the operator surface that
mints a pairing code, and the exchange that spends it for a device identity.
See
[The perimeter](#the-perimeter). `/health` is a pure liveness shape rather
than a DB round-trip, which is deliberate for a container healthcheck and is
why the database opens **before** `listen`: the probe cannot tell you the
schema migrated, so boot has to. It carries a shell-side operator surface,
under [`app/`](./app/README.md).

It also holds a service-account credential and one way to spend it — see
[Reaching sibling pillars](#reaching-sibling-pillars) and
[`src/api/pillars/README.md`](src/api/pillars/README.md).

| Surface                                | What it does                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /health`                          | Liveness shape. Served from the ts-rest contract, so it cannot drift from the doc.   |
| `GET /openapi`                         | The committed contract projection, served verbatim so peers build a route map.       |
| `POST /devices/pair`                   | Spends a pairing code for a device identity. Unauthenticated by definition.          |
| `POST /devices/challenge`              | Mints a single-use nonce for a refresh. Carries no credential and needs none.        |
| `POST /devices/refresh`                | Rotates a refresh token against a Secure Enclave signature. Detects reuse.           |
| `POST /operator/pairing/codes`         | Mints a single-use pairing code. The plaintext is returned once and never again.     |
| `GET /operator/devices`                | Paired handsets, revoked ones included. Never returns a token or a key.              |
| `DELETE /operator/devices/:id`         | Soft-revokes, and kills the device's refresh-token family in the same transaction.   |
| `GET /mobile/bootstrap`                | What the app should render, and who bfm says it is talking to. See below.            |
| `GET /mobile/finance/transactions`     | One cursor-paginated page of list rows — see [The mobile shape](#the-mobile-shape).  |
| `GET /mobile/finance/transactions/:id` | The fuller record behind one row, for the detail screen.                             |
| `POST /mobile/purchases/receipts`      | Hands a captured receipt to `purchases` — see [The mobile write](#the-mobile-write). |
| `/mobile/*`                            | Everything the phone calls, gated by `requireDevice`.                                |

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
  because the phone has to reach the pairing exchange and refresh without an
  Access session.

One Express app serves both, so it carries two independent gates on two
different axes: one authenticates a **phone**, the other a **human**. A third
surface has neither, on purpose — see [Pairing](#post-devicespair--the-way-in).

### `/mobile/*` — the device gate

Everything under `/mobile` is behind the access-token guard in
[`src/api/auth/`](src/api/auth/README.md), mounted as a path prefix in
`src/api/app.ts` rather than per route — so a mobile route added later cannot
arrive public. A request to an unrouted `/mobile/*` therefore answers `401`,
not `404`.

That directory's README carries the whole of the reasoning: why a rejected
token is a `401` and a revoked device a `403`, why a missing device row is a
`401` rather than either, why reuse detection runs before the signature check,
what is never logged, and why `lastSeenAt` is written here on a coalesced
schedule rather than on every request.

### `POST /devices/pair` — the way in

The one route with no gate at all, and that is the design rather than a hole:
it is how a caller _becomes_ someone, so it cannot require being someone first.
A phone arriving here has no Access session, no device row and no token.
Possession of a live pairing code is the entire credential.

Two things carry the weight the gates carry elsewhere. The code's own entropy —
~59 bits over a five-minute life, see [Persistence](#persistence) — is what
makes guessing pointless. A per-source budget in
`src/api/auth/pairing-rate-limit.ts` is what makes it slow if that argument
ever stops holding.

Two properties are worth knowing before reading the handler, because both look
like details and are neither:

- **Unknown, expired and already-consumed codes produce byte-identical
  responses.** A distinguishable one answers "was that a real code?" once per
  request, which is exactly the question the entropy exists to make
  unanswerable. A test compares the three as raw text, not as parsed bodies.
- **The public key is validated before the code is touched.** The route has two
  failure statuses — `400` for a request that is wrong, `403` for a code that
  did not work — and that split is only safe in this order. Reversed, an
  attacker posts a deliberately malformed key with a guessed code and reads the
  status as the answer.

`src/api/auth/pairing-exchange.ts` states the rest, including why nothing
fallible runs inside the transaction.

### `POST /devices/challenge` + `POST /devices/refresh` — the way back in

An access token lives ten minutes. These two routes are what a handset does at
minute nine, and they are the subtlest thing in this pillar.

A refresh token is a long-lived bearer credential; on its own, a leaked one is
a permanent compromise. Two mechanisms answer that, and both have to hold:

- **Proof of possession.** `challenge` mints a single-use nonce. `refresh`
  takes the token, the nonce, and an ECDSA P-256 signature the handset's Secure
  Enclave key made over both. The key never leaves the phone, so a token stolen
  without the phone verifies against nothing.
- **Rotation with reuse detection.** Every success spends the presented token
  and issues its successor in the same family. A token that comes back already
  spent means two parties hold what should be one credential — a replay or a
  theft, with no third reading — so the family dies and the phone pairs again.
  It is never silently reissued.

Two things to know before reading the handler:

- **The signed message format is described in exactly one place**, the header of
  `src/api/auth/refresh-exchange.ts`. `clients/ios` reproduces it byte for byte,
  and no compiler checks the two against each other; getting it wrong fails as a
  `401` indistinguishable from an expired token, which is why it is stated there
  and nowhere else — and why the bytes themselves are pinned by a committed
  vector both languages assert against, `contracts/refresh-message-v1.json`.
- **Reuse detection runs before the signature is verified.** That looks
  backwards and is not: reaching it needs a token this server issued, so
  possession is the evidence, and checking the signature first would let a
  thief who stole the token but not the phone avoid tripping it entirely.
  [`src/api/auth/README.md`](src/api/auth/README.md) argues it in full,
  including what it costs an honest client that submits the same refresh twice.

The nonce lives in memory rather than in `bfm.db` — worthless once spent,
worthless a minute after issue, and a table would hand an unauthenticated
internet-facing route a write primitive. That makes it process-local
(POPS-1537).

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

Three budgets, on three different keys, because they answer three different
questions. All three count with `src/api/rate-limit.ts`.

| Surface              | Key                            | Bounds                                          |
| -------------------- | ------------------------------ | ----------------------------------------------- |
| Code issuance        | the operator's email           | how many codes one human can mint               |
| `POST /devices/pair` | client address, plus a ceiling | how many **guesses** the code space takes       |
| `/mobile/*`          | client address, plus a ceiling | how much **work** an unauthenticated flood buys |

The latter two share `src/api/tiered-rate-limit.ts` — the same two-tier shape,
a coarse unkeyed ceiling charged before a fine per-address one, because
`CF-Connecting-IP` is both the only usable client identity on a bypassed
hostname and forgeable by anything on the LAN. They keep separate counters on
purpose: one shared counter would let ordinary phone traffic lock a handset out
of pairing, and a pairing flood degrade every device already paired.

Every counter is **in memory**, which is correct for a single-container pillar
and wrong the moment there are two: each limit would become per-replica and the
effective budget would multiply. POPS-1474 holds that, and names whichever
change adds a second replica as the trigger.

On the issuance route the gate runs _before_ the limiter, deliberately.
Limiting first would let an anonymous flood exhaust the real operator's budget
and lock them out of pairing — a denial of service handed to an unauthenticated
caller. A test pins the ordering. The device-facing budgets have no gate to run
after, which is why they are mounted as middleware on the path instead: a
refused caller never reaches the body parser.

## What the phone is told first

`GET /mobile/bootstrap` is the app's first authenticated call and the proof
that bfm can see the whole federation: it lists the pillars the registry
reports, each with a reachability bfm observed itself, and turns that into the
feature list the app renders. The phone therefore holds no roster of its own —
it asks.

`unavailable` and `contract-mismatch` stay separate the whole way out, the same
four values the cross-pillar gateway speaks. The probe's two-source design, why
it reads `/openapi` rather than `/health`, and why a registry outage still
answers `200` are in [`src/api/mobile/README.md`](src/api/mobile/README.md).

It also writes: bootstrap's own uncoalesced write to `devices.lastSeenAt`
happens before the registry is even read, because a check-in is true
regardless of how the rest of the call goes. Every other `/mobile/*` route
moves the same column through the guard instead, coalesced — see
[`src/api/auth/README.md`](src/api/auth/README.md).

## The mobile shape

`/mobile/finance/*` is a **mobile-shaped contract, not a proxy**. Three
properties follow, and each is asserted in
`src/api/__tests__/mobile-transactions.test.ts`:

- **A list row carries what a list row draws, and nothing else.** Finance's
  `account`, `notes`, `location` and the rest reach the phone only from the
  detail route. The path segment says `finance` because that is what the data
  is about, not where the phone should look — the app holds no notion that
  finance is a separate service.
- **The money is finance's, mirrored.** `amount` is signed decimal dollars
  (expenses negative), exactly as finance publishes it; finance persists
  integer cents and divides once at its own REST edge. bfm does no arithmetic
  on it at all, because a second conversion is a second rounding rule and that
  is how two services come to disagree about what somebody spent. `type` is a
  semantic label and never the direction. `currency` is a literal `AUD`: the
  fleet has always been single-currency and finance carries no such field, so
  stating the assumption on the wire beats leaving the phone to guess it.
- **A degraded federation is a typed answer, never an empty page.** A list that
  answered `[]` while finance was down would be telling the user they have no
  transactions, which they cannot tell from the truth. `unavailable`,
  `degraded` and `contract-mismatch` stay distinct all the way out —
  `src/api/rest/upstream-error.ts` is the whole mapping and is total over the
  gateway's failure kinds, so a new kind fails the build rather than falling
  through to something plausible.

### Paging

The list is **cursor**-paginated. `nextCursor` is opaque, `null` on the last
page, and the app echoes it back unmodified — it must never construct one.

Underneath, that cursor is finance's `(date, id)` keyset anchor. Offsets were
not an option: the underlying list mutates, and an import landing at the head
mid-scroll shifts every offset by one, so the walk re-serves a row it already
showed and skips one it never did. finance's `transactions.list` grew the
anchor and a total `date DESC, id DESC` order for this (POPS-1379); the two
halves have to be read together, and
`pillars/finance/src/db/services/transactions-list.ts` says so on the finance
side.

bfm asks finance for one row more than the page. That extra row's existence is
what proves another page exists — asking for a total instead would be a second
count query per scroll tick, and a total that is stale the moment it is read.

## The mobile write

`POST /mobile/purchases/receipts` is the only verb on this pillar that is not a
read on the phone's behalf, and what it may be is fixed by
[ADR-046](../../docs/architecture/adr-046-mobile-write-surface-is-ingestion-only.md):
the mobile surface accepts **ingestion** — content the handset captured — and
never a mutation of a record a pillar already holds. Four properties follow,
and each is asserted in `src/api/__tests__/mobile-receipts.test.ts` or
`src/contract/__tests__/mobile-verbs.test.ts`:

- **The bytes travel unchanged.** `purchases` content-addresses them, which is
  what makes a retry idempotent, so bfm mints no idempotency key and re-encodes
  nothing. A second dedup rule here would be two purchases for one receipt the
  first time the two disagreed.
- **All three producer outcomes are a `200`.** `created`, `needs-review` and
  `unreadable` are told apart by the body's `kind`, because all three are
  purchases having read the upload and answered. Only a failure to get an
  answer at all is a non-200, through the same upstream mapping the read routes
  use. The mobile `needs-review` deliberately carries the problems and not the
  full extracted reading: reviewing one is a side-by-side against the
  photograph, which is the operator surface's job.
- **The size ceiling is bfm's own.** `MOBILE_UPLOAD_MAX_BYTES` (12mb) is
  mounted on that one path — every other route keeps Express's 100kb default —
  and an oversized body is refused here, in the shape the contract declares,
  rather than buffered across the internal network for `purchases` to refuse at
  20mb.
- **The grant is a write grant.** `purchases.receipt` was added to
  `BFM_SERVICE_ACCOUNT_SCOPES` for this and authorises nothing else in that
  pillar. See [Provisioning the service account](#provisioning-the-service-account).

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

### Credential retention

`pairing_codes` and `refresh_tokens` both accumulate rows nothing else
deletes — a consumed or expired pairing code, a refresh token spent by
rotation or killed by revocation. `startPruneCredentialsWorker`
(`src/api/cron/prune-credentials.ts`) is a background sweep, started
unconditionally from `server.ts` on boot and stopped on shutdown, that walks
both tables once a day and removes what has aged out of its retention window.
The retention decision and the delete itself live in
`src/db/services/prune-credentials.ts`.

The two tables do not share one window. `pairing_codes` has no equivalent of
reuse detection — a dead row carries no security function once it can no
longer be redeemed — so it is pruned a week after it dies. `refresh_tokens`
is pruned on a window equal to the token's own TTL (thirty days), because a
**consumed** row is what `screenPresentedGrant` in
`src/api/auth/refresh-exchange.ts` checks to catch a stolen token being replayed:
deleting it early would let that exact replay go undetected against a family
that might still be live. Pinning the window to the TTL rather than to an
independent number is what keeps that safe — see the header of
`src/db/services/prune-credentials.ts` for the full argument, and
`assertRefreshTokenRetentionCoversTtl` in that same file, which `server.ts`
calls at boot against whatever TTL it is about to mint with, so a deploy that
ever breaks the pinning crashes at startup instead of quietly turning reuse
detection off. Deletion walks
the table oldest-`createdAt`-first, because the self-referential `replacedBy`
column is `ON DELETE NO ACTION` and refuses to let a successor be removed
while its predecessor still names it.

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

- **Mutations of anything a pillar already holds.** The mobile surface accepts
  writes, and only ingestion: content the handset captured, handed to the
  pillar that owns it. `PUT`, `PATCH` and `DELETE` are forbidden under
  `/mobile` permanently, which is
  [ADR-046](../../docs/architecture/adr-046-mobile-write-surface-is-ingestion-only.md)
  and is enforced on the contract by
  `src/contract/__tests__/mobile-verbs.test.ts` rather than by this sentence. A
  phone that needs to edit a record is asking for the operator surface, which
  is behind Cloudflare Access for a reason.
- **The bootstrap route and the nginx route.** `GET /mobile/bootstrap`
  (POPS-1378) and the nginx route plus the compiled pillar roster (POPS-1386)
  are each their own ticket. Revocation here sets `devices.revokedAt`, which is
  the column `requireDevice` already reads — so "a revoked phone fails its very
  next request" is live for every route under `/mobile/*`, including the two
  that exist.
- **Enforcement of the grant anywhere except `registry`, `finance` and
  `purchases`.** Those three check the presented `X-API-Key` against the
  account behind it and refuse an operation the grant does not cover.
  `inventory`, `media`, `lists`, `cerebrum`, `ai`, `food`, `orchestrator`,
  `documents` and the Rust `contacts` pillar still serve any in-network caller,
  credential or not — each has its own adoption ticket. bfm calls only
  `finance` and `purchases`, so both legs of its own grant are enforced. The
  `purchases` leg carries one caveat: that pillar's `requireCredential` is
  `false`, so an upload would be admitted even if the grant were missing. The
  scope is listed as if it were already on, because it will be.

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
├── scripts/generate-refresh-message-fixture.ts  the signed-message vector — see below
├── openapi/bfm.openapi.json
├── contracts/                    two vectors shared with clients/ios — see below
├── migrations/                   committed SQL journal, applied by openBfmDb
├── app/                         @pops/app-bfm — the shell's Devices surface
└── src/
    ├── contract/                 the wire contract — the only description of it
    │   ├── rest.ts               health + the device, operator and mobile sub-routers
    │   ├── rest-schemas.ts        the mobile shapes + the error envelopes
    │   ├── rest-device.ts        pair, challenge, refresh — and what guards each
    │   ├── rest-device-schemas.ts
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
    │       ├── refresh-tokens.ts  draw, digest, rotate, and burn a family
    │       ├── prune-credentials.ts the retention windows + the oldest-first delete
    │       └── devices.ts         insert, list, and the transactional revoke
    └── api/
        ├── server.ts              HTTP entrypoint (port 3014) — wiring only
        ├── boot-env.ts            the env this pillar's own HTTP surface reads
        ├── app.ts                 Express app factory + route wiring
        ├── manifest.ts            the boot-time ManifestPayload
        ├── rate-limit.ts          the fixed-window counter every budget uses
        ├── tiered-rate-limit.ts   the shape the device-facing budgets use it in
        ├── paths.ts               the paths middleware mounts on, off the contract
        ├── cron/prune-credentials.ts the daily sweep scheduling — see Persistence above
        ├── auth/                  the perimeter and the exchange — has its own README
        ├── mobile/                what the phone is told — has its own README
        ├── middleware/identity.ts the operator principal, and the two legs it drops
        ├── pillars/               calling siblings — has its own README
        ├── finance/               the finance leg: paging, wire validation, cursor
        ├── purchases/             the purchases leg: the receipt upload and its wire
        ├── shared/errors.ts       HTTP-shaped domain errors
        └── rest/                  ts-rest handler composers
            ├── payload-too-large.ts the body cap's refusal, in the declared shape
            └── upstream-error.ts  gateway failure → the status the phone sees
```

`server.ts` holds no decisions — importing it binds a port and installs signal
handlers, so anything in it can only be tested by spawning a child process.
Every boot-time choice therefore lives in `boot-env.ts`, which is unit-tested;
`server.ts` is excluded from coverage on exactly that basis. Adding logic back
to it invalidates the exclusion.

### `contracts/` — two vectors this pillar shares with the phone, pointing opposite ways

Both files pin something the iOS app and this pillar must agree on byte for
byte, both exist twice, and both are guarded against drift. What differs is who
authors them, because that follows who can say what the right answer is.

| File                       | Pins                                            | Canonical copy                                                          | This copy |
| -------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| `device-signature-v1.json` | the ECDSA P-256 encodings the phone signs under | `clients/ios/Contracts/` — only CryptoKit can make a real signature     | vendored  |
| `refresh-message-v1.json`  | the exact bytes a refresh is signed over        | here — the format is this pillar's, and this pillar rejects a wrong one | canonical |

The vendoring in each direction is the shape ADR-033 established for a contract
crossing a unit boundary, applied because ADR-043 forbids a unit depending on a
client. Nothing in this pillar reads a path under `clients/`, and nothing in
`clients/ios` reads a path under `pillars/`.

Each pair must stay byte-identical, and its guard fails the build if it does not
— in either direction, and whether the difference is a value or only whitespace.
`scripts/ci/check-device-signature-fixture.mjs` owns the first,
`scripts/ci/check-refresh-message-fixture.mjs` the second, and both share the
copy-set machinery in `scripts/ci/fixture-copies.mjs`.

Re-vendor or regenerate from the repo root, never from inside either unit —
that is where the copy step lives, because neither unit may reach into the
other's directory:

```bash
mise run fixture:device-signature:vendor   # after the canonical copy changes
mise run fixture:refresh-message           # regenerate + re-vendor; safe to re-run
```

`openapi/` is a third artefact with the same shape: this pillar authors it, and
`clients/ios` vendors it (POPS-1380).

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

**Provisioned on the fleet since POPS-1487 (2026-08-11).** The `knoxio/homelab-infra`
repo's Ansible host vars for capivara set `cloudflare_access_team_name` and
`cloudflare_access_aud`, sourced from the existing `pops_public` Access
application (that repo's `terraform/cloudflare/`) — the app that already
fronted the whole `pops.jmiranda.dev` domain, including the shell's
`/bfm-api/` proxy path, so no new Cloudflare resource was needed.
`cac-bootstrap` renders those two host vars into this container's
`CLOUDFLARE_ACCESS_TEAM_NAME` and `CLOUDFLARE_ACCESS_AUD` env vars, asserting
the pair is set together or not at all before writing `.env`; bfm itself was
deployed to capivara in POPS-1393.

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
