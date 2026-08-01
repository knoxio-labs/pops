# @pops/orchestrator

The **orchestrator** pillar — a stateless, cross-pillar aggregator. It owns
**no database**; its cross-pillar surfaces read the live registry snapshot and
fan out to other pillars over `@pops/pillar-sdk` (REST transport). It listens on
port **3009**.

| Surface         | What it does                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /search`  | Federated search: fans one query out to every registered, healthy, search-capable pillar's `/search` in parallel, then merges + ranks the results. A down pillar is dropped, never failing the whole search. |
| `GET /ai/tools` | AI-tool registry: projects each registered, healthy pillar's `ai.tools` manifest slot into a single flat tool list.                                                                                          |
| `GET /pillars`  | Registry-first view of the fleet (live snapshot leads, `POPS_PILLARS` seed backfills), prepended with the synthetic `orchestrator` self-entry.                                                               |
| `GET /health`   | Liveness shape (`{ ok, status, service, version, ts }`). No DB round-trip — there is no DB.                                                                                                                  |

Membership is resolved **per request** from the `registry` pillar via the SDK
discovery client (TTL-cached) — there is no static, compiled pillar list. The
search fan-out, ranking and partial-failure handling are implemented here, in
`src/search/`.

Like every pillar, it self-registers with the `registry` pillar on boot (opt-in
via `POPS_REGISTRY_ENABLED`, using `bootstrapPillar` from `@pops/pillar-sdk`).
Its own manifest declares **empty** `routes`, `search`, `ai`, and `uri`
dimensions — it is an aggregator, not a domain owner.

## Search request and response

`POST /search` takes the same `{ query: { text, filters? }, context? }` envelope
each pillar's own `/search` accepts, so the frontend repoints the URL without
reshaping the request. Two things about that envelope are not visible from the
schema:

- **Only `text` reaches the pillars.** The request's `query.filters` array is
  accepted by the Zod schema and then dropped, and the structured tokens the
  parser extracts from the text (`type:`, `domain:`, `year:>N`, `value:<N`,
  `warranty:expiring`) are used only to decide that the query is non-blank.
  Neither is forwarded on the fan-out.
- **A blank query never touches a pillar.** No text and no recognised filter
  token short-circuits to `{ sections: [] }`.

The response is one section per contributing pillar — not per adapter, because
a pillar returns a single flat hit list. Sections carry the pillar's chrome and
are capped at 5 hits each, with `totalCount` holding the pre-cap count. Ordering
is context sections first (the section whose domain maps to `context.app`), then
by top hit score.

`400 invalid_request` means the body was malformed and nothing was fanned out.
`500 search_failed` is reserved for an unexpected throw in the pipeline — a
pillar being down is never a 500.

## Runtime configuration

| Env                          | Default                                  | Notes                                                             |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `PORT`                       | `3009`                                   | Integer 1–65535.                                                  |
| `BUILD_VERSION`              | `dev`                                    | Surfaced on `/health` and in the registered manifest.             |
| `ORCHESTRATOR_SELF_BASE_URL` | `http://localhost:${PORT}`               | Published as the synthetic `orchestrator` entry's `baseUrl`.      |
| `POPS_REGISTRY_URL`          | SDK default (`http://registry-api:3001`) | Points the discovery client at the registry pillar.               |
| `POPS_REGISTRY_ENABLED`      | unset                                    | `true` self-registers on boot and deregisters on SIGTERM/SIGINT.  |
| `POPS_PILLARS`               | empty                                    | `id:baseUrl[,…]` seed; backfills `/pillars` only for unknown ids. |

An out-of-range `PORT` or a non-bare origin in either URL (a path, query or
fragment) throws at boot — a bad published `baseUrl` is much harder to diagnose
later. `POPS_PILLARS` is not validated at boot: the seed is parsed lazily on the
first `GET /pillars`, so a malformed entry fails that request instead.

## Layout

```
pillars/orchestrator/
├── package.json            @pops/orchestrator
├── Dockerfile
├── mise.toml               per-pillar tasks
└── src/
    ├── server.ts           HTTP entrypoint (port 3009)
    ├── app.ts              Express app factory + route wiring
    ├── handlers.ts         /health + /pillars handlers
    ├── manifest.ts         the orchestrator's own (empty-dimension) manifest
    ├── search/             POST /search — federated fan-out, merge, rank
    ├── ai-tools/           GET /ai/tools — manifest tool-list projection
    └── pillars/            GET /pillars — registry-first fleet view
```

## Commands

```bash
pnpm --filter @pops/orchestrator dev          # tsx watch on src/server.ts
pnpm --filter @pops/orchestrator typecheck     # tsc --noEmit
pnpm --filter @pops/orchestrator test          # vitest run
pnpm --filter @pops/orchestrator build         # tsc → dist/
pnpm --filter @pops/orchestrator start         # node dist/server.js
```
