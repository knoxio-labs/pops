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
 *
 * Every body below is run through the real consumer's parser or schema
 * before it is ever handed to `page.route`, not just written to look right:
 *
 *   - the manifest and the registry snapshot through `ManifestPayloadSchema` /
 *     `RegistrySnapshotPayloadSchema` (`@pops/pillar-sdk`) — the same zod
 *     schemas `normaliseSnapshotEntry` (`src/lib/registry-snapshot-fetch.ts`)
 *     validates a live snapshot against;
 *   - the shell manifest through a schema typed against the generated
 *     `ShellManifestResponses` (`src/registry-api/types.gen.ts`), which is
 *     itself regenerated from `@pops/registry`'s OpenAPI spec and diffed in
 *     CI (`generated-clients`, ADR-040) — a producer-side shape change is a
 *     compile error here before it is ever a runtime one;
 *   - the orchestrator search response through `parseSearchResponse`
 *     (`@pops/navigation`) — the literal function the search bar's own fetch
 *     runs the real response through.
 *
 * `/pillars` and `/pillars/health` carry no OpenAPI contract — they are the
 * informal boot projection `pillar-registry-client.ts` documents, not part of
 * any pillar's generated spec — so there is no existing schema to import.
 * Their validators below are hand-defined and pinned at the type level to the
 * same `PillarRegistryEntry` (`@pops/types`) and `PillarHealthStatus`
 * (`src/app/pillars/types.ts`) shapes that file's own parsers target, so a
 * change to either fails `tsc` here even though the runtime shape is
 * duplicated rather than imported.
 *
 * A stub that fails validation throws when the stub is set up (`stubX(page,
 * ...)`), before any route is registered or any request made — a spec sees a
 * synchronous, attributed error rather than a fallback-path pass or a hang
 * waiting on a route that never fulfils.
 */
import { z } from 'zod';

import { parseSearchResponse } from '@pops/navigation';
import { ManifestPayloadSchema, RegistrySnapshotPayloadSchema } from '@pops/pillar-sdk';

import type { Page, Route } from '@playwright/test';

import type { PillarRegistryEntry } from '@pops/types';

import type { ShellManifestResponses } from '../../src/registry-api/types.gen';

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
 * Parse `body` against `schema` and throw a message naming the stub and
 * every mismatched field when it does not match — never silently serve a
 * body the real client would reject.
 *
 * `schema` is untyped (`ZodTypeAny`) deliberately: several of the schemas
 * used below apply a `.transform()` (`RegistrySnapshotPayloadSchema`), whose
 * *output* type carries derived fields (`lastSeenAt`) the wire body never
 * has. Typing this against the schema's output would force every literal
 * body to fabricate those derived fields just to satisfy `tsc`, rather than
 * writing the wire shape the endpoint actually serves.
 */
function assertMatchesContract(schema: z.ZodTypeAny, body: unknown, label: string): void {
  const result = schema.safeParse(body);
  if (result.success) return;
  const issues = result.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`${label} stub no longer matches its contract:\n${issues}`);
}

/**
 * Validate `body` against `schema`, then return a `page.route` handler that
 * serves it. Validation runs immediately (not inside the returned handler),
 * so a drifted stub fails the moment the spec sets it up rather than when —
 * or if — the route is actually hit.
 */
function fulfilWith(status: number, schema: z.ZodTypeAny, body: unknown, label: string) {
  assertMatchesContract(schema, body, label);
  return (route: Route) => json(route, status, body);
}

/**
 * `/pillars` and `/pillars/health` shapes — see the file header for why
 * these are hand-defined rather than imported.
 */
const PillarBootEntrySchema: z.ZodType<PillarRegistryEntry> = z
  .object({
    id: z.string().min(1),
    baseUrl: z.string().min(1),
  })
  .strict();

const PillarBootResponseSchema = z.object({ pillars: z.array(PillarBootEntrySchema) }).strict();

