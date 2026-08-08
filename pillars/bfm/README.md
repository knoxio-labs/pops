# @pops/bfm

The **bfm** pillar — Backend-for-Mobile. It exists to be the one backend the
native iPhone client dials, fanning out to the rest of the federation on the
client's behalf so the client holds exactly one base URL and one credential.
It listens on port **3014**.

Today it is a scaffold and serves `/health` alone. It owns no database, calls
no sibling pillar (POPS-1367), and has no mobile surface (POPS-1378,
POPS-1379) — so `/health` is a pure liveness shape rather than a DB round-trip,
and there is no `src/db/` or `migrations/`. Device and token rows arrive with
POPS-1366, which is what makes it a data pillar by kind (ADR-035).

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

## What deliberately does not live here

- **A `ModuleManifest`.** `src/contract/manifest.ts` exports a type only. The
  runtime `ModuleManifest` that other pillars export is what
  `libs/module-registry` discovers through the `./manifest` export and turns
  into an installed module in the shell's static registry — its `surfaces`
  field must name at least one shell surface. bfm mounts none today, so one
  here would install a phantom app; it arrives with the frontend app
  (POPS-1384). Registry registration is unaffected — that goes through the
  separate `ManifestPayload` in `src/api/manifest.ts`.
- **Auth, the mobile contract, and the container.** Device pairing and token
  issuance (POPS-1369, POPS-1370, POPS-1374, POPS-1375), the mobile-facing
  routes (POPS-1378, POPS-1379), the Dockerfile and compose service
  (POPS-1385) and the nginx route (POPS-1386) are each their own ticket. This
  pillar currently runs from `pnpm dev` only.
- **A shared bare-origin parser.** `src/api/self-base-url.ts` re-implements the
  rule every pillar's `src/api/pillars/env.ts` carries rather than importing
  it; lifting it into `@pops/pillar-sdk` across the fleet is POPS-1406.

## Layout

```
pillars/bfm/
├── package.json                @pops/bfm
├── mise.toml                    per-pillar tasks
├── scripts/generate-openapi.ts  ts-rest contract → openapi/bfm.openapi.json
├── openapi/bfm.openapi.json
└── src/
    ├── contract/                 the wire contract — the only description of it
    │   ├── rest.ts
    │   ├── rest-schemas.ts
    │   ├── manifest.ts
    │   └── index.ts
    └── api/
        ├── server.ts              HTTP entrypoint (port 3014)
        ├── app.ts                 Express app factory + route wiring
        ├── manifest.ts            the boot-time ManifestPayload
        ├── self-base-url.ts       BFM_SELF_BASE_URL validation
        └── rest/handlers.ts       ts-rest handler composer
```

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

| Var                     | Default                    | Notes                                                       |
| ----------------------- | -------------------------- | ----------------------------------------------------------- |
| `PORT`                  | `3014`                     | HTTP listen port.                                           |
| `BFM_SELF_BASE_URL`     | `http://localhost:${PORT}` | Advertised to the registry as this pillar's `baseUrl`.      |
| `BUILD_VERSION`         | `dev`                      | Verbatim on `/health`; coerced in the manifest — see below. |
| `POPS_REGISTRY_ENABLED` | `false`                    | Opt-in self-registration with the `registry` pillar.        |
| `POPS_REGISTRY_URL`     | `http://registry-api:3001` | Registry base URL.                                          |

A malformed `BFM_SELF_BASE_URL` crashes boot rather than publishing an invalid
`PillarRegistryEntry.baseUrl` — a base URL carrying a path silently breaks
every consumer that appends a route to it.

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
