# @pops/types

The type vocabulary shared by every pillar and by the platform libs that assemble them: the `ModuleManifest` a pillar exports as its `./manifest`, the registry/health entry shapes, and the settings, features, search and URI descriptors those manifests carry. It declares **no dependencies at all** — that is the point. Any type in here has to be importable by a backend, a browser bundle, and a build script alike, so nothing that would drag in React, zod, or an SDK belongs. Each descriptor's header names what it deliberately excludes and why.

Everything is type-only except one runtime export: `assertModuleManifest`, the structural validator `@pops/module-registry` runs over each discovered manifest at build time.

## Two manifests, one word

This is the thing to get straight before reading anything else. A pillar authors **two** manifests, and they are unrelated shapes:

- **`ModuleManifest` (here)** — build-time, plain data, exported from `pillars/<id>/src/contract/manifest.ts`. `@pops/module-registry` imports it, validates it, and bakes it into `generated.ts`.
- **`ManifestPayload` (`@pops/pillar-sdk/manifest-schema`)** — the zod-validated wire envelope built in `pillars/<id>/src/api/manifest.ts` and POSTed to the registry on boot. Nav, pages, capabilities, AI tools and search adapters live here.

Confusing them is the most common first mistake. Adding a slot to one does nothing for the other.

## Who depends on it

Eleven pillars — `ai`, `cerebrum`, `documents`, `finance`, `food`, `inventory`, `lists`, `media`, `orchestrator`, `registry`, `shell` — plus `libs/module-registry`, `libs/ui` and `libs/overlay-ego`. `mcp`, `docs` and `moltbot` are TS pillars that import nothing from it. Concentrated in a handful of types:

| Type                                                   | Consumers                                                                                                                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PillarRegistryEntry`                                  | each backend pillar's `api/pillars/registry.ts` + `env.ts` (`src/pillars/` in `orchestrator`), the registry's dispatcher and health probe, and the shell's `app/pillars/pillar-registry-client.ts` |
| `ModuleManifest`, `assertModuleManifest`               | each pillar's contract manifest; `@pops/module-registry`'s build                                                                                                                                   |
| `SettingsManifest` / `SettingsGroup` / `SettingsField` | pillar settings declarations and the shell's settings renderer                                                                                                                                     |
| `FeatureManifest`, `FeatureStatus`                     | the registry's feature service and the shell's admin Features page                                                                                                                                 |
| `UriResolverResult`                                    | the registry's URI resolver and dispatcher, and `@pops/ui`'s `UriCard`                                                                                                                             |

## Constraints

- **A lib may never import a pillar** (`scripts/ci/check-lib-no-pillar-import.mjs`). Trivially satisfied here, and it is why cross-pillar contracts land in this package rather than in whichever pillar happens to own the feature.
- **Types-only means the search types have hand-written zod twins.** `finance` and `inventory` each re-declare `StructuredFilter`, `SearchContext`, `MatchType` and `SearchHit` as zod schemas in their `src/contract/rest-search.ts`, marked "Mirrors X in `@pops/types`". Nothing compares them. A change here must be replayed in both. Only `orchestrator` imports the originals.

## Absent

The PRD-101 backend manifest slots are declared but never populated. `MigrationDescriptor`, `IngestSourceDescriptor`, `AiToolDescriptor`, `SearchAdapterDescriptor` and `UriHandlerDescriptor` have zero importers outside this package, and all nine modules in `libs/module-registry/src/generated.ts` report `hasBackend: false`. The capabilities they describe — migrations, AI tools, search adapters, URI handling — moved to the runtime `ManifestPayload` when the platform split into pillars. Do not add to them expecting a consumer.
