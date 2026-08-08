# @pops/bfm

The **bfm** pillar — Backend-for-Mobile. It exists to be the one backend the
native iPhone client dials, fanning out to the rest of the federation on the
client's behalf so the client holds exactly one base URL and one credential.
It listens on port **3014**.

It owns a database — the device allow-list, described under
[Persistence](#persistence) below — which makes it a data pillar by kind
(ADR-035). It serves `/health` alone: it has no mobile surface yet (POPS-1378,
POPS-1379), so `/health` is a pure liveness shape rather than a DB round-trip.
That is deliberate for a container healthcheck, and it is why the database
opens **before** `listen`: the probe cannot tell you the schema migrated, so
boot has to. It does carry a shell-side operator surface, under
[`app/`](./app/README.md).

It also holds a service-account credential and one way to spend it — see
[Reaching sibling pillars](#reaching-sibling-pillars) and
[`src/api/pillars/README.md`](src/api/pillars/README.md).

| Surface        | What it does                                                                       |
| -------------- | ---------------------------------------------------------------------------------- |
| `GET /health`  | Liveness shape. Served from the ts-rest contract, so it cannot drift from the doc. |
| `GET /openapi` | The committed contract projection, served verbatim so peers build a route map.     |

When `POPS_REGISTRY_ENABLED=true` it self-registers with the `registry` pillar
on boot via `bootstrapPillar` from `@pops/pillar-sdk/bootstrap`. Registration
runs **after** `app.listen` and never gates boot: an unavailable registry
delays bfm joining the fleet, it does not delay bfm serving traffic.
`src/api/__tests__/registration.test.ts` is the proof — it boots against a
registry that refuses every call and asserts `/health` still answers.

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
  at full width. It does **not** yet make it inert for pairing codes: a code
  short enough to read off a screen and type is short enough to enumerate
  offline against `pairing_codes.codeHash`, bounded only by the minutes until
  it expires. Closing that means either a code with enough entropy to make
  enumeration infeasible, or keying the digest under a pepper mounted outside
  the database — a decision that belongs with the issuance path (POPS-1369),
  not with the column.

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

- **A route that reads a row.** `server.ts` opens `bfm.db` and migrates it, but
  no handler queries it yet — the tables are populated first by the issuance
  path (POPS-1369). The open happens anyway because the container needs it to:
  a volume and a Litestream stream that point at a file no process creates are
  a backup of nothing, and nothing reports that.
- **Auth, the mobile contract, and the nginx route.** Device pairing and token
  issuance (POPS-1369, POPS-1370, POPS-1374, POPS-1375), the mobile-facing
  routes (POPS-1378, POPS-1379) and the nginx route plus the compiled pillar
  roster (POPS-1386) are each their own ticket.
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
    │   ├── rest.ts
    │   ├── rest-schemas.ts
    │   ├── manifest.ts
    │   └── index.ts
    ├── db/                       the device allow-list — see Persistence above
    │   ├── open-bfm-db.ts         pragmas + migrate, per-pillar by convention
    │   ├── schema.ts              table barrel + row/insert types
    │   └── schema/                one file per table
    └── api/
        ├── server.ts              HTTP entrypoint (port 3014) — wiring only
        ├── boot-env.ts            the env this pillar's own HTTP surface reads
        ├── app.ts                 Express app factory + route wiring
        ├── manifest.ts            the boot-time ManifestPayload
        ├── pillars/               calling siblings — has its own README
        └── rest/handlers.ts       ts-rest handler composer
```

`server.ts` holds no decisions — importing it binds a port and installs signal
handlers, so anything in it can only be tested by spawning a child process.
Every boot-time choice therefore lives in `boot-env.ts`, which is unit-tested;
`server.ts` is excluded from coverage on exactly that basis. Adding logic back
to it invalidates the exclusion.

## Commands

```bash
pnpm --filter @pops/bfm dev
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

| Var                          | Default                    | Notes                                                                    |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `PORT`                       | `3014`                     | HTTP listen port.                                                        |
| `BFM_SELF_BASE_URL`          | `http://localhost:${PORT}` | Advertised to the registry as this pillar's `baseUrl`.                   |
| `BFM_SQLITE_PATH`            | `./data/bfm.db`            | Where `bfm.db` lives. Falls back to `dirname(SQLITE_PATH)`.              |
| `BUILD_VERSION`              | `dev`                      | Verbatim on `/health`; coerced in the manifest — see below.              |
| `POPS_REGISTRY_ENABLED`      | `false`                    | Opt-in self-registration with the `registry` pillar.                     |
| `POPS_REGISTRY_URL`          | `http://registry-api:3001` | Registry base URL — where bfm both registers and discovers.              |
| `POPS_INTERNAL_API_KEY_FILE` | —                          | Path to the mounted service-account secret. Preferred over the next row. |
| `POPS_INTERNAL_API_KEY`      | —                          | The key inline, for local dev. One of these two is **required**.         |
| `POPS_INTERNAL_BASE_URLS`    | —                          | `id:baseUrl[,…]`. Overrides the discovered base URL for those ids only.  |

`POPS_INTERNAL_BASE_URLS` is deliberately not `POPS_PILLARS`, which carries the
same shape and a different meaning: production stopped plumbing it once the
registry became the source of truth (ADR-039 E25), while
`infra/docker-compose.dev.yml` still sets a static six-pillar roster on every
service. Honouring that here would bypass discovery in dev and nowhere else.
bfm ignores it.

Boot crashes rather than starting misconfigured, in three places:

- A malformed `BFM_SELF_BASE_URL` would publish an invalid
  `PillarRegistryEntry.baseUrl`, and a base URL carrying a path silently breaks
  every consumer that appends a route to it.
- A malformed `POPS_REGISTRY_URL` or `POPS_INTERNAL_BASE_URLS` entry would
  surface later as an indistinguishable `unavailable` on every outbound call.
- **No service-account key at all.** bfm exists to fan out to the federation;
  a process that starts without a credential looks healthy right up until the
  first request from a phone. This is why bare `pnpm dev` now needs
  `POPS_INTERNAL_API_KEY` set — any non-empty string will do until the call
  actually has to authenticate.

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
