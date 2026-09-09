/**
 * Boot install-set resolver (P7-T03 / RD-3) — the async boot boundary that
 * makes the live registry snapshot the source of truth for which pillars the
 * shell mounts.
 *
 * The shell historically built its router + app rail synchronously at
 * module-eval time from the build-time `MODULES` constant. This module moves
 * that decision behind an `await`: `main.tsx` fetches the registry snapshot
 * before first render, resolves it here into a {@link BootRegistry}
 * (`{ manifests, registeredApps }`), then builds the router and seeds the nav
 * context from the resolved value.
 *
 * Resilience contract (never brick the shell):
 *
 *   - snapshot non-empty AND it resolves to ≥1 mountable UI surface → the
 *     registry's `registered` entries ARE the install set. In-repo pillars
 *     resolve via the static bundle map; external pillars (advertising
 *     `assetsBaseUrl`) via the runtime loader; backend-only pillars are
 *     dropped — exactly `walkRegistry`'s existing decision tree.
 *   - snapshot empty / fetch failed / timed out / resolves to ZERO mountable
 *     UI → fall back to the static bundle-map floor (the in-repo pillars, i.e.
 *     the pre-P7-T03 behaviour). The zero-UI case covers a live snapshot whose
 *     pillars are all backend-only (e.g. only `registry`/`orchestrator`
 *     registered mid-bring-up) — that must NOT mount an app-less shell. The
 *     shell MUST render its in-repo app set even with the registry down or
 *     mid-restart.
 *
 * The snapshot fetch itself soft-fails to `[]` (see `registry-snapshot-fetch`),
 * so an unreachable registry surfaces here as the empty-snapshot branch.
 */
import {
  fetchRegistrySnapshot,
  type RegistrySnapshotFetchOptions,
} from '@/lib/registry-snapshot-fetch';

import { WORKSPACE_BUNDLE_MAP, type BundleEntry } from './bundle-map';
import { synthesizeExternalBundleEntry, type RemoteModuleImporter } from './external-ui';
import {
  bootEntries,
  ExternalUiLoadError,
  offlineInstallableSnapshot,
  staticFloorEntries,
  walkRegistry,
  type FrontendManifest,
  type RegistryEntry,
} from './installed-modules';
import { buildRegisteredAppsFromBundleMap } from './nav/registry';
import {
  cacheRegistrySnapshot,
  clearCachedRegistrySnapshot,
  readCachedRegistrySnapshot,
  type SnapshotStore,
} from './snapshot-cache';

import type { PillarSnapshot } from '@pops/pillar-sdk';

import type { AppNavConfig } from './nav/types';

/**
 * The resolved boot install set the shell renders. `manifests` drives the
 * router's app routes; `registeredApps` drives the app rail / sidebar / page
 * nav / index redirect.
 */
export interface BootRegistry {
  readonly manifests: readonly FrontendManifest[];
  readonly registeredApps: readonly AppNavConfig[];
  /**
   * `assetsBaseUrl` of every mounted pillar the runtime loader will import,
   * so boot can `modulepreload` them rather than leaving the first request
   * until the reader navigates (`preload-remote-bundles.ts`). Only pillars
   * that actually resolved to a mounted surface appear — an operator's
   * install-set selection is honoured here as everywhere else.
   */
  readonly remoteBundleUrls: readonly string[];
  /**
   * The resolved bundle map — in-repo entries plus the ones synthesized for
   * loader-mounted pillars. Exposed because a pillar contributes surfaces
   * beyond its pages: the capture-overlay and settings-widget registries
   * resolve a slot through a `BundleEntry`, and resolving it against the
   * STATIC map would silently lose those surfaces for every pillar that has
   * left it (POPS-3266).
   */
  readonly bundleMap: Readonly<Record<string, BundleEntry>>;
  /**
   * Where the install set came from: `'registry'` for a live snapshot,
   * `'cached-snapshot'` for the last one that worked, `'static-floor'` for the
   * in-repo bundle map. Exposed for diagnostics / tests; consumers render
   * identically whichever it is.
   */
  readonly source: 'registry' | 'cached-snapshot' | 'static-floor';
}

