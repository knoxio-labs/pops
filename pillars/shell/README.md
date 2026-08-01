# @pops/shell

The **shell** pillar — the single Vite/React SPA host for POPS. It lazy-loads
each domain's feature app and renders the federated navigation assembled from
the live registry. It is a **UI pillar**: it owns no SQLite DB and serves no
data procedures. Its manifest carries a sentinel contract block plus empty
capability arrays — the registry's manifest schema requires those fields, so a
UI pillar fills them with empties rather than dropping them.

The frontend source lives in `pillars/shell/src` — `main.tsx` plus `app/` (the
boot install-set resolver, router, chrome, pages, overlays), `components/`,
`store/`, `i18n/` and the generated `registry-api/` client. The production image
is `nginx:alpine` with a Node binary added (`apk add nodejs`): nginx serves the
built bundle, Node runs the boot-time conf render and the long-lived registry
watcher. That pipeline is documented in [`scripts/README.md`](scripts/README.md)
and in each script's own header.

## UI-pillar registration

The `ManifestPayloadSchema` (in `@pops/pillar-sdk`) is `.strict()` and requires
`contract`, `routes`, `search`, `ai`, `uri`, `consumedSettings`, and
`healthcheck`, so `buildShellManifest()` emits all of them — empties plus a
sentinel contract triplet — rather than omitting them:

```jsonc
{
  "pillarId": "shell",
  "baseUrl": "https://pops.local",
  "manifest": {
    "pillar": "shell",
    "version": "0.1.0",
    "contract": {
      "package": "@pops/shell-contract",
      "version": "0.1.0",
      "tag": "contract-shell@v0.1.0",
    },
    "routes": { "queries": [], "mutations": [], "subscriptions": [] },
    "search": { "adapters": [] },
    "ai": { "tools": [] },
    "uri": { "types": [] },
    "consumedSettings": { "keys": [] },
    "healthcheck": { "path": "/health" },
  },
  "apiKey": "<POPS_INTERNAL_API_KEY>",
}
```

`manifest.pillar` MUST equal `pillarId` — the registry rejects a mismatch. The
shell ships the `-contract` form.

### Registration runs at deploy time, not in the browser

The CLI entrypoint `scripts/register-with-registry.ts` delegates to
`registerShellWithRegistry` in `src/lib/register-with-registry.ts`. Run it with
the same secrets every other pillar uses:

```bash
POPS_REGISTRY_URL=http://registry-api:3001 \
SHELL_BASE_URL=https://pops.local \
POPS_INTERNAL_API_KEY=… \
  pnpm --filter @pops/shell registry:register
```

> Endpoint note: `src/lib/register-with-registry.ts` POSTs to
> `/core.registry.register`. The `registry` pillar mounts every registry
> operation on both that path and the canonical `/registry/register` (see the
> pillar SDK's `REGISTRY_PATHS` / `LEGACY_REGISTRY_PATHS`), so either resolves.

The trust model and the best-effort failure policy are in those two files'
headers; the outcome shapes are the `RegisterShellOutcome` union in the lib.
Every outcome exits `0` so a partially-configured deploy still boots — only an
unexpected throw sets a non-zero exit code.

## Commands

```bash
pnpm --filter @pops/shell dev          # Vite dev server
pnpm --filter @pops/shell build        # tsc + vite build
pnpm --filter @pops/shell test         # vitest run
pnpm --filter @pops/shell test:e2e     # playwright test
pnpm --filter @pops/shell typecheck    # tsc --noEmit
```

`mise tasks` (from `pillars/shell/mise.toml`) wraps the same set plus `lint`
(`oxlint src && oxfmt --check .`, which has no `package.json` equivalent):
`mise run build | dev | typecheck | test | test:e2e | lint`.
