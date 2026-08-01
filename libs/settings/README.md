# @pops/pillar-settings

The shared Read/Update/Reset settings module every pillar mounts so that `/settings/*` is byte-identical across the federation. `src/index.ts`'s header lists what the module owns and states the protocol.

It binds to no identity system and no particular database instance — the mounting pillar injects a drizzle handle and a gate — but it is bound to drizzle + better-sqlite3 as a stack: `schema.ts` declares a drizzle `sqliteTable` and types the handle as `BetterSQLite3Database`. (The Rust twin is storage-agnostic behind an injected `SettingsStore` trait; the two differ here.)

## Who depends on it

| Pillar      | Uses it for                                                                                                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai`        | `makeSettingsContract`, `makeSettingsHandlers` + `SettingsGate`, `deriveKeySet` — over its own `settings` table in `ai.db`                                                                                                                                                       |
| `cerebrum`  | Contract, handlers, `deriveKeySet`, and `settingsTable` re-exported from its own schema                                                                                                                                                                                          |
| `finance`   | Same, **plus** the only in-process consumer of the `service` subpath: `src/api/modules/corrections/ai-runtime.ts` imports `getBulk`/`setBulk` from `@pops/pillar-settings/service`, out of band of HTTP                                                                          |
| `inventory` | Contract, handlers, `deriveKeySet`, `settingsTable` re-export                                                                                                                                                                                                                    |
| `media`     | Contract, `deriveKeySet`, `settingsTable` re-export, and the `KeyDefaults`/`SettingEntry`/`SettingRow` types — but **substitutes its own service**, see below                                                                                                                    |
| `registry`  | Its own surface, **plus** the cross-pillar aggregator: `deriveKeySet` + `redactSensitive` in `api/settings/aggregate-settings.ts`, `listEffective` + `redactSensitive` in `api/rest/settings-aggregate-handler.ts`, and `KeyDefaults` in `api/modules/features/key-ownership.ts` |

Two of those are not the standard mount:

- **`media` does not use the service.** It keeps its legacy `plex_settings` / `rotation_settings` tables alongside a residual shared `settings` table, and supplies `src/db/services/settings-adapter.ts` as a stand-in — read that file's header for what it reconciles. The wire stays canonical; the storage does not. If you change the service's function surface, that adapter drifts silently — it is duck-typed, not implemented against an interface.
- **`registry` reads other pillars' settings.** Its aggregator fans out over the live registry, re-derives each pillar's sensitive-key set from the manifest snapshot, and re-redacts defensively — a downgraded pillar cannot leak a secret through the aggregate sweep.

## Constraints

- **A lib may never import a pillar** (`scripts/ci/check-lib-no-pillar-import.mjs`, run whole-tree by `agent-review.yml`). Note that this does not constrain `@pops/pillar-sdk`, which is itself a lib (`libs/sdk`) and would be legal to import: the manifest field types in `manifest-keys.ts` are redeclared structurally to keep the package decoupled from the SDK, not to satisfy the guard.
- **`libs/pops-settings` is a hand-maintained Rust twin of this wire contract.** Any change to the contract, the wire shapes, or the redaction sentinel must be mirrored there by hand. Nothing enforces it — read that crate's README before you touch `contract.ts`, `redact.ts`, or `service.ts`.

## What first-time consumers get wrong

- **Unknown-key handling is deliberately asymmetric, including inside the write paths.** `set`, `setMany` and `resetKey` throw `UnknownSettingKeyError`, but batch `reset` silently filters undeclared keys rather than rejecting them — so `makeSettingsHandlers`' blanket "WRITE/RESET paths reject keys outside the declared set" does not hold for `reset`. `reset` with no keys resets _everything_ declared.