/**
 * Resolve the entry list to the bundle map the app rail walks. In-repo
 * pillars pick up their static bundle entry (carrying the real `navOrder`);
 * external pillars synthesise one from the wire descriptor via
 * `synthesizeExternalBundleEntry` — the same call the router-side walk uses —
 * so the rail orders both kinds through the single
 * `buildRegisteredAppsFromBundleMap` projection. Entries with no resolvable
 * UI surface contribute no rail entry.
 *
 * Synthesis is wrapped in the same `try/catch` the router-side
 * `resolveExternalManifest` uses (`installed-modules.ts`): a structurally
 * broken external descriptor logs once and is skipped on the rail path too,
 * so the two walks stay symmetric and a bad descriptor can never throw out of
 * boot resolution via the rail.
 */
function railBundleMap(
  entries: readonly RegistryEntry[],
  importer?: RemoteModuleImporter
): Record<string, BundleEntry> {
  const out: Record<string, BundleEntry> = {};
  for (const entry of entries) {
    const inRepo = WORKSPACE_BUNDLE_MAP[entry.pillarId];
    if (inRepo !== undefined) {
      out[entry.pillarId] = inRepo;
      continue;
    }
    if (entry.assetsBaseUrl === undefined) continue;
    try {
      const synthesized = synthesizeExternalBundleEntry(
        {
          pillarId: entry.pillarId,
          assetsBaseUrl: entry.assetsBaseUrl,
          nav: entry.nav,
          pages: entry.pages,
        },
        importer
      );
      if (synthesized !== null) out[entry.pillarId] = synthesized;
    } catch (cause) {
      const err = new ExternalUiLoadError(entry.pillarId, entry.assetsBaseUrl, cause);
      console.warn(`[boot-snapshot] ${err.message}`, cause);
    }
  }
  return out;
}

/**
 * The router manifests + app-rail nav an entry list resolves to. The two
 * always travel together (the router and the rail must agree on the mounted
 * set), so the resolver computes them in one pass and the never-brick check
 * inspects both before deciding whether a snapshot yielded any UI.
 */
interface ResolvedSurface {
  readonly manifests: readonly FrontendManifest[];
  readonly registeredApps: readonly AppNavConfig[];
  readonly remoteBundleUrls: readonly string[];
  readonly bundleMap: Readonly<Record<string, BundleEntry>>;
}

function resolveSurface(
  entries: readonly RegistryEntry[],
  importer?: RemoteModuleImporter
): ResolvedSurface {
  const bundleMap = railBundleMap(entries, importer);
  return {
    bundleMap,
    manifests: walkRegistry(entries, WORKSPACE_BUNDLE_MAP, importer),
    registeredApps: buildRegisteredAppsFromBundleMap(bundleMap),
    // Read off the resolved map rather than the raw entries: a pillar that
    // advertised a URL but no mountable surface is not in the map, and
    // preloading a bundle nothing will import is a request for nothing.
    remoteBundleUrls: Object.values(bundleMap)
      .map((entry) => entry.assetsBaseUrl)
      .filter((url): url is string => url !== undefined),
  };
}

/**
 * Resolve a registry snapshot into the boot install set.
 *
 * A non-empty snapshot is normally the source of truth: its `registered`
 * pillars ARE the install set (in-repo via the bundle map, external via the
 * runtime loader). An empty snapshot — or one that resolves to zero mountable
 * UI — falls back to the static bundle-map floor (the never-brick guarantee).
 *
 * The zero-UI fallback closes a real hole: a non-empty snapshot whose pillars
 * are all backend-only (no bundle-map hit, no `assetsBaseUrl`) — e.g. only
 * `registry` / `orchestrator` registered mid-bring-up, before the app pillars
 * have re-registered after a host restart — resolves to no manifests and no
 * rail entries. Treating that as "the registry is the source of truth" would
 * mount an app-less shell, which the resilience contract forbids. So when a
 * live snapshot resolves to an empty surface we degrade to the floor exactly
 * as if the registry were unreachable.
 *
 * `importer` is injectable so tests exercise the external-pillar path without
 * a network round-trip; production omits it and the runtime loader uses the
 * real dynamic `import()`.
 */
