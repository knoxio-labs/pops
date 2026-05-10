import * as egoModule from './cerebrum/ego/index.js';
import * as cerebrumModule from './cerebrum/index.js';
import * as coreModule from './core/index.js';
import * as financeModule from './finance/index.js';
import * as inventoryModule from './inventory/index.js';
import * as mediaModule from './media/index.js';

/**
 * Backend module manifests — single source of truth for cross-cutting
 * aggregation on the API side (PRD-101).
 *
 * Mirrors `@pops/module-registry`'s `MODULES` constant in spirit: each entry
 * is a backend `ModuleManifest` exported by its module's `index.ts`. Cross-
 * cutting concerns (settings, features, AI tools, migrations) read from this
 * list via `flatMap` rather than a separate runtime registry.
 *
 * Why duplicate the list here instead of importing `MODULES` directly from
 * `@pops/module-registry`? The registry's emitted constant is a metadata-only
 * projection (id, surfaces, capabilities, …) — it intentionally does not
 * carry the live `backend.router`, `settings`, or `aiTools` references
 * because doing so would invert the dependency graph (`@pops/module-registry`
 * is `@pops/types`-only). The aggregator here imports the live backend
 * manifests, which already declare the cross-cutting slots PRD-101 reads.
 *
 * Because each module's `index.ts` imports its own router file (which in turn
 * imports this aggregator — see `core/settings/router.ts`), the imports below
 * use namespace-style `import * as` syntax. ES modules tolerate cycles when
 * the consumer dereferences the binding lazily; reading the `manifest` export
 * inside `getBackendManifests()` (called at runtime, not at module-load time)
 * is the lazy-deref point that breaks the cycle.
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/us-04-settings-from-registry.md`
 * for the settings consumer.
 */
import type { ModuleManifest, SettingsManifest } from '@pops/types';

/**
 * Resolve the live backend module manifest list. Computed lazily so the
 * function tolerates ES module cyclic imports between this aggregator and
 * each module's `index.ts` (the cycle is unavoidable: the settings router
 * lives inside `core/index.ts` and itself reads from this aggregator).
 *
 * Order is preserved by every aggregator that consumes the result, so the
 * relative ordering of sections in `/settings`, AI tool surfaces, and
 * migration runs is deterministic.
 */
export function getBackendManifests(): readonly ModuleManifest[] {
  return [
    coreModule.manifest,
    financeModule.manifest,
    inventoryModule.manifest,
    mediaModule.manifest,
    egoModule.manifest,
    cerebrumModule.manifest,
  ];
}

/**
 * Aggregate every backend module's `settings` slot into a single ordered
 * list. Replaces the runtime `settingsRegistry.getAll()` call after PRD-101
 * US-04 — the source of truth is each module's manifest, not a side-effect
 * registration. Sections within a manifest preserve their declaration order;
 * across manifests, sections are sorted by their `order` field (matching the
 * pre-PRD-101 behaviour the page renderer assumed).
 */
export function getAllSettingsManifests(): SettingsManifest[] {
  return getBackendManifests()
    .flatMap((m) => m.settings ?? [])
    .toSorted((a, b) => a.order - b.order);
}
