# @pops/module-registry

The build-time half of "which modules exist". It walks the tree for packages exporting a `./manifest`, validates each one against `@pops/types`' `assertModuleManifest` plus cross-manifest invariants, and emits `src/generated.ts` — a committed `as const` literal that CI regenerates and diffs. On top of that sits a small runtime shim that re-reads `POPS_APPS` / `POPS_OVERLAYS` so consumers get the per-deploy install set without parsing env themselves.

## Who depends on it

Two packages, both frontend: `pillars/shell` and `libs/navigation`.

| Import site                                            | Uses                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `pillars/shell/src/app/router.tsx`                     | `KNOWN_MODULES` — the route superset                           |
| `pillars/shell/src/app/overlays/registry.ts`           | `INSTALLED_MODULES` — overlay mount gating                     |
| `pillars/shell/src/app/installed-modules.ts`           | `isInstalledModule` — the never-brick offline floor            |
| `libs/navigation/src/search-input/installed-module.ts` | `isInstalledModule` — drops search sections for absent modules |

`MODULES`, `findModule`, `isModuleId`, `RegisteredModule` and `InstalledModule` are exported but unused. The only thing reproducing their surface is `pillars/shell/scripts/build-registry-snapshot.ts`, and it does so for the E2E shim, not as a caller.

## Constraints

- **A lib may never import a pillar** (`scripts/ci/check-lib-no-pillar-import.mjs`). `scripts/known-modules.ts` therefore discovers pillars by walking `pillars/` on disk and `import()`ing each one's built manifest **by file URL** — there is no workspace dependency edge and no pillar id in a specifier. Adding a pillar requires no edit here.
- **The manifests must be built first.** Discovery imports `pillars/<id>/dist/contract/manifest.js`, so `mise run build` has to precede `mise run registry` or the walk silently finds nothing.
- **`generated.ts` is committed output.** Regenerate with `mise run registry` and commit the result; the build runs `oxfmt --write` last so the file lands in the format `pnpm format:check` expects.

## What first-time consumers get wrong

- **`KNOWN_MODULES` is not the fleet.** It holds only packages that export a `./manifest`, so `contacts` (Rust), `documents`, `shell`, `mcp`, `orchestrator`, `docs` and `moltbot` are all absent — while `ego`, a Cerebrum sub-module with no directory of its own, is present. Reaching for it to enumerate deployed services gives the wrong answer; use the SDK's discovery snapshot.
- **The drift gate does not watch the manifests.** `.github/workflows/registry-generated-quality.yml` triggers on `libs/module-registry/**` and `libs/types/**` only. Editing a pillar's `src/contract/manifest.ts` — the change that actually moves `generated.ts` — does not run it. Regenerate by hand in that PR.
- **The shell swaps this package out for E2E.** With `POPS_REGISTRY_SNAPSHOT` set, `pillars/shell/vite.config.ts` aliases `@pops/module-registry` to a generated file exposing only the exports the shell imports. Adding a shell dependency on a new export means updating that snapshot script too.