export function resolveBootRegistry(
  snapshot: readonly PillarSnapshot[],
  importer?: RemoteModuleImporter
): BootRegistry {
  const registryEntries = snapshot.length > 0 ? bootEntries(snapshot) : null;

  if (registryEntries !== null) {
    const surface = resolveSurface(registryEntries, importer);
    if (surface.manifests.length > 0 || surface.registeredApps.length > 0) {
      return { ...surface, source: 'registry' };
    }
  }

  const floor = resolveSurface(staticFloorEntries(), importer);
  return { ...floor, source: 'static-floor' };
}

/**
 * What `fetchBootRegistry` takes: the snapshot fetch's own options, plus the
 * store the cached-snapshot floor reads and writes. `store` is injectable so a
 * test can drive its own object rather than the ambient `localStorage`.
 */
export interface BootRegistryOptions extends RegistrySnapshotFetchOptions {
  readonly store?: SnapshotStore;
}

/**
 * Fetch the live registry snapshot and resolve it into the boot install set.
 * The await boundary `main.tsx` blocks first render on. Never throws.
 *
 * Three tiers, in order, each a fallback for the one before:
 *
 *   1. the live snapshot, whenever it resolves to a mountable surface;
 *   2. when tier 1 gives nothing, boot resolves to the cached snapshot — the
 *      last one that did, held in `localStorage` and narrowed by the install
 *      set, since it stands in for the offline floor (POPS-3239);
 *   3. the static bundle-map floor, which POPS-3215 is emptying, so on a
 *      first visit with the registry down this is increasingly nothing.
 *
 * The fetch soft-fails to `[]`, so an unreachable registry arrives here as
 * tier 1 resolving to nothing rather than as a throw.
 */
export async function fetchBootRegistry(options: BootRegistryOptions = {}): Promise<BootRegistry> {
  const { store, ...fetchOptions } = options;
  const snapshot = await fetchRegistrySnapshot(fetchOptions);

  const live = resolveBootRegistry(snapshot);
  if (live.source === 'registry') {
    // Only a snapshot that actually resolved to a surface is worth keeping: a
    // cached one that mounts nothing would replace a good floor with a useless
    // one, which is worse than having no cache at all.
    cacheRegistrySnapshot(snapshot, store);
    return live;
  }

  // The live snapshot gave nothing mountable — unreachable registry, an empty
  // list, or only backend-only pillars mid-bring-up. The set that answered
  // last time is a better floor than whatever this build happens to have
  // compiled in, and it shrinks to nothing as POPS-3215 empties the bundle map
  // (POPS-3239).
  // Narrowed by the install set, because this is the offline floor and the
  // floor honours `POPS_APPS` — see `offlineInstallableSnapshot`.
  const cached = offlineInstallableSnapshot(readCachedRegistrySnapshot(store));
  if (cached.length > 0) {
    const fromCache = resolveBootRegistry(cached);
    // `source === 'registry'` is the test, not a non-empty surface.
    // `resolveBootRegistry` falls back to the static floor internally when a
    // snapshot resolves to nothing, so a cache of backend-only pillars comes
    // back non-empty — as the floor — and labelling that `cached-snapshot`
    // would report a floor the cache did not supply.
    if (fromCache.source === 'registry') {
      return { ...fromCache, source: 'cached-snapshot' };
    }
    // Cached, and no longer resolves to anything — every pillar in it has left
    // the build. Keeping it would fail the same way on every boot.
    clearCachedRegistrySnapshot(store);
  }

  return live;
}
