/**
 * Stand-ins for the REST surfaces the shell itself talks to on every load.
 *
 * A pillar's own routes belong in the spec that exercises that pillar — this
 * module covers only the shell's boot path and the search bar:
 *
 *   GET  /registry-api/registry/pillars  the full snapshot; boot resolves the
 *                                        install set from it before first
 *                                        render (`src/app/boot-snapshot.ts`)
 *   GET  /registry-api/shell/manifest    the operator's `POPS_APPS` selection,
 *                                        which `IndexRedirect` lands `/` on
 *   GET  /pillars, /pillars/health       the boot projection + health
 *                                        aggregator `PillarGuard` reads
 *   POST /orchestrator-api/search        federated search behind the top bar
 *
 * Leaving those unstubbed does not fail loudly: each one soft-fails to a
 * fallback, so the shell still renders and the spec still passes — against
 * the fallback path rather than the one it meant to test. Stubbing them is
 * what makes a run say the same thing twice.
 *
 * The route patterns are anchored regexes, not `**` globs, for one specific
 * reason: `**` spans `/`, so a glob for the pillar-boot endpoint `/pillars`
 * also swallows `/registry-api/registry/pillars`, and Playwright hands a URL
 * to the most recently registered match. That silently served the boot
 * resolver the wrong body and left every install-set assertion reading the
 * static floor instead.
 */
import type { Page, Route } from '@playwright/test';

/** `<origin>/pillars` and nothing deeper — see the anchoring note above. */
const PILLAR_BOOT_URL = /^https?:\/\/[^/]+\/pillars$/;
const PILLAR_HEALTH_URL = /^https?:\/\/[^/]+\/pillars\/health$/;
const REGISTRY_SNAPSHOT_URL = /\/registry-api\/registry\/pillars$/;
const SHELL_MANIFEST_URL = /\/registry-api\/shell\/manifest$/;
const ORCHESTRATOR_SEARCH_URL = /\/orchestrator-api\/search$/;

/** Fulfil `route` with `body` as JSON. */
export function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * The smallest manifest `ManifestPayloadSchema` accepts. A snapshot entry
 * whose manifest fails that parse is dropped silently by
 * `normaliseSnapshotEntry`, which reads downstream as "the registry didn't
 * list this pillar" — so the required slots are all filled here even though
 * no assertion looks at them.
 */
function minimalManifest(pillarId: string): Record<string, unknown> {
  return {
    pillar: pillarId,
    version: '0.1.0',
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '0.1.0',
      tag: `contract-${pillarId}@v0.1.0`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

/**
 * Answer the boot snapshot fetch with exactly `pillarIds` registered, and the
 * shell manifest with the same set as the operator's selection.
 *
 * Only in-repo pillar ids resolve to mountable UI (boot looks them up in the
 * static bundle map), and an id that resolves to none contributes no rail
 * entry. Pass `[]` to exercise the never-brick fallback: an empty snapshot
 * degrades to the static bundle-map floor rather than an app-less shell.
 */
export async function stubRegistry(page: Page, pillarIds: readonly string[]): Promise<void> {
  const pillars = pillarIds.map((pillarId) => ({
    pillarId,
    baseUrl: `http://${pillarId}-api:3000`,
    manifest: minimalManifest(pillarId),
    capabilities: {},
    lastHeartbeatAt: new Date().toISOString(),
  }));
  await page.route(REGISTRY_SNAPSHOT_URL, (route) => json(route, 200, { pillars }));
  await page.route(SHELL_MANIFEST_URL, (route) =>
    json(route, 200, { apps: [...pillarIds], overlays: [] })
  );
}

/**
 * Take the registry off the air, so boot has to fall back.
 *
 * Anchored to the two endpoints rather than the `/registry-api` prefix: in dev
 * the shell's own generated client is served from `/src/registry-api/*.ts`, so
 * a prefix match aborts the app's source modules and the page never mounts at
 * all — which looks exactly like the outage under test and proves nothing.
 */
export async function failRegistry(page: Page): Promise<void> {
  await page.route(REGISTRY_SNAPSHOT_URL, (route) => route.abort('failed'));
  await page.route(SHELL_MANIFEST_URL, (route) => route.abort('failed'));
}

/** Report every pillar in `pillarIds` healthy to `PillarGuard`. */
export async function stubPillarHealth(page: Page, pillarIds: readonly string[]): Promise<void> {
  await page.route(PILLAR_BOOT_URL, (route) =>
    json(route, 200, {
      pillars: pillarIds.map((id) => ({ id, baseUrl: `http://${id}-api:3000` })),
    })
  );
  await page.route(PILLAR_HEALTH_URL, (route) =>
    json(route, 200, { health: Object.fromEntries(pillarIds.map((id) => [id, 'healthy'])) })
  );
}

/** Every in-repo pillar the shell's static bundle map can mount. */
export const IN_REPO_PILLARS = [
  'finance',
  'purchases',
  'media',
  'inventory',
  'food',
  'lists',
  'cerebrum',
  'ai',
  'bfm',
] as const;

/**
 * Boot the shell with `pillarIds` registered and healthy. The default is the
 * full in-repo set, which is what a spec about one pillar's page wants: a
 * shell that looks like a normal deploy, with the registry pinned so the
 * result does not depend on which pillars happen to be running.
 */
export async function stubShellBoot(
  page: Page,
  pillarIds: readonly string[] = IN_REPO_PILLARS
): Promise<void> {
  await stubRegistry(page, pillarIds);
  await stubPillarHealth(page, pillarIds);
}

/** One federated-search hit, in the orchestrator's wire shape. */
export interface SearchHit {
  readonly uri: string;
  readonly data: Record<string, unknown>;
}

/** One federated-search section, in the orchestrator's wire shape. */
export interface SearchSection {
  /** Kebab-case domain — also the `section-<domain>` test id the panel renders. */
  readonly domain: string;
  /** Owning module; the shell drops sections for modules it did not mount. */
  readonly moduleId: string;
  readonly hits: readonly SearchHit[];
}

/**
 * Answer `POST /orchestrator-api/search` with `sections`, regardless of query
 * text. The shell's own install-set filter still runs over the result, which
 * is what the finance-only spec asserts.
 */
export async function stubOrchestratorSearch(
  page: Page,
  sections: readonly SearchSection[]
): Promise<void> {
  await page.route(ORCHESTRATOR_SEARCH_URL, (route) =>
    json(route, 200, {
      sections: sections.map((section) => ({
        domain: section.domain,
        moduleId: section.moduleId,
        icon: 'Search',
        color: 'emerald',
        isContextSection: false,
        totalCount: section.hits.length,
        hits: section.hits.map((hit, index) => ({
          uri: hit.uri,
          score: 1 - index / 100,
          matchField: 'title',
          matchType: 'exact',
          data: hit.data,
        })),
      })),
    })
  );
}