/** Mirrors `PillarHealthStatus` (`src/app/pillars/types.ts`). */
const PillarHealthResponseSchema = z
  .object({
    health: z.record(z.string(), z.enum(['healthy', 'unavailable', 'unknown'])),
  })
  .strict();

/** The `/registry-api/shell/manifest` response — `ManifestSchema` in `@pops/registry`'s ts-rest contract. */
const ShellManifestResponseSchema: z.ZodType<ShellManifestResponses[200]> = z
  .object({
    apps: z.array(z.string()),
    overlays: z.array(z.string()),
  })
  .strict();

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
  const pillars = pillarIds.map((pillarId) => {
    const manifest = minimalManifest(pillarId);
    assertMatchesContract(ManifestPayloadSchema, manifest, `manifest (${pillarId})`);
    return {
      pillarId,
      baseUrl: `http://${pillarId}-api:3000`,
      manifest,
      capabilities: {},
      lastHeartbeatAt: new Date().toISOString(),
    };
  });
  const snapshotBody = { pillars };
  await page.route(
    REGISTRY_SNAPSHOT_URL,
    fulfilWith(200, RegistrySnapshotPayloadSchema, snapshotBody, 'registry snapshot')
  );

  const manifestBody = { apps: [...pillarIds], overlays: [] };
  await page.route(
    SHELL_MANIFEST_URL,
    fulfilWith(200, ShellManifestResponseSchema, manifestBody, 'shell manifest')
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
  const bootBody = { pillars: pillarIds.map((id) => ({ id, baseUrl: `http://${id}-api:3000` })) };
  await page.route(
    PILLAR_BOOT_URL,
    fulfilWith(200, PillarBootResponseSchema, bootBody, 'pillar boot')
  );

  const healthBody = { health: Object.fromEntries(pillarIds.map((id) => [id, 'healthy'])) };
  await page.route(
    PILLAR_HEALTH_URL,
    fulfilWith(200, PillarHealthResponseSchema, healthBody, 'pillar health')
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

/** The query text `CROSS_MODULE_SEARCH_SECTIONS` is written to answer. */
export const SEARCH_QUERY = 'matrix';

/**
 * One hit owned by `media` and one owned by `finance`, in the orchestrator's
 * wire shape.
 *
 * Shared rather than copied because the comparison between two specs is the
 * claim: the all-modules run asserts both sections reach the panel, and the
 * `POPS_APPS=finance,core` run asserts the same payload arrives with the media
 * section dropped. Two copies that drift are no longer the same payload, and
 * both specs go on passing while the thing they jointly proved quietly stops
 * being true.
 */
export const CROSS_MODULE_SEARCH_SECTIONS: readonly SearchSection[] = [
  {
    domain: 'movies',
    moduleId: 'media',
    hits: [{ uri: 'pops://media/movie/1', data: { title: 'The Matrix', year: 1999 } }],
  },
  {
    domain: 'transactions',
    moduleId: 'finance',
    hits: [
      {
        uri: 'pops://finance/transaction/1',
        data: {
          description: 'MATRIX CINEMA',
          amount: -24.5,
          date: '2026-02-13',
          entityName: 'Event Cinemas',
          type: 'purchase',
        },
      },
    ],
  },
];

/**
 * Answer `POST /orchestrator-api/search` with `sections`, regardless of query
 * text. The shell's own install-set filter still runs over the result, which
 * is what the finance-only spec asserts.
 */
export async function stubOrchestratorSearch(
  page: Page,
  sections: readonly SearchSection[]
): Promise<void> {
  const body = {
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
  };
  // `parseSearchResponse` is the literal function the search bar's own fetch
  // runs the real response through (`useSearchInputData.tsx`) — reused rather
  // than mirrored, so this stub is exercised by the same guard, not a second
  // one that only proves it agrees with itself. It throws on mismatch.
  parseSearchResponse(body);
  await page.route(ORCHESTRATOR_SEARCH_URL, (route) => json(route, 200, body));
}
