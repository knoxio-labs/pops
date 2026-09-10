/**
 * Boot install-set resolver — resilience contract tests (P7-T03 / RD-3).
 *
 * The safety-critical guarantee under test: the shell mounts the live
 * registry snapshot's pillars when the registry is reachable, and NEVER
 * bricks when it is not — it falls back to the static in-repo bundle-map
 * floor. Both branches are exercised with injected fixtures (no live fetch).
 */
import { describe, expect, it, vi } from 'vitest';

import { fetchBootRegistry, resolveBootRegistry } from './boot-snapshot';
import { WORKSPACE_BUNDLE_MAP } from './bundle-map';
import { filterAppManifests } from './installed-modules';

import type { ManifestPayload, PillarSnapshot } from '@pops/pillar-sdk';

import type { RemoteModuleImporter } from './external-ui';

function manifestPayload(pillar: string, extra: Partial<ManifestPayload> = {}): ManifestPayload {
  return {
    pillar,
    version: '1.0.0',
    contract: { package: `@pops/${pillar}`, version: '1.0.0', tag: `contract-${pillar}@v1.0.0` },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    ...extra,
  };
}

function snapshotEntry(
  pillarId: string,
  options: { registered?: boolean; manifest?: Partial<ManifestPayload> } = {}
): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3001`,
    manifest: manifestPayload(pillarId, options.manifest),
    registered: options.registered ?? true,
    lastSeenAt: new Date(0),
  };
}

const EXTERNAL_NAV = {
  id: 'weather',
  label: 'Weather',
  labelKey: 'weather',
  icon: 'Compass',
  basePath: '/weather',
  order: 35,
  items: [{ path: '', label: 'Home', labelKey: 'weather.home', icon: 'Compass' }],
};

const EXTERNAL_PAGES = [{ path: '', index: true, bundleSlot: 'home' }];

function externalSnapshotEntry(): PillarSnapshot {
  return snapshotEntry('weather', {
    manifest: {
      assetsBaseUrl: 'https://cdn.example.com/weather/index.js',
      nav: EXTERNAL_NAV,
      pages: EXTERNAL_PAGES,
    },
  });
}

/** A no-op importer; synthesis is synchronous, so it must never be invoked. */
const inertImporter: RemoteModuleImporter = () =>
  Promise.reject(new Error('importer must not run during synthesis'));

const IN_REPO_IDS = Object.keys(WORKSPACE_BUNDLE_MAP);

describe('resolveBootRegistry — registry-driven (snapshot non-empty)', () => {
  it('derives the install set from the snapshot, not the full bundle map', () => {
    const result = resolveBootRegistry([snapshotEntry('media'), snapshotEntry('lists')]);
    expect(result.source).toBe('registry');
    expect(result.manifests.map((m) => m.id).toSorted()).toEqual(['lists', 'media']);
    // The snapshot narrowed the install set to two of the pillars the bundle
    // map still carries, proving the registry is the source of truth. Stated
    // against `IN_REPO_IDS` rather than a number, because POPS-3215 is
    // emptying that map one pillar at a time.
    expect(result.manifests.length).toBeLessThan(IN_REPO_IDS.length);
  });

  it('drops a backend-only registered pillar with no UI surface', () => {
    const result = resolveBootRegistry([
      snapshotEntry('media'),
      // `registry` is in the snapshot but absent from the bundle map and
      // advertises no assetsBaseUrl → walk drops it silently.
      snapshotEntry('registry'),
    ]);
    expect(result.manifests.map((m) => m.id)).toEqual(['media']);
  });

  it('mounts an in-repo pillar AND an external pillar from one snapshot', () => {
    const result = resolveBootRegistry(
      [snapshotEntry('media'), externalSnapshotEntry()],
      inertImporter
    );
    expect(result.source).toBe('registry');
    expect(result.manifests.map((m) => m.id).toSorted()).toEqual(['media', 'weather']);

    const railIds = result.registeredApps.map((a) => a.id);
    expect(railIds).toContain('media');
    expect(railIds).toContain('weather');
    // Wire nav.order (finance=10 in-repo, weather=35) keeps the rail ordered.
    expect(railIds.indexOf('media')).toBeLessThan(railIds.indexOf('weather'));
  });

  it('mounts an external pillar advertised only via assetsBaseUrl through the runtime loader', () => {
    const result = resolveBootRegistry([externalSnapshotEntry()], inertImporter);
    const weather = result.manifests.find((m) => m.id === 'weather');
    expect(weather).toBeDefined();
    expect(weather?.surfaces).toContain('app');
    expect(Array.isArray(weather?.frontend?.routes)).toBe(true);
    expect(result.registeredApps.map((a) => a.id)).toContain('weather');
  });

  // M2(a): the registry-driven branch is THIS PR's whole purpose, yet no
  // rendered/e2e test exercises it (every e2e silently falls through to the
  // floor — see the PR body). This focused unit pins the live-mount path
  // non-blank: a non-empty snapshot with 1 in-repo pillar (bundle-map hit) and
  // 1 external pillar (assetsBaseUrl) must yield source='registry' with BOTH a
  // non-empty router manifest set (including the synthesized external route)
  // and a non-empty app rail. A regression that breaks only the live mount —
  // invisible to the floor-only e2e — fails here.
  it('drives the live registry branch to a non-blank surface (in-repo + external)', () => {
    const result = resolveBootRegistry(
      [snapshotEntry('media'), externalSnapshotEntry()],
      inertImporter
    );

    expect(result.source).toBe('registry');

    // Router-facing set: non-empty, both pillars present, external route synthesized.
    expect(result.manifests.length).toBeGreaterThan(0);
    expect(result.manifests.map((m) => m.id).toSorted()).toEqual(['media', 'weather']);
    const external = result.manifests.find((m) => m.id === 'weather');
    expect(external?.surfaces).toContain('app');
    const externalRoutes = external?.frontend?.routes;
    expect(Array.isArray(externalRoutes)).toBe(true);
    if (Array.isArray(externalRoutes)) {
      expect(externalRoutes.length).toBeGreaterThan(0);
    }

    // App rail: non-empty, both pillars present.
    expect(result.registeredApps.length).toBeGreaterThan(0);
    expect(result.registeredApps.map((a) => a.id)).toEqual(
      expect.arrayContaining(['media', 'weather'])
    );
  });
});

describe('resolveBootRegistry — never-brick on a zero-UI live snapshot', () => {
  // M1 (never-brick hole): a NON-EMPTY snapshot whose pillars are all
  // backend-only — no bundle-map hit, no assetsBaseUrl — is the live state
  // mid-deploy on a host restart, before the app pillars have re-registered
  // (only `registry` / `orchestrator` are up). `snapshot.length > 0` is true,
  // but the snapshot resolves to zero mountable UI. Treating that as
  // "registry is the source of truth" would mount an app-less shell (manifests
  // = [], registeredApps = []) — exactly the brick the resilience contract
  // forbids, reachable on a real capivara restart. The resolver must fall back
  // to the static floor instead.
  const BACKEND_ONLY_SNAPSHOT = [snapshotEntry('registry'), snapshotEntry('orchestrator')];

  it('falls back to the static floor (source) when a live snapshot resolves to zero mountable UI', () => {
    const result = resolveBootRegistry(BACKEND_ONLY_SNAPSHOT);
    expect(result.source).toBe('static-floor');
  });

  it('mounts the FULL in-repo rail (not an app-less shell) on the zero-UI fallback', () => {
    const result = resolveBootRegistry(BACKEND_ONLY_SNAPSHOT);

    // The router-facing app set must equal the floor's app-routed pillars
    // exactly — a blank shell would surface as []. This is the literal
    // never-brick guarantee under the precise hole M1 closes.
    const floorAppIds = IN_REPO_IDS.filter((id) => {
      const m = WORKSPACE_BUNDLE_MAP[id]?.manifest;
      return m?.surfaces.includes('app') === true && Array.isArray(m.frontend?.routes);
    }).toSorted();
    const mountedAppIds = filterAppManifests(result.manifests)
      .map((m) => m.id)
      .toSorted();
    expect(mountedAppIds).toEqual(floorAppIds);
    expect(mountedAppIds.length).toBeGreaterThan(0);

    // And the app rail is the full in-repo floor, in nav.order — never blank.
    // `purchases` is not on it: it reaches the shell through the runtime
    // loader (POPS-3217), and the floor is the static bundle map. With the
    // registry unreachable its UI is absent, which is the same condition
    // under which its API is undiscoverable — the shell still boots, and
    // every pillar still in the map still mounts, which is what never-brick
    // asserts.
    expect(result.registeredApps.map((a) => a.id)).toEqual(['media', 'lists', 'cerebrum']);

    // The result must be byte-identical to the empty-snapshot floor: the
    // zero-UI live snapshot degrades EXACTLY as if the registry were down.
    const emptyFloor = resolveBootRegistry([]);
    expect(mountedAppIds).toEqual(
      filterAppManifests(emptyFloor.manifests)
        .map((m) => m.id)
        .toSorted()
    );
    expect(result.registeredApps.map((a) => a.id)).toEqual(
      emptyFloor.registeredApps.map((a) => a.id)
    );
  });
});

describe('resolveBootRegistry — never-brick fallback (snapshot empty)', () => {
  it('renders the FULL in-repo app set from the static floor when the snapshot is empty', () => {
    const result = resolveBootRegistry([]);
    expect(result.source).toBe('static-floor');

    // The never-brick guarantee: every in-repo app-routed pillar still mounts.
    // Assert the router-facing app set (the exact `filterAppManifests`
    // predicate the router uses) is non-empty AND matches the bundle-map
    // floor's app-routed pillars exactly — a blank shell would surface as [].
    expect(result.manifests.length).toBeGreaterThan(0);
    const floorAppIds = IN_REPO_IDS.filter((id) => {
      const m = WORKSPACE_BUNDLE_MAP[id]?.manifest;
      return m?.surfaces.includes('app') === true && Array.isArray(m.frontend?.routes);
    }).toSorted();
    const mountedAppIds = filterAppManifests(result.manifests)
      .map((m) => m.id)
      .toSorted();
    expect(mountedAppIds).toEqual(floorAppIds);
    expect(mountedAppIds.length).toBeGreaterThan(0);
  });

  it('renders the full in-repo app rail (not blank) on the fallback path', () => {
    const result = resolveBootRegistry([]);
    expect(result.registeredApps.length).toBeGreaterThan(0);
    expect(result.registeredApps.map((a) => a.id)).toEqual(['media', 'lists', 'cerebrum']);
  });
});

describe('fetchBootRegistry — fetch-failure resilience', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('uses the snapshot when the fetch returns registered pillars', async () => {
    const fetchStub = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          pillars: [
            {
              pillarId: 'media',
              baseUrl: 'http://media-api:3003',
              manifest: manifestPayload('media'),
              lastHeartbeatAt: new Date(0).toISOString(),
            },
          ],
        })
      )
    );
    const result = await fetchBootRegistry({ fetch: fetchStub, store: noCache() });
    expect(result.source).toBe('registry');
    expect(result.manifests.map((m) => m.id)).toEqual(['media']);
  });

  /**
   * An explicitly empty store on each of these.
   *
   * Their subject is "a failed fetch still yields a surface", and since
   * POPS-3239 the surface is the last good snapshot when there is one. Left
   * ambient they would read whatever `localStorage` happened to hold — which
   * is the previous test's leftovers, not a floor anyone chose.
   */
  function noCache() {
    let value: string | null = null;
    return {
      getItem: () => value,
      setItem: (_k: string, next: string) => {
        value = next;
      },
      removeItem: () => {
        value = null;
      },
    };
  }

  it('falls back to the static floor when the fetch rejects (registry unreachable)', async () => {
    const fetchStub = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const result = await fetchBootRegistry({ fetch: fetchStub, store: noCache() });
    expect(result.source).toBe('static-floor');
    expect(result.manifests.length).toBeGreaterThan(0);
  });

  it('falls back to the static floor on a non-OK status', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(jsonResponse({}, 502)));
    const result = await fetchBootRegistry({ fetch: fetchStub, store: noCache() });
    expect(result.source).toBe('static-floor');
    expect(result.registeredApps.length).toBeGreaterThan(0);
  });

  it('falls back to the static floor on an empty pillar list', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(jsonResponse({ pillars: [] })));
    const result = await fetchBootRegistry({ fetch: fetchStub, store: noCache() });
    expect(result.source).toBe('static-floor');
    expect(result.registeredApps.length).toBeGreaterThan(0);
  });

  it('falls back to the static floor when the fetch times out', async () => {
    const fetchStub = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const result = await fetchBootRegistry({ fetch: fetchStub, timeoutMs: 1 });
    expect(result.source).toBe('static-floor');
    expect(result.manifests.length).toBeGreaterThan(0);
  });
});

/**
 * The cached-snapshot floor (POPS-3239).
 *
 * The shell's offline floor used to be the static bundle map. POPS-3215
 * empties that map, so the floor empties with it — at the end of the epic a
 * registry outage would leave the shell with its own chrome, an empty rail and
 * the settings page. These drive the replacement: the set that answered last
 * time.
 */
describe('fetchBootRegistry — the cached-snapshot floor', () => {
  function memoryStore(initial?: string) {
    let value = initial ?? null;
    return {
      getItem: () => value,
      setItem: (_k: string, next: string) => {
        value = next;
      },
      removeItem: () => {
        value = null;
      },
      read: () => value,
    };
  }

  function okFetch(pillarIds: readonly string[]) {
    return vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            pillars: pillarIds.map((pillarId) => ({
              pillarId,
              baseUrl: `http://${pillarId}-api:3000`,
              manifest: manifestPayload(pillarId),
              lastHeartbeatAt: new Date(0).toISOString(),
            })),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
  }

  const deadFetch = () => vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));

  it('caches a snapshot that resolved to a usable surface', async () => {
    const store = memoryStore();
    const result = await fetchBootRegistry({ fetch: okFetch(['media']), store });

    expect(result.source).toBe('registry');
    expect(store.read()).toContain('media');
  });

  // The whole point: the registry is unreachable and the pillars are not.
  it('mounts the last good snapshot when the registry is unreachable', async () => {
    const store = memoryStore();
    await fetchBootRegistry({ fetch: okFetch(['media']), store });

    const offline = await fetchBootRegistry({ fetch: deadFetch(), store });

    expect(offline.source).toBe('cached-snapshot');
    expect(offline.manifests.map((m) => m.id)).toEqual(['media']);
  });

  it('prefers a live snapshot over the cached one', async () => {
    const store = memoryStore();
    await fetchBootRegistry({ fetch: okFetch(['media']), store });

    const live = await fetchBootRegistry({ fetch: okFetch(['lists']), store });

    expect(live.source).toBe('registry');
    expect(live.manifests.map((m) => m.id)).toEqual(['lists']);
  });

  // A snapshot that mounted nothing is not a floor. Caching it would replace a
  // good one with a useless one.
  it('does not cache a snapshot that resolved to nothing', async () => {
    const store = memoryStore();
    await fetchBootRegistry({ fetch: okFetch(['media']), store });
    await fetchBootRegistry({ fetch: okFetch(['registry']), store });

    expect(store.read()).toContain('media');
    expect(store.read()).not.toContain('"pillarId":"registry"');
  });

  it('falls through to the static floor when there is no cache', async () => {
    const result = await fetchBootRegistry({ fetch: deadFetch(), store: memoryStore() });
    expect(result.source).toBe('static-floor');
  });

  // Every pillar in the cache has left the build, so it resolves to nothing.
  // Keeping it would fail identically on every boot from here on.
  it('drops a cache that no longer resolves to anything', async () => {
    const stale = JSON.stringify([
      {
        pillarId: 'a-pillar-that-no-longer-exists',
        baseUrl: 'http://gone:3000',
        registered: true,
        lastSeenAt: new Date(0).toISOString(),
        manifest: manifestPayload('a-pillar-that-no-longer-exists'),
      },
    ]);
    const store = memoryStore(stale);

    const result = await fetchBootRegistry({ fetch: deadFetch(), store });

    expect(result.source).toBe('static-floor');
    expect(store.read()).toBeNull();
  });
});
