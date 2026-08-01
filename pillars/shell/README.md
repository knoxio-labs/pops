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

## Overlay mount contract

The props an overlay receives are `OverlayComponentProps` in
`src/app/overlays/OverlayHost.tsx`.

The named chrome slots are **`assistant`, `notification`, `command`** — and
that list is declared **twice**, as two independent literals in two packages:

| Declaration site                                                      | Effect                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/overlays/OverlayHost.tsx` — `KNOWN_CHROME_SLOTS`             | Runtime. An overlay declaring anything else is dropped at module load with a `console.warn`; the shell still boots.                   |
| `libs/module-registry/scripts/chrome-slots.ts` — `KNOWN_CHROME_SLOTS` | Registry codegen. `warnUnknownChromeSlots`, called from `validateManifests`, writes to stderr. Deliberately a warning, never a throw. |

Nothing cross-checks the two lists, and a new slot needs a third file besides:
`RootLayout` renders one `<OverlayHost slot="…" />` per slot, each inside a
`data-overlay-slot` wrapper div. The `slot` prop is typed
`KnownChromeSlot`, which does **not** force a host to exist — add a slot to
the tuple and forget the host, and overlays declaring it compile and silently
never mount. (The bucket record in `buildSlotMounts` is type-checked against
the tuple, so that half is caught.)

One host per slot, any number of overlays per host: `OverlayHost` mounts every
installed overlay whose `chromeSlot` equals its `slot` prop. Two overlays
declaring the same slot both mount — there is no collision rejection at
codegen, boot, or mount, and no z-index arbitration in the shell (overlays own
their own positioning; the wrapper divs are bare anchors).

Getting mounted at all needs both halves of `src/app/overlays/registry.ts`:
the manifest must be in the shell-local `SHELL_OVERLAY_MANIFESTS` array — a
static import, so adding an overlay edits shell source — **and** its id must
be in `INSTALLED_MODULES`. A manifest with no `frontend.overlay.component`
loader is projected away and never mounts. `assistant` is the only occupied
slot today, held by `@pops/overlay-ego`.

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
