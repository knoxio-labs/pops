import { installedManifests } from './installed-modules.js';

/**
 * Backend module manifests — convenience wrapper around `installedManifests()`
 * (PRD-101 US-05) for the settings aggregator. Both aggregators share the
 * same source so test overrides (`__setInstalledManifestsOverride`) flow
 * through to settings lookups.
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/us-04-settings-from-registry.md`
 * for the settings consumer.
 */
import type { ModuleManifest, SettingsManifest } from '@pops/types';

/**
 * Resolve the live backend module manifest list. Delegates to
 * `installedManifests()` so the build-time `MODULES` install set and any
 * test-only override applied via `__setInstalledManifestsOverride` are
 * honoured uniformly across every cross-cutting aggregator.
 */
export function getBackendManifests(): readonly ModuleManifest[] {
  return installedManifests();
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
