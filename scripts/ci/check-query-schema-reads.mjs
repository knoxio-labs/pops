#!/usr/bin/env node
/**
 * Unread query-schema field guard (POPS-2379).
 *
 * A ts-rest route publishes a query shape — GET query-string parameters, or
 * (for `POST /search`) a `query` object nested in the request body — and its
 * handler reads that shape by hand rather than through anything ts-rest
 * itself checks. Nothing stops the two from disagreeing: a caller sends a
 * field the contract advertises, the schema validates it, and the handler
 * drops it on the floor. The response is a confident 200 computed as though
 * the field had never been sent, which is worse than a 400 — a caller who
 * filtered by merchant and got the unfiltered total has no way to tell that
 * from a filter that matched broadly.
 *
 * This has happened twice in `pillars/purchases`, and the second time is why
 * this guard is static rather than "add a test": `POST /search` (POPS-1966)
 * dropped `query.filters` because the handler forwarded only `query.text`.
 * `GET /analytics/product-leaderboard` (POPS-1849, PR #4183) inherited
 * `currency`/`merchantEntityId`/`merchantEntityName`/`merchantUnattributed`
 * through `ProductLeaderboardQuerySchema extends MerchantSpendQuerySchema`
 * when POPS-2054 added those fields to the shared schema — a schema change in
 * one PR silently widening what an UNRELATED route, in a THIRD PR, was
 * already advertising. Neither PR was individually wrong; the merge was. The
 * full purchases suite, typecheck, oxfmt and the OpenAPI/vendored-contract
 * drift gates were all green on the merged result. A merge that changes no
 * line of the handler can still break its contract with the wire, which is
 * exactly the shape nothing else in this repo's CI catches.
 *
 * THE RULE. For each route in {@link ROUTES}: every key of the query schema
 * the OpenAPI projection publishes for it must be READ — as a property access
 * (`query.field`) or a destructured binding (`{ field } = query`) — off the
 * SPECIFIC binding that carries that route's query object: `query` in the
 * handler's own entry (`body.query` for the `POST /search` body-nested
 * shape), or, in a module the handler calls with the bare expression `query`
 * as an argument (a "resolver"), whatever that resolver's OWN parameter is
 * actually named in its signature — read from the signature, not assumed.
 * Following is transitive (a resolver that itself calls a further resolver
 * with its own parameter is followed too — this is how `resolvePurchaseScope`
 * calling `resolveMerchantFilter` is covered without every merchant field
 * having to be read in the handler body itself). A read anchored to any OTHER
 * binding never counts, however it is spelled — `Array.from(rows)` is not a
 * read of a `from` query field, and a resolver reading `other.field` on some
 * unrelated object is not a read either. A field with no anchored read is a
 * violation unless {@link ALLOWLIST} names it with a reason.
 *
 * WHY OPENAPI JSON, NOT A REGEX OVER THE ZOD SCHEMA SOURCE. `generateOpenApi`
 * already resolves `.extend`/`.omit`/`.pick`/`.merge` into a flat property
 * list — that resolution is exactly the hard part POPS-1849 fell into, and
 * re-deriving it by parsing TypeScript would be re-implementing zod's own
 * chain resolution rather than trusting the artifact this pillar already
 * generates from it. Reading the committed
 * `pillars/purchases/openapi/purchases.openapi.json` needs no zod import and
 * no build step, which keeps this guard Tier A (JSON only, no third-party
 * import at any depth). Its accuracy rides on `check-openapi-drift.mjs`
 * (quality.yml → `openapi-drift`) keeping that file honest against the
 * contract source; if that guard's own matcher went blind, a field could
 * lose coverage here too without either guard saying why.
 *
 * WHAT IT DOES NOT SEE.
 *
 *   - Scope: {@link PILLARS} lists every pillar this guard currently
 *     enforces — purchases, finance, cerebrum, bfm, media, food, lists,
 *     inventory. Each pillar declares its own openapi file, its own
 *     hand-curated `{ handlerFile, handlerKey }` routes (the traversal
 *     algorithm below is shared and pillar-agnostic; only these roots
 *     differ), its own allowlist, and its own discovery floor.
 *       - Resolver-following recognises the anchor at ANY positional
 *         argument of a call, bare or namespace-qualified —
 *         {@link findAnchorCallSites} matches `resolver(query)`,
 *         `resolver(db, query)`, and `ns.method(db, query)` alike, which is
 *         how media, food and lists' delegation to a shared db-service
 *         function called as `someService.method(db, query)` is followed.
 *         {@link resolveNamespaceExportFile} finds a namespace's own module
 *         by following `export * as <name> from` (and, where a pillar
 *         splits a barrel one level deeper, transitively through bare
 *         `export * from` re-exports) rather than assuming the namespace
 *         object is declared in the file that imports it.
 *       - inventory's routes, including `POST /search`, all read their
 *         query fields directly off the handler's own anchor, same as
 *         purchases — no namespace or positional-argument traversal is
 *         needed for this pillar to report clean.
 *       - contacts publishes no ts-rest contract at all (Rust, a different
 *         wire-schema mechanism entirely) — out of scope on its face.
 *       - ai, registry and documents are not in {@link PILLARS} and are not
 *         surveyed here.
 *   - A field is only "seen read" through a resolver call whose OWN argument
 *     list carries the anchor bare — `resolver(query)`, `resolver(db, query)`,
 *     `ns.method(db, query)` — never an expression merely built FROM it
 *     (`resolve({ sources: query.sources })`) or a spread (`{ ...query }`).
 *     A handler that destructures individual fields out before calling a
 *     resolver, or spreads the object, is not followed into that resolver;
 *     the guard would then report those fields as unread even if the
 *     resolver reads them. Every resolver call across every pillar in
 *     {@link PILLARS} today passes the whole object as one argument, so this
 *     has not been a false positive in practice, but it is a real limit of
 *     the heuristic — the fix in that case is to read the field directly in
 *     the handler rather than to fight the checker.
 *   - Once a resolver IS followed, its own reads are anchored to its own
 *     declared parameter AT THE SAME POSITION the call passed the anchor in
 *     — parsed from its `function name(...params) { … }` signature by
 *     splitting that parameter list on top-level commas
 *     ({@link splitTopLevelCommaList}) and taking the one at the matching
 *     index, not assumed to be the first or only one. A simple identifier
 *     (`query`, `input`, `db`, anything) anchors member access and
 *     destructuring inside its body to that name; a destructured parameter
 *     (`function name({ from, to })`) is read as equivalent to destructuring
 *     those fields off the call's own argument directly, with no need to
 *     also read them again in the resolver body. A resolver whose matched
 *     parameter cannot be parsed this way (a nested pattern, a rest element,
 *     anything beyond a flat identifier or a flat destructure) is not
 *     followed past that point — conservative in the same direction as
 *     every other gap in this list: a field could be reported as unread when
 *     the resolver does read it, never the reverse.
 *   - Anchoring is per-scope, not global: the handler's own binding for its
 *     entry, each followed resolver's own parameter for its own body. A field
 *     name that merely APPEARS somewhere in reachable text — an unrelated
 *     `.field` access on some other object, an unrelated destructuring, a
 *     method of the same name (`Array.from`) — is never mistaken for a read
 *     of the query field, because the read must chain off the one binding
 *     that scope actually received the query data through.
 *   - Only relative (`./`, `../`) imports are followed into a resolver, or
 *     into a namespace's own `export * as`/`export *` chain. A resolver, or
 *     a namespace's home module, reached only through a workspace package
 *     specifier (`@pops/...`) is invisible to the traversal — no pillar in
 *     {@link PILLARS} does this today.
 *   - One handler-object literal per file, found as the `return { … }` inside
 *     the file's own `function make*Handlers(…) { … }` factory — plain helper
 *     functions defined elsewhere in the file (`notFound`, `itemNotFound`, …)
 *     are not searched, even if they have their own unrelated `return { … }`.
 *     A module with more than one exported factory, or one whose returned
 *     object is built some other way (spread from a second object, computed
 *     keys), is not read correctly; every purchases handler file follows the
 *     single-factory, literal-keys shape this guard expects.
 *
 * Usage:
 *   node scripts/ci/check-query-schema-reads.mjs
 *   node scripts/ci/check-query-schema-reads.mjs --self-test
 *   node scripts/ci/check-query-schema-reads.mjs --help
 *
 * Exit 0 = every query field on every known route is read (directly or
 * through a followed resolver) or is named in `ALLOWLIST` with a reason.
 * Exit 1 = an unread field, a malformed allowlist entry, a route this guard
 * cannot parse, a route the OpenAPI file advertises that `ROUTES` does not
 * cover, or a `ROUTES` entry that no longer matches anything. Exit 2 = usage
 * error.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripComments } from './import-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Repo-relative, posix. The committed OpenAPI projection of the purchases contract. */
export const OPENAPI_REL_PATH = 'pillars/purchases/openapi/purchases.openapi.json';

/**
 * `discoveredRoutesWithFields` below must find at least this many routes —
 * today's real count is 8. A drop under the floor means the OpenAPI file
 * moved, is stale, or the field-derivation logic broke; either way it is a
 * finding, not a quieter guard.
 */
const MIN_ROUTES_WITH_FIELDS = 6;

/**
 * @typedef {object} RouteSpec
 * @property {string} method     lowercase HTTP method, as spelled in the OpenAPI `paths` map.
 * @property {string} path       as spelled in the OpenAPI `paths` map (e.g. `/analytics/merchant-spend`).
 * @property {string} handlerFile Repo-relative path to the module implementing this route's handler.
 * @property {string} handlerKey  The property name of this route inside that module's returned handler object.
 */

/** @type {RouteSpec[]} */
export const ROUTES = [
  {
    method: 'get',
    path: '/analytics/merchant-spend',
    handlerFile: 'pillars/purchases/src/api/rest/analytics-handlers.ts',
    handlerKey: 'merchantSpend',
  },
  {
    method: 'get',
    path: '/analytics/product-leaderboard',
    handlerFile: 'pillars/purchases/src/api/rest/analytics-handlers.ts',
    handlerKey: 'productLeaderboard',
  },
  {
    method: 'get',
    path: '/items',
    handlerFile: 'pillars/purchases/src/api/rest/purchase-handlers.ts',
    handlerKey: 'itemsByTag',
  },
  {
    method: 'get',
    path: '/products',
    handlerFile: 'pillars/purchases/src/api/rest/product-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/purchases',
    handlerFile: 'pillars/purchases/src/api/rest/purchase-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/reconcile/links',
    handlerFile: 'pillars/purchases/src/api/rest/reconcile-handlers.ts',
    handlerKey: 'links',
  },
  {
    method: 'get',
    path: '/reconcile/queue',
    handlerFile: 'pillars/purchases/src/api/rest/reconcile-handlers.ts',
    handlerKey: 'queue',
  },
  {
    method: 'post',
    path: '/search',
    handlerFile: 'pillars/purchases/src/api/rest/search-handlers.ts',
    handlerKey: 'search',
  },
];

/**
 * @typedef {object} AllowlistEntry
 * @property {string} method
 * @property {string} path
 * @property {string} field
 * @property {string} reason Why this field is deliberately unread. Never empty.
 */

/**
 * Deliberate omissions, recorded rather than silent. Empty today: every field
 * on every known purchases route is read. `--self-test` proves an entry
 * without a `reason` is itself reported as a violation, so this cannot become
 * a silent blanket exemption later.
 *
 * @type {AllowlistEntry[]}
 */
export const ALLOWLIST = [];

/** Repo-relative, posix. The committed OpenAPI projection of the finance contract. */
export const FINANCE_OPENAPI_REL_PATH = 'pillars/finance/openapi/finance.openapi.json';

/** Today's real count of finance routes carrying query fields is 16. See {@link MIN_ROUTES_WITH_FIELDS}. */
const FINANCE_MIN_ROUTES_WITH_FIELDS = 12;

/**
 * Finance's handler layout matches purchases': one `make*Handlers` factory
 * per file (`loan-handlers.ts` composes its export from two PRIVATE ones in
 * the same file, which {@link extractHandlerEntryText} tries in turn), every
 * query field read directly off `query` (or `body.query` for `POST /search`)
 * in the handler's own body or a resolver it calls with the whole object.
 * Confirmed clean today: every field on every route below is read.
 *
 * @type {RouteSpec[]}
 */
export const FINANCE_ROUTES = [
  {
    method: 'get',
    path: '/accounts',
    handlerFile: 'pillars/finance/src/api/rest/accounts-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/accounts/{id}/balance',
    handlerFile: 'pillars/finance/src/api/rest/checkpoints-handlers.ts',
    handlerKey: 'balance',
  },
  {
    method: 'get',
    path: '/accounts/{id}/balance-history',
    handlerFile: 'pillars/finance/src/api/rest/checkpoints-handlers.ts',
    handlerKey: 'history',
  },
  {
    method: 'get',
    path: '/accounts/{id}/imports',
    handlerFile: 'pillars/finance/src/api/rest/account-imports-handlers.ts',
    handlerKey: 'listBatches',
  },
  {
    method: 'get',
    path: '/accounts/{id}/loan-offset-links',
    handlerFile: 'pillars/finance/src/api/rest/loan-handlers.ts',
    handlerKey: 'listOffsetLinks',
  },
  {
    method: 'get',
    path: '/budgets',
    handlerFile: 'pillars/finance/src/api/rest/budgets-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/corrections',
    handlerFile: 'pillars/finance/src/api/rest/corrections-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/entity-usage',
    handlerFile: 'pillars/finance/src/api/rest/entity-usage-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/import-drafts',
    handlerFile: 'pillars/finance/src/api/rest/import-drafts-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/imports/progress',
    handlerFile: 'pillars/finance/src/api/rest/imports-handlers.ts',
    handlerKey: 'getImportProgress',
  },
  {
    method: 'post',
    path: '/search',
    handlerFile: 'pillars/finance/src/api/rest/search-handlers.ts',
    handlerKey: 'search',
  },
  {
    method: 'get',
    path: '/tag-rules',
    handlerFile: 'pillars/finance/src/api/rest/tag-rules-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/transactions',
    handlerFile: 'pillars/finance/src/api/rest/transactions-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/transactions/descriptions-preview',
    handlerFile: 'pillars/finance/src/api/rest/transactions-handlers.ts',
    handlerKey: 'descriptionsForPreview',
  },
  {
    method: 'get',
    path: '/transactions/suggest-tags',
    handlerFile: 'pillars/finance/src/api/rest/transactions-handlers.ts',
    handlerKey: 'suggestTags',
  },
  {
    method: 'get',
    path: '/wishlist',
    handlerFile: 'pillars/finance/src/api/rest/wishlist-handlers.ts',
    handlerKey: 'list',
  },
];

/** Empty today: every field on every known finance route is read. @type {AllowlistEntry[]} */
export const FINANCE_ALLOWLIST = [];

/** Repo-relative, posix. The committed OpenAPI projection of the cerebrum contract. */
export const CEREBRUM_OPENAPI_REL_PATH = 'pillars/cerebrum/openapi/cerebrum.openapi.json';

/** Today's real count of cerebrum routes carrying query fields is 4. See {@link MIN_ROUTES_WITH_FIELDS}. */
const CEREBRUM_MIN_ROUTES_WITH_FIELDS = 3;

/**
 * Cerebrum's leaf handler factories call `initServer().router(contract, { …
 * })` themselves — every OTHER surveyed pillar does that composition only
 * once, in its own top-level `handlers.ts` — so a factory's own handler map
 * is the LAST top-level object-literal argument of that call rather than a
 * bare `return { … }` (see {@link locateReturnedHandlersObject}). Otherwise
 * matches purchases' shape: fields read directly off `query` in the handler
 * body. Confirmed clean today.
 *
 * @type {RouteSpec[]}
 */
export const CEREBRUM_ROUTES = [
  {
    method: 'get',
    path: '/glia/orphans',
    handlerFile: 'pillars/cerebrum/src/api/rest/workers-handlers.ts',
    handlerKey: 'getOrphans',
  },
  {
    method: 'get',
    path: '/reflex',
    handlerFile: 'pillars/cerebrum/src/api/rest/reflex-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/scopes',
    handlerFile: 'pillars/cerebrum/src/api/rest/scopes-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/tags',
    handlerFile: 'pillars/cerebrum/src/api/rest/tags-handlers.ts',
    handlerKey: 'list',
  },
];

/** Empty today: every field on every known cerebrum route is read. @type {AllowlistEntry[]} */
export const CEREBRUM_ALLOWLIST = [];

/** Repo-relative, posix. The committed OpenAPI projection of the bfm contract. */
export const BFM_OPENAPI_REL_PATH = 'pillars/bfm/openapi/bfm.openapi.json';

/**
 * Only 2 routes carry query fields today — below every other pillar's floor,
 * but bfm's mobile surface is deliberately thin (POPS-1369): a device-gated
 * passthrough onto finance/purchases, not a domain of its own. The floor
 * still catches a collapse to 0.
 */
const BFM_MIN_ROUTES_WITH_FIELDS = 2;

/**
 * bfm's two mobile handler files each hold one `make*Handlers` factory
 * returning a flat, literal-keyed object — matches purchases' shape exactly,
 * fields read directly off `query`. Confirmed clean today.
 *
 * @type {RouteSpec[]}
 */
export const BFM_ROUTES = [
  {
    method: 'get',
    path: '/mobile/finance/transactions',
    handlerFile: 'pillars/bfm/src/api/rest/mobile-finance-handlers.ts',
    handlerKey: 'listTransactions',
  },
  {
    method: 'get',
    path: '/mobile/purchases',
    handlerFile: 'pillars/bfm/src/api/rest/mobile-purchases-handlers.ts',
    handlerKey: 'listPurchases',
  },
];

/** Empty today: every field on every known bfm route is read. @type {AllowlistEntry[]} */
export const BFM_ALLOWLIST = [];

/** Repo-relative, posix. The committed OpenAPI projection of the media contract. */
export const MEDIA_OPENAPI_REL_PATH = 'pillars/media/openapi/media.openapi.json';

/** Today's real count of media routes carrying query fields is 32. See {@link MIN_ROUTES_WITH_FIELDS}. */
const MEDIA_MIN_ROUTES_WITH_FIELDS = 24;

/**
 * Media's handler layout matches purchases' in shape (one `make*Handlers`
 * factory per file, fields read directly off `query`), with a real minority
 * that delegate the WHOLE query object one level down through a property
 * access on an imported db-service namespace object — `libraryService.
 * listLibrary(db, query)` (`GET /library`), `rotationCandidatesService.
 * listCandidates(db, query)` (`GET /rotation/candidates`),
 * `rotationExclusionsService.listExclusions(db, query)` (`GET
 * /rotation/exclusions`) — exactly the shape
 * {@link findAnchorCallSites} / {@link resolveNamespaceExportFile} follow.
 * Confirmed clean today.
 *
 * @type {RouteSpec[]}
 */
export const MEDIA_ROUTES = [
  {
    method: 'get',
    path: '/arr/sonarr/calendar',
    handlerFile: 'pillars/media/src/api/rest/arr-sonarr-handlers.ts',
    handlerKey: 'getCalendar',
  },
  {
    method: 'get',
    path: '/arr/sonarr/series/{sonarrId}/episodes',
    handlerFile: 'pillars/media/src/api/rest/arr-sonarr-handlers.ts',
    handlerKey: 'getSeriesEpisodes',
  },
  {
    method: 'get',
    path: '/comparison-rankings',
    handlerFile: 'pillars/media/src/api/rest/comparisons-scores-handlers.ts',
    handlerKey: 'rankings',
  },
  {
    method: 'get',
    path: '/comparison-scores',
    handlerFile: 'pillars/media/src/api/rest/comparisons-scores-handlers.ts',
    handlerKey: 'scores',
  },
  {
    method: 'get',
    path: '/comparison-staleness',
    handlerFile: 'pillars/media/src/api/rest/comparisons-scores-handlers.ts',
    handlerKey: 'getStaleness',
  },
  {
    method: 'get',
    path: '/comparisons/for-media',
    handlerFile: 'pillars/media/src/api/rest/comparisons-handlers.ts',
    handlerKey: 'listForMedia',
  },
  {
    method: 'get',
    path: '/comparisons/smart-pair',
    handlerFile: 'pillars/media/src/api/rest/comparisons-handlers.ts',
    handlerKey: 'getSmartPair',
  },
  {
    method: 'get',
    path: '/comparisons',
    handlerFile: 'pillars/media/src/api/rest/comparisons-handlers.ts',
    handlerKey: 'listAll',
  },
  {
    method: 'get',
    path: '/discovery/context-picks',
    handlerFile: 'pillars/media/src/api/rest/discovery-handlers.ts',
    handlerKey: 'contextPicks',
  },
  {
    method: 'get',
    path: '/discovery/genre-spotlight/page',
    handlerFile: 'pillars/media/src/api/rest/discovery-handlers.ts',
    handlerKey: 'genreSpotlightPage',
  },
  {
    method: 'get',
    path: '/discovery/quick-pick',
    handlerFile: 'pillars/media/src/api/rest/discovery-handlers.ts',
    handlerKey: 'quickPick',
  },
  {
    method: 'get',
    path: '/discovery/recommendations',
    handlerFile: 'pillars/media/src/api/rest/discovery-handlers.ts',
    handlerKey: 'recommendations',
  },
  {
    method: 'get',
    path: '/discovery/shelves/{shelfId}',
    handlerFile: 'pillars/media/src/api/rest/discovery-handlers.ts',
    handlerKey: 'getShelfPage',
  },
  {
    method: 'get',
    path: '/discovery/trending-plex',
    handlerFile: 'pillars/media/src/api/rest/discovery-handlers.ts',
    handlerKey: 'trendingPlex',
  },
  {
    method: 'get',
    path: '/discovery/trending',
    handlerFile: 'pillars/media/src/api/rest/discovery-handlers.ts',
    handlerKey: 'trending',
  },
  {
    method: 'get',
    path: '/library/quick-pick',
    handlerFile: 'pillars/media/src/api/rest/library-handlers.ts',
    handlerKey: 'quickPick',
  },
  {
    method: 'get',
    path: '/library',
    handlerFile: 'pillars/media/src/api/rest/library-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/movies',
    handlerFile: 'pillars/media/src/api/rest/movies-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/plex/scheduler/sync-logs',
    handlerFile: 'pillars/media/src/api/rest/plex-scheduler-handlers.ts',
    handlerKey: 'getSyncLogs',
  },
  {
    method: 'get',
    path: '/rotation/candidates',
    handlerFile: 'pillars/media/src/api/rest/rotation-candidate-handlers.ts',
    handlerKey: 'listCandidates',
  },
  {
    method: 'get',
    path: '/rotation/exclusions',
    handlerFile: 'pillars/media/src/api/rest/rotation-candidate-handlers.ts',
    handlerKey: 'listExclusions',
  },
  {
    method: 'get',
    path: '/rotation/scheduler/log',
    handlerFile: 'pillars/media/src/api/rest/rotation-scheduler-handlers.ts',
    handlerKey: 'listRotationLog',
  },
  {
    method: 'get',
    path: '/rotation/scheduler/removal-preview',
    handlerFile: 'pillars/media/src/api/rest/rotation-scheduler-handlers.ts',
    handlerKey: 'schedulerRemovalPreview',
  },
  {
    method: 'get',
    path: '/search/movies',
    handlerFile: 'pillars/media/src/api/rest/search-handlers.ts',
    handlerKey: 'movies',
  },
  {
    method: 'get',
    path: '/search/tv-shows',
    handlerFile: 'pillars/media/src/api/rest/search-handlers.ts',
    handlerKey: 'tvShows',
  },
  {
    method: 'get',
    path: '/shelf-impressions/freshness',
    handlerFile: 'pillars/media/src/api/rest/shelf-impressions-handlers.ts',
    handlerKey: 'freshness',
  },
  {
    method: 'get',
    path: '/shelf-impressions/recent',
    handlerFile: 'pillars/media/src/api/rest/shelf-impressions-handlers.ts',
    handlerKey: 'recent',
  },
  {
    method: 'get',
    path: '/tv-shows',
    handlerFile: 'pillars/media/src/api/rest/tv-shows-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/watch-history/recent',
    handlerFile: 'pillars/media/src/api/rest/watch-history-handlers.ts',
    handlerKey: 'listRecent',
  },
  {
    method: 'get',
    path: '/watch-history',
    handlerFile: 'pillars/media/src/api/rest/watch-history-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/watchlist/status',
    handlerFile: 'pillars/media/src/api/rest/watchlist-handlers.ts',
    handlerKey: 'status',
  },
  {
    method: 'get',
    path: '/watchlist',
    handlerFile: 'pillars/media/src/api/rest/watchlist-handlers.ts',
    handlerKey: 'list',
  },
];

/** Empty today: every field on every known media route is read. @type {AllowlistEntry[]} */
export const MEDIA_ALLOWLIST = [];

/** Repo-relative, posix. The committed OpenAPI projection of the food contract. */
export const FOOD_OPENAPI_REL_PATH = 'pillars/food/openapi/food.openapi.json';

/** Today's real count of food routes carrying query fields is 19. See {@link MIN_ROUTES_WITH_FIELDS}. */
const FOOD_MIN_ROUTES_WITH_FIELDS = 14;

/**
 * Food's handler layout matches purchases' in shape, with two real
 * delegation patterns: a plain (non-namespace) resolver called with `query`
 * at a NON-FIRST positional argument (`resolveForLine(db, query)`, `GET
 * /substitutions/resolve-line` — which itself forwards its own second
 * parameter on to a further resolver, `loadLine(db, args)`, two levels
 * deep), and a namespace-qualified call with `query` as the second of two
 * arguments (`substitutionsQueries.listSubstitutions(db, query)`,
 * `substitutionsHydrate.listSubstitutionsHydrated(db, query)`,
 * `substitutionsGraph.loadGraphView(db, query)`). Confirmed clean today.
 *
 * @type {RouteSpec[]}
 */
export const FOOD_ROUTES = [
  {
    method: 'get',
    path: '/aliases/with-targets',
    handlerFile: 'pillars/food/src/api/rest/aliases-handlers.ts',
    handlerKey: 'listWithTargets',
  },
  {
    method: 'get',
    path: '/aliases',
    handlerFile: 'pillars/food/src/api/rest/aliases-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/conversions/resolve',
    handlerFile: 'pillars/food/src/api/rest/conversions-handlers.ts',
    handlerKey: 'resolve',
  },
  {
    method: 'get',
    path: '/conversions/units',
    handlerFile: 'pillars/food/src/api/rest/conversions-handlers.ts',
    handlerKey: 'listUnits',
  },
  {
    method: 'get',
    path: '/conversions/weights',
    handlerFile: 'pillars/food/src/api/rest/conversions-handlers.ts',
    handlerKey: 'listWeights',
  },
  {
    method: 'get',
    path: '/fridge/recipes-using-batch',
    handlerFile: 'pillars/food/src/api/rest/fridge-handlers.ts',
    handlerKey: 'recipesUsingBatch',
  },
  {
    method: 'get',
    path: '/inbox/review',
    handlerFile: 'pillars/food/src/api/rest/inbox-handlers.ts',
    handlerKey: 'getForReview',
  },
  {
    method: 'get',
    path: '/ingredient-tags/by-tag',
    handlerFile: 'pillars/food/src/api/rest/ingredient-tags-handlers.ts',
    handlerKey: 'byTag',
  },
  {
    method: 'get',
    path: '/ingredient-tags/distinct',
    handlerFile: 'pillars/food/src/api/rest/ingredient-tags-handlers.ts',
    handlerKey: 'distinct',
  },
  {
    method: 'get',
    path: '/ingredient-tags',
    handlerFile: 'pillars/food/src/api/rest/ingredient-tags-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/ingredients',
    handlerFile: 'pillars/food/src/api/rest/ingredients-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/plan/week',
    handlerFile: 'pillars/food/src/api/rest/plan-handlers.ts',
    handlerKey: 'weekView',
  },
  {
    method: 'get',
    path: '/recipes/{slug}',
    handlerFile: 'pillars/food/src/api/rest/recipes-handlers.ts',
    handlerKey: 'getForRendering',
  },
  {
    method: 'get',
    path: '/recipes/versions/{versionId}/send-to-list/preview',
    handlerFile: 'pillars/food/src/api/rest/send-to-list-handlers.ts',
    handlerKey: 'prepare',
  },
  {
    method: 'get',
    path: '/slugs/search',
    handlerFile: 'pillars/food/src/api/rest/slugs-handlers.ts',
    handlerKey: 'search',
  },
  {
    method: 'get',
    path: '/substitutions/graph-view',
    handlerFile: 'pillars/food/src/api/rest/substitutions-handlers.ts',
    handlerKey: 'graphView',
  },
  {
    method: 'get',
    path: '/substitutions/hydrated',
    handlerFile: 'pillars/food/src/api/rest/substitutions-handlers.ts',
    handlerKey: 'listHydrated',
  },
  {
    method: 'get',
    path: '/substitutions/resolve-line',
    handlerFile: 'pillars/food/src/api/rest/substitutions-handlers.ts',
    handlerKey: 'resolveForLine',
  },
  {
    method: 'get',
    path: '/substitutions',
    handlerFile: 'pillars/food/src/api/rest/substitutions-handlers.ts',
    handlerKey: 'list',
  },
];

/** Empty today: every field on every known food route is read. @type {AllowlistEntry[]} */
export const FOOD_ALLOWLIST = [];

/** Repo-relative, posix. The committed OpenAPI projection of the lists contract. */
export const LISTS_OPENAPI_REL_PATH = 'pillars/lists/openapi/lists.openapi.json';

/** Today's real count of lists routes carrying query fields is 2 — below every other pillar's floor, but lists' own REST surface is small; the floor still catches a collapse to 0. */
const LISTS_MIN_ROUTES_WITH_FIELDS = 2;

/**
 * Lists' `GET /items` delegates the whole query object to a plain
 * (non-namespace) function at a non-first positional argument —
 * `searchListItems(db, query)` — the same generalisation food's
 * `resolveForLine` needed. `GET /lists` reads every field directly off
 * `query`. Confirmed clean today.
 *
 * @type {RouteSpec[]}
 */
export const LISTS_ROUTES = [
  {
    method: 'get',
    path: '/items',
    handlerFile: 'pillars/lists/src/api/rest/items-handlers.ts',
    handlerKey: 'search',
  },
  {
    method: 'get',
    path: '/lists',
    handlerFile: 'pillars/lists/src/api/rest/list-handlers.ts',
    handlerKey: 'listAggregate',
  },
];

/** Empty today: every field on every known lists route is read. @type {AllowlistEntry[]} */
export const LISTS_ALLOWLIST = [];

/** Repo-relative, posix. The committed OpenAPI projection of the inventory contract. */
export const INVENTORY_OPENAPI_REL_PATH = 'pillars/inventory/openapi/inventory.openapi.json';

/** Today's real count of inventory routes carrying query fields is 16. See {@link MIN_ROUTES_WITH_FIELDS}. */
const INVENTORY_MIN_ROUTES_WITH_FIELDS = 12;

/**
 * Inventory's handler layout matches purchases' shape exactly — every field
 * on every route, including `POST /search`'s `body.query.filters` and
 * `body.query.text`, is read directly off its anchor in the handler body.
 * No traversal change is needed for this pillar to report clean.
 *
 * @type {RouteSpec[]}
 */
export const INVENTORY_ROUTES = [
  {
    method: 'delete',
    path: '/connections',
    handlerFile: 'pillars/inventory/src/api/rest/connections-handlers.ts',
    handlerKey: 'disconnect',
  },
  {
    method: 'get',
    path: '/fixtures',
    handlerFile: 'pillars/inventory/src/api/rest/fixtures-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'get',
    path: '/items/{itemId}/connections/graph',
    handlerFile: 'pillars/inventory/src/api/rest/connections-handlers.ts',
    handlerKey: 'graph',
  },
  {
    method: 'get',
    path: '/items/{itemId}/connections/trace',
    handlerFile: 'pillars/inventory/src/api/rest/connections-handlers.ts',
    handlerKey: 'trace',
  },
  {
    method: 'get',
    path: '/items/{itemId}/connections',
    handlerFile: 'pillars/inventory/src/api/rest/connections-handlers.ts',
    handlerKey: 'listForItem',
  },
  {
    method: 'get',
    path: '/items/{itemId}/documents',
    handlerFile: 'pillars/inventory/src/api/rest/documents-handlers.ts',
    handlerKey: 'listForItem',
  },
  {
    method: 'get',
    path: '/items/{itemId}/fixtures',
    handlerFile: 'pillars/inventory/src/api/rest/fixtures-handlers.ts',
    handlerKey: 'listForItem',
  },
  {
    method: 'get',
    path: '/items/{itemId}/photos',
    handlerFile: 'pillars/inventory/src/api/rest/photos-handlers.ts',
    handlerKey: 'listForItem',
  },
  {
    method: 'get',
    path: '/items/{itemId}/uploads',
    handlerFile: 'pillars/inventory/src/api/rest/document-files-handlers.ts',
    handlerKey: 'listForItem',
  },
  {
    method: 'get',
    path: '/items/search/by-asset-id',
    handlerFile: 'pillars/inventory/src/api/rest/items-handlers.ts',
    handlerKey: 'searchByAssetId',
  },
  {
    method: 'get',
    path: '/items/stats/count-by-asset-prefix',
    handlerFile: 'pillars/inventory/src/api/rest/items-handlers.ts',
    handlerKey: 'countByAssetPrefix',
  },
  {
    method: 'get',
    path: '/items',
    handlerFile: 'pillars/inventory/src/api/rest/items-handlers.ts',
    handlerKey: 'list',
  },
  {
    method: 'delete',
    path: '/locations/{id}',
    handlerFile: 'pillars/inventory/src/api/rest/locations-handlers.ts',
    handlerKey: 'delete',
  },
  {
    method: 'get',
    path: '/paperless/search',
    handlerFile: 'pillars/inventory/src/api/rest/paperless-handlers.ts',
    handlerKey: 'search',
  },
  {
    method: 'get',
    path: '/reports/insurance',
    handlerFile: 'pillars/inventory/src/api/rest/reports-handlers.ts',
    handlerKey: 'insuranceReport',
  },
  {
    method: 'post',
    path: '/search',
    handlerFile: 'pillars/inventory/src/api/rest/search-handlers.ts',
    handlerKey: 'search',
  },
];

/** Empty today: every field on every known inventory route is read. @type {AllowlistEntry[]} */
export const INVENTORY_ALLOWLIST = [];

/**
 * @typedef {object} PillarSpec
 * @property {string} name
 * @property {string} openapiRelPath
 * @property {readonly RouteSpec[]} routes
 * @property {readonly AllowlistEntry[]} allowlist
 * @property {number} minRoutesWithFields
 */

/**
 * Every pillar this guard currently enforces. Declared as a list of roots
 * (openapi file + routes + allowlist + floor) rather than one hand-rolled
 * `collectViolations` call per pillar — the traversal algorithm itself
 * (`extractHandlerEntryText`, `collectReachableTexts`, `fieldIsRead`, …) is
 * shared and pillar-agnostic; only these roots differ.
 *
 * media, food, lists and inventory all publish ts-rest query schemas and
 * report clean under the traversal described in the header's "WHAT IT DOES
 * NOT SEE" section — the namespace/positional-argument delegation each of
 * them relies on somewhere is exactly what that traversal follows.
 *
 * @type {PillarSpec[]}
 */
export const PILLARS = [
  {
    name: 'purchases',
    openapiRelPath: OPENAPI_REL_PATH,
    routes: ROUTES,
    allowlist: ALLOWLIST,
    minRoutesWithFields: MIN_ROUTES_WITH_FIELDS,
  },
  {
    name: 'finance',
    openapiRelPath: FINANCE_OPENAPI_REL_PATH,
    routes: FINANCE_ROUTES,
    allowlist: FINANCE_ALLOWLIST,
    minRoutesWithFields: FINANCE_MIN_ROUTES_WITH_FIELDS,
  },
  {
    name: 'cerebrum',
    openapiRelPath: CEREBRUM_OPENAPI_REL_PATH,
    routes: CEREBRUM_ROUTES,
    allowlist: CEREBRUM_ALLOWLIST,
    minRoutesWithFields: CEREBRUM_MIN_ROUTES_WITH_FIELDS,
  },
  {
    name: 'bfm',
    openapiRelPath: BFM_OPENAPI_REL_PATH,
    routes: BFM_ROUTES,
    allowlist: BFM_ALLOWLIST,
    minRoutesWithFields: BFM_MIN_ROUTES_WITH_FIELDS,
  },
  {
    name: 'media',
    openapiRelPath: MEDIA_OPENAPI_REL_PATH,
    routes: MEDIA_ROUTES,
    allowlist: MEDIA_ALLOWLIST,
    minRoutesWithFields: MEDIA_MIN_ROUTES_WITH_FIELDS,
  },
  {
    name: 'food',
    openapiRelPath: FOOD_OPENAPI_REL_PATH,
    routes: FOOD_ROUTES,
    allowlist: FOOD_ALLOWLIST,
    minRoutesWithFields: FOOD_MIN_ROUTES_WITH_FIELDS,
  },
  {
    name: 'lists',
    openapiRelPath: LISTS_OPENAPI_REL_PATH,
    routes: LISTS_ROUTES,
    allowlist: LISTS_ALLOWLIST,
    minRoutesWithFields: LISTS_MIN_ROUTES_WITH_FIELDS,
  },
  {
    name: 'inventory',
    openapiRelPath: INVENTORY_OPENAPI_REL_PATH,
    routes: INVENTORY_ROUTES,
    allowlist: INVENTORY_ALLOWLIST,
    minRoutesWithFields: INVENTORY_MIN_ROUTES_WITH_FIELDS,
  },
];

/** @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** @param {string} path @returns {string | null} */
function readFileOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * The OpenAPI operation object for one route, or `null` when the document
 * does not have it. Shared by {@link queryFieldsForRoute} and
 * {@link queryAnchorForRoute} so the two stay looking at the same operation.
 *
 * @param {unknown} doc Parsed OpenAPI document.
 * @param {string} method lowercase.
 * @param {string} path
 * @returns {Record<string, unknown> | null}
 */
function routeOperation(doc, method, path) {
  const paths = /** @type {Record<string, unknown>} */ (
    /** @type {{ paths?: unknown }} */ (doc)?.paths ?? {}
  );
  const methods = /** @type {Record<string, unknown> | undefined} */ (paths[path]);
  if (methods === undefined) return null;
  const spec = /** @type {Record<string, unknown> | undefined} */ (methods[method]);
  return spec ?? null;
}

/**
 * Every query-carrying field name declared for one route.
 *
 * Two sources, unioned: `parameters` entries with `in: 'query'` (every GET
 * route), and — for a route whose request body has a top-level `query`
 * object property, the `POST /search` shape — that object's own property
 * names. Both are read from the OpenAPI document, which has already resolved
 * whatever `.extend`/`.omit`/`.pick`/`.merge` chain produced the schema.
 *
 * @param {unknown} doc Parsed OpenAPI document.
 * @param {string} method lowercase.
 * @param {string} path
 * @returns {string[] | null} `null` when the route is not in the document at all.
 */
export function queryFieldsForRoute(doc, method, path) {
  const spec = routeOperation(doc, method, path);
  if (spec === null) return null;

  /** @type {Set<string>} */
  const fields = new Set();

  const parameters = /** @type {unknown[] | undefined} */ (spec.parameters);
  if (Array.isArray(parameters)) {
    for (const p of parameters) {
      const param = /** @type {Record<string, unknown>} */ (p ?? {});
      if (param.in === 'query' && typeof param.name === 'string') fields.add(param.name);
    }
  }

  const requestBody = /** @type {Record<string, unknown> | undefined} */ (spec.requestBody);
  const content = /** @type {Record<string, unknown> | undefined} */ (requestBody?.content);
  const media = /** @type {Record<string, unknown> | undefined} */ (content?.['application/json']);
  const bodySchema = /** @type {Record<string, unknown> | undefined} */ (media?.schema);
  const bodyProps = /** @type {Record<string, unknown> | undefined} */ (bodySchema?.properties);
  const queryProp = /** @type {Record<string, unknown> | undefined} */ (bodyProps?.query);
  if (queryProp?.type === 'object') {
    const queryProps = /** @type {Record<string, unknown> | undefined} */ (queryProp.properties);
    if (queryProps !== undefined) {
      for (const key of Object.keys(queryProps)) fields.add(key);
    }
  }

  return [...fields];
}

/**
 * The binding path a route's query fields hang off inside its own handler
 * entry: `'query'` for the ordinary GET query-string shape (the parameter
 * this codebase's handlers destructure as `{ query }`), or `'body.query'`
 * for the `POST /search` shape, where the fields live nested inside the
 * request body under its own `query` property. Every field
 * {@link queryFieldsForRoute} finds for a route is expected to be read off
 * exactly this one path — see {@link fieldIsRead}.
 *
 * @param {unknown} doc Parsed OpenAPI document.
 * @param {string} method lowercase.
 * @param {string} path
 * @returns {string | null} `null` when the route is not in the document, or
 * matches neither recognised shape.
 */
export function queryAnchorForRoute(doc, method, path) {
  const spec = routeOperation(doc, method, path);
  if (spec === null) return null;

  const parameters = /** @type {unknown[] | undefined} */ (spec.parameters);
  if (Array.isArray(parameters)) {
    const hasQueryParameter = parameters.some((p) => {
      const param = /** @type {Record<string, unknown>} */ (p ?? {});
      return param.in === 'query' && typeof param.name === 'string';
    });
    if (hasQueryParameter) return 'query';
  }

  const requestBody = /** @type {Record<string, unknown> | undefined} */ (spec.requestBody);
  const content = /** @type {Record<string, unknown> | undefined} */ (requestBody?.content);
  const media = /** @type {Record<string, unknown> | undefined} */ (content?.['application/json']);
  const bodySchema = /** @type {Record<string, unknown> | undefined} */ (media?.schema);
  const bodyProps = /** @type {Record<string, unknown> | undefined} */ (bodySchema?.properties);
  const queryProp = /** @type {Record<string, unknown> | undefined} */ (bodyProps?.query);
  if (queryProp?.type === 'object') return 'body.query';

  return null;
}

/* -------------------------------------------------------------------------- */
/* A tiny string/comment/regex-aware lexer, used only to keep brace/paren     */
/* counting from being fooled by a `{`/`(` sitting inside a string, template  */
/* interpolation, or comment. Unlike `stripComments` in `import-scan.mjs`     */
/* (which keeps string contents verbatim, because it is hunting for import   */
/* specifiers that live inside quotes), this blanks string/template bodies    */
/* too, because here they are noise for structural brace-matching.           */
/* -------------------------------------------------------------------------- */

const REGEX_PREV_CHARS = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
]);
const REGEX_PREV_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'do',
  'else',
  'yield',
  'await',
  'case',
]);

/** @param {string} s */
function blank(s) {
  return s.replace(/[^\n]/gu, ' ');
}

/**
 * Blank comments, string/template literal bodies, and regex literals, keeping
 * every other character (and every newline) in place — so a `{`, `}`, `(` or
 * `)` that survives is a real structural token.
 *
 * @param {string} src
 * @returns {string}
 */
export function blankNonStructural(src) {
  const n = src.length;
  let out = '';
  let i = 0;
  let prevChar = '';
  let prevWord = '';

  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';
    if (ch === undefined) {
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n') j += 1;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j += 1;
      j = Math.min(j + 2, n);
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === ch) {
          j += 1;
          break;
        }
        j += 1;
      }
      out += blank(src.slice(i, j));
      prevChar = '';
      prevWord = '';
      i = j;
      continue;
    }
    if (ch === '/' && (REGEX_PREV_CHARS.has(prevChar) || REGEX_PREV_KEYWORDS.has(prevWord))) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const c = src[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '\n') break;
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
          j += 1;
          break;
        }
        j += 1;
      }
      out += blank(src.slice(i, j));
      prevChar = '/';
      prevWord = '';
      i = j;
      continue;
    }

    out += ch;
    if (!/\s/u.test(ch)) {
      prevChar = ch;
      prevWord = /[A-Za-z0-9_$]/u.test(ch) ? prevWord + ch : '';
    }
    i += 1;
  }
  return out;
}

/**
 * Given `structural[openIndex] === openChar`, the index just AFTER the
 * matching `closeChar`, tracking only that one bracket type — safe because a
 * well-formed program nests same-type brackets correctly regardless of what
 * other bracket types are interleaved.
 *
 * @param {string} structural
 * @param {number} openIndex
 * @param {string} openChar
 * @param {string} closeChar
 * @returns {number} `-1` when unbalanced.
 */
export function matchBalanced(structural, openIndex, openChar, closeChar) {
  let depth = 0;
  for (let i = openIndex; i < structural.length; i += 1) {
    const c = structural[i];
    if (c === openChar) depth += 1;
    else if (c === closeChar) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * The offset of `handlerKey` as a TOP-LEVEL key of `objectBody` (an object
 * literal's inner text, depth 0 relative to its own outer braces) — never a
 * same-named key nested inside another entry's own returned object. Several
 * pillars' handlers return `{ status: 200 as const, body: … }` as their OWN
 * result, and a handler literally named `status` (media's
 * `GET /watchlist/status`) would otherwise match that nested `status:` key —
 * whichever one happens to appear first in the source — well before its own.
 *
 * @param {string} objectBody Already `blankNonStructural`-processed.
 * @param {string} handlerKey
 * @returns {number} `-1` when no top-level key matches.
 */
function findTopLevelKeyIndex(objectBody, handlerKey) {
  const startsHere = new RegExp(`^${escapeRegExp(handlerKey)}\\s*:`, 'u');
  let depth = 0;
  for (let i = 0; i < objectBody.length; i += 1) {
    const ch = objectBody[i];
    if (depth === 0 && /[A-Za-z_$]/u.test(ch ?? '')) {
      const prev = i === 0 ? '' : objectBody[i - 1];
      const boundary = prev === '' || prev === '{' || prev === ',' || /\s/u.test(prev ?? '');
      if (boundary && startsHere.test(objectBody.slice(i))) return i;
    }
    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
  }
  return -1;
}

/**
 * The `{ … }` a factory's own `return` statement hands back as its handler
 * map — either a bare object literal (`return { … }`, purchases' shape) or
 * the LAST top-level argument of a call the return expression makes directly
 * (`return server.router(cerebrumXContract, { … })`, cerebrum's shape: every
 * leaf handler factory there calls `initServer().router` itself rather than
 * only the pillar's top-level composer doing so). The call-chain name is not
 * hard-coded — `server.router`, or any other `identifier(.identifier)*(…)` —
 * since what identifies the handler map is its POSITION (the call's own last
 * object-literal argument), not the name of whatever wraps it.
 *
 * @param {string} structural `blankNonStructural`-processed file text.
 * @param {number} from Search start (a factory's own body start).
 * @param {number} to Search end (that factory's own body end).
 * @returns {{ objStart: number; objEnd: number } | null} Bounds INCLUDE the
 *   object literal's own `{`/`}`, matching {@link matchBalanced}'s contract.
 */
function locateReturnedHandlersObject(structural, from, to) {
  const returnMatch = /\breturn\b/u.exec(structural.slice(from, to));
  if (returnMatch === null) return null;
  let cursor = from + returnMatch.index + returnMatch[0].length;
  while (cursor < to && /\s/u.test(structural[cursor] ?? '')) cursor += 1;

  if (structural[cursor] === '{') {
    const objEnd = matchBalanced(structural, cursor, '{', '}');
    if (objEnd === -1 || objEnd > to) return null;
    return { objStart: cursor, objEnd };
  }

  const callChainMatch = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\(/u.exec(
    structural.slice(cursor, to)
  );
  if (callChainMatch === null) return null;
  const parenStart = cursor + callChainMatch[0].length - 1; // at '('
  const parenEnd = matchBalanced(structural, parenStart, '(', ')');
  if (parenEnd === -1 || parenEnd > to) return null;

  let depth = 0;
  let objStart = -1;
  for (let i = parenStart + 1; i < parenEnd - 1; i += 1) {
    const ch = structural[i];
    if (ch === '{' && depth === 0) objStart = i;
    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
  }
  if (objStart === -1) return null;
  const objEnd = matchBalanced(structural, objStart, '{', '}');
  if (objEnd === -1 || objEnd > parenEnd) return null;
  return { objStart, objEnd };
}

/**
 * The source text of one route's handler entry — from its property key
 * through the end of its arrow function — inside a `make*Handlers` factory's
 * `return { … }` object literal.
 *
 * Handles every body shape this codebase writes: a block (`=> { … }`), an
 * implicit-return parenthesised expression (`=> ({ … })`), and — the shape
 * finance/media/inventory/food/cerebrum wrap every handler in — a bare call
 * expression (`=> runHttp(async () => { … })`), captured through the end of
 * the call's own argument list so a query read inside the wrapped callback is
 * still inside the returned text. The wrapper name is not hard-coded: any
 * `identifier(…)` call counts, since the field-read scan that follows only
 * cares about the query anchor, never about what wraps it. Anything else (a
 * bare expression with none of these) is reported as unparseable by the
 * caller rather than guessed at.
 *
 * A file MAY define more than one `make*Handlers` factory — finance's
 * `loan-handlers.ts` composes `makeLoanHandlers`'s export from two private
 * ones (`makeLoanTermsHandlers`, `makeLoanOffsetLinkHandlers`) spread
 * together, each with its own literal-keyed handler object. Every factory in
 * the file is tried in turn (see {@link locateReturnedHandlersObject} for the
 * two shapes a factory's own `return` may hand back), and the first whose OWN
 * handler object literally names `handlerKey` at its top level wins — a
 * factory whose return object is built only from spreads (no literal key
 * matches at all) is silently passed over rather than treated as a parse
 * failure.
 *
 * @param {string} fileText
 * @param {string} handlerKey
 * @returns {string | null}
 */
export function extractHandlerEntryText(fileText, handlerKey) {
  const structural = blankNonStructural(fileText);
  const factoryRe = /function\s+make\w*Handlers\s*\(/gu;

  for (const factoryMatch of structural.matchAll(factoryRe)) {
    const factoryParamsStart = factoryMatch.index + factoryMatch[0].length - 1; // at '('
    const factoryParamsEnd = matchBalanced(structural, factoryParamsStart, '(', ')');
    if (factoryParamsEnd === -1) continue;
    let factoryBodyStart = factoryParamsEnd;
    while (factoryBodyStart < structural.length && /\s/u.test(structural[factoryBodyStart] ?? '')) {
      factoryBodyStart += 1;
    }
    // Skip an explicit return-type annotation before the body — cerebrum's
    // factories spell theirs `): ReturnType<typeof server.router<typeof
    // XContract>> {`. Tracked only for `<>`/`()` nesting depth, which is
    // everything a type expression needs here; the body's own opening `{` is
    // the first one reached once both are back to 0.
    if (structural[factoryBodyStart] === ':') {
      let i = factoryBodyStart + 1;
      let angleDepth = 0;
      let parenDepth = 0;
      while (i < structural.length) {
        const ch = structural[i];
        if (ch === '<') angleDepth += 1;
        else if (ch === '>') angleDepth = Math.max(0, angleDepth - 1);
        else if (ch === '(') parenDepth += 1;
        else if (ch === ')') parenDepth -= 1;
        else if (ch === '{' && angleDepth === 0 && parenDepth === 0) break;
        i += 1;
      }
      factoryBodyStart = i;
    }
    if (structural[factoryBodyStart] !== '{') continue;
    const factoryBodyEnd = matchBalanced(structural, factoryBodyStart, '{', '}');
    if (factoryBodyEnd === -1) continue;

    const located = locateReturnedHandlersObject(structural, factoryBodyStart, factoryBodyEnd);
    if (located === null) continue;
    const { objStart, objEnd } = located;

    // Sliced from just INSIDE the object literal's own braces — `objStart`/
    // `objEnd` bound the `{ … }` delimiters themselves, and depth 0 in
    // `findTopLevelKeyIndex` must mean "a direct property of this object",
    // not "having just stepped past its own opening brace".
    const objectBody = structural.slice(objStart + 1, objEnd - 1);
    const localIndex = findTopLevelKeyIndex(objectBody, handlerKey);
    if (localIndex === -1) continue;
    const keyIndex = objStart + 1 + localIndex;

    const colonIdx = structural.indexOf(':', keyIndex);
    if (colonIdx === -1 || colonIdx >= objEnd) continue;
    let cursor = colonIdx + 1;

    const asyncMatch = /^\s*async\b/u.exec(structural.slice(cursor));
    if (asyncMatch) cursor += asyncMatch[0].length;
    while (cursor < structural.length && /\s/u.test(structural[cursor] ?? '')) cursor += 1;
    if (structural[cursor] !== '(') continue;

    const paramEnd = matchBalanced(structural, cursor, '(', ')');
    if (paramEnd === -1) continue;

    let bodyCursor = paramEnd;
    while (bodyCursor < structural.length && /\s/u.test(structural[bodyCursor] ?? ''))
      bodyCursor += 1;
    if (structural.slice(bodyCursor, bodyCursor + 2) !== '=>') continue;
    bodyCursor += 2;
    while (bodyCursor < structural.length && /\s/u.test(structural[bodyCursor] ?? ''))
      bodyCursor += 1;

    /** @type {number} */
    let bodyEnd;
    if (structural[bodyCursor] === '{') {
      bodyEnd = matchBalanced(structural, bodyCursor, '{', '}');
    } else if (structural[bodyCursor] === '(') {
      bodyEnd = matchBalanced(structural, bodyCursor, '(', ')');
    } else {
      const wrapperMatch = /^[A-Za-z_$][\w$]*/u.exec(structural.slice(bodyCursor));
      if (wrapperMatch === null) continue;
      let afterWrapperName = bodyCursor + wrapperMatch[0].length;
      while (
        afterWrapperName < structural.length &&
        /\s/u.test(structural[afterWrapperName] ?? '')
      ) {
        afterWrapperName += 1;
      }
      if (structural[afterWrapperName] !== '(') continue;
      bodyEnd = matchBalanced(structural, afterWrapperName, '(', ')');
    }
    if (bodyEnd === -1) continue;

    return fileText.slice(keyIndex, bodyEnd);
  }

  return null;
}

/**
 * Local binding name -> module specifier, for every non-type-only import in
 * one file. `import type { … }`, and an individual `type X` inside a mixed
 * named-import clause, are skipped — a type carries no runtime call to
 * follow. Namespace imports (`import * as ns from '…'`) are recognised as
 * present but never followed (see the header's "WHAT IT DOES NOT SEE").
 *
 * @param {string} fileText
 * @returns {Array<[string, string]>}
 */
export function extractImportBindings(fileText) {
  const stripped = stripComments(fileText);
  const IMPORT_RE = /import\s+(type\s+)?([^;]+?)\s+from\s+(['"])([^'"]+)\3/gu;
  /** @type {Array<[string, string]>} */
  const bindings = [];

  for (const m of stripped.matchAll(IMPORT_RE)) {
    if (m[1] !== undefined) continue;
    const clause = (m[2] ?? '').trim();
    const specifier = m[4];
    if (specifier === undefined) continue;
    if (clause.startsWith('*')) continue;

    const braceIdx = clause.indexOf('{');
    const defaultPart = (braceIdx === -1 ? clause : clause.slice(0, braceIdx))
      .replace(/,\s*$/u, '')
      .trim();
    if (defaultPart.length > 0) bindings.push([defaultPart, specifier]);

    if (braceIdx !== -1) {
      const closeIdx = clause.lastIndexOf('}');
      if (closeIdx === -1) continue;
      const inner = clause.slice(braceIdx + 1, closeIdx);
      for (const raw of inner.split(',')) {
        const item = raw.trim();
        if (item.length === 0 || item.startsWith('type ')) continue;
        const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/u.exec(item);
        if (asMatch?.[2] !== undefined) bindings.push([asMatch[2], specifier]);
        else if (/^[A-Za-z_$][\w$]*$/u.test(item)) bindings.push([item, specifier]);
      }
    }
  }
  return bindings;
}

/**
 * Resolve a relative import specifier to a file on disk, trying the `.ts`
 * source behind the `.js` (NodeNext) extension a compiled import writes.
 *
 * @param {string} fromFileAbs
 * @param {string} specifier
 * @returns {string | null}
 */
export function resolveRelativeImport(fromFileAbs, specifier) {
  if (!specifier.startsWith('.')) return null;
  const dir = dirname(fromFileAbs);
  const noExt = specifier.replace(/\.(?:m?[jt]sx?)$/u, '');
  const candidates = [
    join(dir, `${noExt}.ts`),
    join(dir, `${noExt}.tsx`),
    join(dir, specifier),
    join(dir, noExt, 'index.ts'),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * A dotted binding path (`'query'`, `'body.query'`, `'input'`, …), turned
 * into the regex fragment that matches it as a property-access chain,
 * tolerant of whitespace and optional-chaining `?.` at each step.
 *
 * @param {string} anchor
 * @returns {string}
 */
function anchorPattern(anchor) {
  return anchor
    .split('.')
    .map((part) => escapeRegExp(part))
    .join('\\s*\\??\\.\\s*');
}

/**
 * A resolver's own sole parameter, parsed from the raw source text between
 * its parens — a simple identifier (`query`, `input`, optionally with a type
 * annotation: `query: PurchaseScopeQuery`), or a flat destructuring pattern
 * (`{ from, to }`, optionally renamed or defaulted: `{ from: f = undefined }`,
 * in which case `from` is the field read, not `f`). Anything else (a nested
 * pattern, a rest element as the only binding, no parameter at all) is not
 * recognised, so the caller treats the resolver as un-followable past this
 * point rather than guessing at what it reads — the same conservative
 * direction as every other gap this guard's header documents.
 *
 * @param {string} paramText
 * @returns {{ kind: 'identifier', name: string } | { kind: 'destructured', fields: string[] } | null}
 */
export function parseResolverParam(paramText) {
  const trimmed = paramText.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith('{')) {
    const structural = blankNonStructural(trimmed);
    const closeIdx = matchBalanced(structural, 0, '{', '}');
    if (closeIdx === -1) return null;
    const inner = trimmed.slice(1, closeIdx - 1);

    /** @type {string[]} */
    const fields = [];
    for (const raw of inner.split(',')) {
      let item = raw.trim();
      if (item.length === 0 || item.startsWith('...')) continue;
      const eqIdx = item.indexOf('=');
      if (eqIdx !== -1) item = item.slice(0, eqIdx).trim();
      const colonIdx = item.indexOf(':');
      const name = (colonIdx === -1 ? item : item.slice(0, colonIdx)).trim();
      if (/^[A-Za-z_$][\w$]*$/u.test(name)) fields.push(name);
    }
    return { kind: 'destructured', fields };
  }

  const colonIdx = trimmed.indexOf(':');
  const name = (colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx)).trim();
  if (!/^[A-Za-z_$][\w$]*$/u.test(name)) return null;
  return { kind: 'identifier', name };
}

/**
 * A resolver's own `function name(param) { … }` declaration — its raw
 * parameter text and its body — read from its own signature rather than the
 * whole file. Scoping to just this function is what keeps an unrelated
 * sibling in the same module (a plain helper, an incidental `Array.from`)
 * from ever being scanned as if it were this resolver's own reads.
 *
 * @param {string} fileText
 * @param {string} name
 * @returns {{ paramText: string; bodyText: string } | null}
 */
export function extractResolverFunctionText(fileText, name) {
  const structural = blankNonStructural(fileText);
  const fnRe = new RegExp(`\\bfunction\\s+${escapeRegExp(name)}\\s*\\(`, 'u');
  const m = fnRe.exec(structural);
  if (m === null) return null;

  const parenStart = m.index + m[0].length - 1;
  const parenEnd = matchBalanced(structural, parenStart, '(', ')');
  if (parenEnd === -1) return null;
  const paramText = fileText.slice(parenStart + 1, parenEnd - 1);

  const bodyStart = skipReturnTypeAnnotation(structural, parenEnd);
  if (bodyStart === -1 || structural[bodyStart] !== '{') return null;
  const bodyEnd = matchBalanced(structural, bodyStart, '{', '}');
  if (bodyEnd === -1) return null;

  return { paramText, bodyText: fileText.slice(bodyStart, bodyEnd) };
}

/**
 * The index of a function's own body-opening `{`, given the index just past
 * its parameter list's closing `)` — skipping an explicit return-type
 * annotation in between, WHOSE OWN TOP-LEVEL TYPE may itself be an object
 * literal type (`): { a?: string } {`, `toListInput`'s real shape in
 * `pillars/food/src/api/rest/aliases-handlers.ts`), which a naive "find the
 * next `{`" would mistake for the body. Bracket pairs (`()`, `[]`, `<>`,
 * `{}`) in the return type are skipped as balanced units; a `{` is treated
 * as the return type's own object-literal type, not the body, exactly when
 * ANOTHER `{` immediately follows it (only whitespace between) — the shape
 * every real return-type-then-body sequence in this codebase has.
 *
 * @param {string} structural `blankNonStructural`-processed file text.
 * @param {number} from Index just past the parameter list's closing `)`.
 * @returns {number} Index of the body's own `{`, or `-1` if unparseable.
 */
export function skipReturnTypeAnnotation(structural, from) {
  let cursor = from;
  while (cursor < structural.length && /\s/u.test(structural[cursor] ?? '')) cursor += 1;
  if (structural[cursor] !== ':') return cursor;
  cursor += 1;

  const closers = { '{': '}', '(': ')', '[': ']', '<': '>' };
  while (cursor < structural.length) {
    while (cursor < structural.length && /\s/u.test(structural[cursor] ?? '')) cursor += 1;
    const ch = structural[cursor];
    if (ch === undefined) return -1;
    if (ch === '{') {
      const closeIdx = matchBalanced(structural, cursor, '{', '}');
      if (closeIdx === -1) return -1;
      let peek = closeIdx;
      while (peek < structural.length && /\s/u.test(structural[peek] ?? '')) peek += 1;
      if (structural[peek] === '{') {
        cursor = peek;
        continue;
      }
      return cursor;
    }
    const closer = closers[/** @type {'(' | '[' | '<'} */ (ch)];
    if (closer !== undefined) {
      const closeIdx = matchBalanced(structural, cursor, ch, closer);
      if (closeIdx === -1) return -1;
      cursor = closeIdx;
      continue;
    }
    cursor += 1;
  }
  return -1;
}

/**
 * Splits `text` on top-level commas — a comma nested inside a balanced `()`,
 * `{}` or `[]` does not split. Shared by a call's own argument list and a
 * function's own parameter list, which are the same shape: comma-separated
 * expressions (or, for parameters, bindings — themselves sometimes `{ … }`
 * destructuring patterns, which is exactly the nesting this must not split
 * inside of).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitTopLevelCommaList(text) {
  const structural = blankNonStructural(text);
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < structural.length; i += 1) {
    const ch = structural[i];
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  const last = text.slice(start);
  if (last.trim().length > 0 || parts.length > 0) parts.push(last);
  return parts;
}

/**
 * @typedef {object} CallSite
 * @property {string | null} method `null` for a direct call `name(…)`; the
 *   property name for a namespace-qualified call `name.method(…)`.
 * @property {number} argIndex 0-based position of `anchor` among the call's
 *   own top-level arguments.
 */

/**
 * Every call to `name` in `scanText` — bare (`name(…)`) or namespace-
 * qualified (`name.method(…)`, a property access on an imported namespace
 * object) — whose own argument list carries `anchor` itself, bare, as one of
 * its top-level arguments, reporting which position. An argument merely
 * CONTAINING `anchor` (`anchor.field`, `{ x: anchor.field }`, `[anchor]`)
 * does not count — only the exact binding, unwrapped, the same restriction
 * {@link fieldIsRead}'s anchoring applies to a read.
 *
 * @param {string} scanText
 * @param {string} name
 * @param {string} anchor
 * @returns {CallSite[]}
 */
export function findAnchorCallSites(scanText, name, anchor) {
  const structural = blankNonStructural(scanText);
  const callRe = new RegExp(
    `(?<![\\w$.])${escapeRegExp(name)}\\s*(?:\\.\\s*([A-Za-z_$][\\w$]*))?\\s*\\(`,
    'gu'
  );
  const anchorRe = new RegExp(`^${anchorPattern(anchor)}$`, 'u');
  /** @type {CallSite[]} */
  const sites = [];

  for (const m of structural.matchAll(callRe)) {
    const method = m[1] ?? null;
    const parenStart = m.index + m[0].length - 1;
    const parenEnd = matchBalanced(structural, parenStart, '(', ')');
    if (parenEnd === -1) continue;
    const argsText = scanText.slice(parenStart + 1, parenEnd - 1);
    const args = splitTopLevelCommaList(argsText);
    const argIndex = args.findIndex((arg) => anchorRe.test(arg.trim()));
    if (argIndex === -1) continue;
    sites.push({ method, argIndex });
  }

  return sites;
}

/**
 * Where an imported namespace binding's OWN module actually is — read by
 * following `export * as <name> from '<spec>'` in `fileAbs` or, failing
 * that, recursing into every bare `export * from '<spec>'` re-export in that
 * file. That second shape is real: `pillars/media/src/db/index.ts` re-
 * exports `./services/rotation/index.js` wholesale, and it is THAT file, not
 * `db/index.ts` itself, that declares `export * as rotationCandidatesService
 * from './candidates.js'` — a barrel split one level deeper to stay under a
 * line cap. Only relative specifiers are followed, the same restriction
 * every other resolution step in this guard applies; a cycle in the
 * `export *` graph is broken by `visited` rather than looped forever.
 *
 * @param {string} fileAbs
 * @param {string} name
 * @param {Set<string>} [visited]
 * @returns {string | null} Absolute path of the module `name` is a namespace
 *   over, or `null` when this file's `export *` graph never names it.
 */
export function resolveNamespaceExportFile(fileAbs, name, visited = new Set()) {
  if (visited.has(fileAbs)) return null;
  visited.add(fileAbs);
  const fileText = readFileOrNull(fileAbs);
  if (fileText === null) return null;
  const stripped = stripComments(fileText);

  const asRe = new RegExp(
    `export\\s+\\*\\s+as\\s+${escapeRegExp(name)}\\s+from\\s+(['"])([^'"]+)\\1`,
    'u'
  );
  const asMatch = asRe.exec(stripped);
  const asSpecifier = asMatch?.[2];
  if (asSpecifier !== undefined) return resolveRelativeImport(fileAbs, asSpecifier);

  const wildcardRe = /export\s+\*\s+from\s+(['"])([^'"]+)\1/gu;
  for (const m of stripped.matchAll(wildcardRe)) {
    const specifier = m[2];
    if (specifier === undefined) continue;
    const resolved = resolveRelativeImport(fileAbs, specifier);
    if (resolved === null) continue;
    const found = resolveNamespaceExportFile(resolved, name, visited);
    if (found !== null) return found;
  }

  return null;
}

/**
 * Where a plainly-imported (non-namespace) binding's own function is
 * actually DEFINED — `fileAbs` when it declares `function <name>(…)`
 * directly, or, when `fileAbs` only re-exports it, following that re-export
 * to where it is. Two re-export shapes are followed: a named re-export
 * (`export { originalName as name } from '<spec>'`, or unaliased `export {
 * name } from '<spec>'` — real for `pillars/lists`, whose `db/index.ts`
 * re-exports `searchListItems` by name from `./services/list-items-
 * search.js` rather than defining it), and a bare `export * from '<spec>'`
 * wildcard re-export (the same barrel shape {@link resolveNamespaceExportFile}
 * follows). Only relative specifiers are followed; a cycle is broken by
 * `visited`.
 *
 * @param {string} fileAbs
 * @param {string} name
 * @param {Set<string>} [visited]
 * @returns {string | null} Absolute path of the module that actually
 *   declares `function <name>(…)`, or `null` when this file's export graph
 *   never leads to one.
 */
export function resolveNamedExportFile(fileAbs, name, visited = new Set()) {
  if (visited.has(fileAbs)) return null;
  visited.add(fileAbs);
  const fileText = readFileOrNull(fileAbs);
  if (fileText === null) return null;
  const stripped = stripComments(fileText);

  if (new RegExp(`\\bfunction\\s+${escapeRegExp(name)}\\s*\\(`, 'u').test(stripped)) {
    return fileAbs;
  }

  const namedRe = /export\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2/gu;
  for (const m of stripped.matchAll(namedRe)) {
    const clause = m[1];
    const specifier = m[3];
    if (clause === undefined || specifier === undefined) continue;
    for (const raw of clause.split(',')) {
      const item = raw.trim();
      if (item.length === 0 || item.startsWith('type ')) continue;
      const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/u.exec(item);
      const exportedAs = asMatch?.[2] ?? item;
      const originalName = asMatch?.[1] ?? item;
      if (exportedAs !== name) continue;
      const resolved = resolveRelativeImport(fileAbs, specifier);
      if (resolved === null) continue;
      const found = resolveNamedExportFile(resolved, originalName, visited);
      if (found !== null) return found;
    }
  }

  const wildcardRe = /export\s+\*\s+from\s+(['"])([^'"]+)\1/gu;
  for (const m of stripped.matchAll(wildcardRe)) {
    const specifier = m[2];
    if (specifier === undefined) continue;
    const resolved = resolveRelativeImport(fileAbs, specifier);
    if (resolved === null) continue;
    const found = resolveNamedExportFile(resolved, name, visited);
    if (found !== null) return found;
  }

  return null;
}

/**
 * Every name a `function <name>(…)` declaration in `fileText` introduces —
 * used to let {@link collectReachableTexts} follow a call to a resolver
 * defined in the SAME file as the code calling it (a private helper, never
 * imported at all: media's `library.ts` reads `type`/`search`/`genre` this
 * way inside a local `buildWhereClause(input)`, called from the exported
 * `listLibrary` in the same module; food's `aliases-handlers.ts` reads
 * `targetKind`/`targetId` inside a local `toListInput(query)` called from
 * the handler entry itself). Exported and non-exported declarations both
 * count — visibility outside the module is irrelevant to a same-file call.
 *
 * @param {string} fileText
 * @returns {string[]}
 */
export function localFunctionNames(fileText) {
  const structural = blankNonStructural(fileText);
  const names = new Set();
  for (const m of structural.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/gu)) {
    const name = m[1];
    if (name !== undefined) names.add(name);
  }
  return [...names];
}

/**
 * @typedef {object} ReachableScope
 * @property {string} text   Source text this scope's reads must be found in.
 * @property {string} anchor The dotted binding path this scope's query data
 *   actually arrived through — reads must chain off exactly this, not off
 *   any other identifier that happens to share a field's name.
 */

/**
 * Every scope reachable from a route's handler entry by following a call
 * that passes the exact binding carrying the query at that point as ONE OF
 * ITS OWN ARGUMENTS — any position, not only a sole argument — to a function
 * reached through a relative import, transitively. Two call shapes are
 * followed: a bare call (`importedName(…, <anchor>, …)`) and a namespace-
 * qualified one (`importedNamespace.method(…, <anchor>, …)`, a property
 * access on an imported namespace object — see {@link resolveNamespaceExportFile}
 * for how the namespace's OWN module is found). Both resolve the callee the
 * same way once found: read its own parameter at the SAME position the call
 * passed the anchor in, from its own signature — never assumed to be
 * `query` just because the call site's argument was.
 *
 * Each scope in the returned list carries its OWN anchor: the handler
 * entry's is `startAnchor`; a followed resolver's is whatever its own
 * signature names the parameter at that position, read fresh from that
 * resolver.
 *
 * A resolver whose matched parameter is itself a destructuring pattern
 * (`function r({ from, to })`) reads those fields the moment it is called —
 * that call is equivalent to destructuring them off `<anchor>` right there,
 * so it is recorded as a synthetic scope anchored to the CALLER's `anchor`
 * rather than the resolver's own, and traversal does not continue past it.
 *
 * This is what lets `resolvePurchaseScope` calling `resolveMerchantFilter`
 * count as reading the merchant fields on behalf of every route that calls
 * `resolvePurchaseScope(query)`, without each of those routes' handler
 * bodies mentioning the merchant fields by name — see the header's
 * "THE RULE". It is also what lets a media handler's
 * `libraryService.listLibrary(db, query)` — `query` as the SECOND argument,
 * through a property access on an imported namespace object — count as
 * reading whatever `listLibrary`'s own second parameter reads, and what lets
 * `listLibrary`, in turn, calling a private same-file `buildWhereClause(input)`
 * (never imported at all — see {@link localFunctionNames}) count as reading
 * whatever THAT function reads.
 *
 * @param {string} startFileAbs
 * @param {string} startEntryText The specific handler entry's own text, not the whole file.
 * @param {string} [startAnchor] The binding path the entry's query fields hang off. Defaults to `'query'`.
 * @returns {ReachableScope[]}
 */
export function collectReachableTexts(startFileAbs, startEntryText, startAnchor = 'query') {
  /** @type {ReachableScope[]} */
  const scopes = [{ text: startEntryText, anchor: startAnchor }];
  const visited = new Set([`${startFileAbs}::`]);
  /** @type {Array<{ file: string; scanText: string; callAnchor: string }>} */
  const queue = [{ file: startFileAbs, scanText: startEntryText, callAnchor: startAnchor }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    const { file, scanText, callAnchor } = next;
    const fileOwnText = readFileOrNull(file) ?? '';
    const importedNames = new Set();
    /** @type {Array<[string, string | null]>} */
    const candidates = [];
    for (const [name, specifier] of extractImportBindings(fileOwnText)) {
      importedNames.add(name);
      candidates.push([name, specifier]);
    }
    for (const name of localFunctionNames(fileOwnText)) {
      if (!importedNames.has(name)) candidates.push([name, null]);
    }

    for (const [name, specifier] of candidates) {
      const sites = findAnchorCallSites(scanText, name, callAnchor);
      if (sites.length === 0) continue;

      for (const site of sites) {
        /** @type {string | null} */
        let targetFile;
        /** @type {string} */
        let fnName;
        if (specifier === null) {
          targetFile = file;
          fnName = name;
        } else if (site.method === null) {
          const bindingFile = resolveRelativeImport(file, specifier);
          targetFile = bindingFile === null ? null : resolveNamedExportFile(bindingFile, name);
          fnName = name;
        } else {
          const bindingHome = resolveRelativeImport(file, specifier);
          targetFile = bindingHome === null ? null : resolveNamespaceExportFile(bindingHome, name);
          fnName = site.method;
        }
        if (targetFile === null) continue;

        const visitKey = `${targetFile}::${fnName}`;
        if (visited.has(visitKey)) continue;
        visited.add(visitKey);

        const fileText = readFileOrNull(targetFile);
        if (fileText === null) continue;

        const fn = extractResolverFunctionText(fileText, fnName);
        if (fn === null) continue;
        const paramTexts = splitTopLevelCommaList(fn.paramText);
        const paramText = paramTexts[site.argIndex];
        if (paramText === undefined) continue;
        const param = parseResolverParam(paramText);
        if (param === null) continue;

        if (param.kind === 'destructured') {
          scopes.push({
            text: `{ ${param.fields.join(', ')} } = ${callAnchor};`,
            anchor: callAnchor,
          });
          continue;
        }

        scopes.push({ text: fn.bodyText, anchor: param.name });
        queue.push({ file: targetFile, scanText: fn.bodyText, callAnchor: param.name });
      }
    }
  }

  return scopes;
}

/**
 * Whether `text` contains a `{ … }` destructuring whose braces name `field`
 * as a source key (right after the opening `{` or a `,`, followed by `,`,
 * `:`, `}`, or the group's own end — the same position test the pre-anchor
 * version of this guard used, which is what keeps `{ other: field }` from
 * counting as a read of `field`: there, `field` is the LOCAL name an alias
 * renames `other` to, not a source key), assigned FROM `anchor` — checked
 * against each `{ … }` group's own balanced extent, not the whole text, so a
 * `}` that closes one group is never mistaken for the `}` that opens the
 * `= anchor` this guard is actually looking for.
 *
 * @param {string} text
 * @param {string} field
 * @param {string} anchorRe Pre-built {@link anchorPattern} regex fragment.
 * @returns {boolean}
 */
function isDestructuredFromAnchor(text, field, anchorRe) {
  const structural = blankNonStructural(text);
  const esc = escapeRegExp(field);
  const keyRe = new RegExp(`[{,]\\s*${esc}\\s*(?:[,:}]|$)`, 'u');
  const afterRe = new RegExp(`^\\s*=\\s*${anchorRe}\\b(?!\\s*\\??\\.)`, 'u');

  for (let i = 0; i < structural.length; i += 1) {
    if (structural[i] !== '{') continue;
    const end = matchBalanced(structural, i, '{', '}');
    if (end === -1) continue;
    if (!keyRe.test(text.slice(i, end))) continue;
    if (afterRe.test(text.slice(end))) return true;
  }
  return false;
}

/**
 * Whether `field` is read in `text`, anchored to `anchor` — the dotted
 * binding path (`'query'` by default, or `'body.query'`, or a followed
 * resolver's own parameter name) that this text's query data actually
 * arrived through.
 *
 * Two shapes count, both requiring the read to chain off `anchor` itself:
 * a property access (`<anchor>.field`, `<anchor>?.field`) and a destructured
 * binding assigned FROM `anchor` (`{ field } = <anchor>`,
 * `{ field: renamed } = <anchor>`, or `{ a, field, b } = <anchor>`). A
 * `.field` access on any other identifier, or a destructuring assigned from
 * anything else, is not a read of this field — that anchoring is the whole
 * fix for `Array.from(rows)` reading as though it were `query.from`.
 *
 * @param {string} text
 * @param {string} field
 * @param {string} [anchor] Defaults to `'query'`.
 * @returns {boolean}
 */
export function fieldIsRead(text, field, anchor = 'query') {
  const esc = escapeRegExp(field);
  const anchorRe = anchorPattern(anchor);
  const memberAccess = new RegExp(`(?<![\\w$.])${anchorRe}\\s*\\??\\.\\s*${esc}\\b`, 'u');
  return memberAccess.test(text) || isDestructuredFromAnchor(text, field, anchorRe);
}

/**
 * @typedef {object} AllowlistValidation
 * @property {Map<string, string>} index `"method path field"` -> reason.
 * @property {string[]} violations Malformed entries — missing shape, or missing a reason.
 */

/**
 * @param {readonly AllowlistEntry[]} allowlist
 * @returns {AllowlistValidation}
 */
function validateAllowlist(allowlist) {
  /** @type {Map<string, string>} */
  const index = new Map();
  /** @type {string[]} */
  const violations = [];

  for (const entry of allowlist) {
    const e = /** @type {Partial<AllowlistEntry>} */ (entry ?? {});
    if (typeof e.method !== 'string' || typeof e.path !== 'string' || typeof e.field !== 'string') {
      violations.push(
        `allowlist entry ${JSON.stringify(entry)} is missing a method, path or field`
      );
      continue;
    }
    if (typeof e.reason !== 'string' || e.reason.trim().length === 0) {
      violations.push(
        `allowlist entry for ${e.method.toUpperCase()} ${e.path} field '${e.field}' has no ` +
          'reason recorded. A deliberate omission must say why the field is unread, not stand ' +
          'silent.'
      );
      continue;
    }
    index.set(`${e.method.toLowerCase()} ${e.path} ${e.field}`, e.reason);
  }

  return { index, violations };
}

/**
 * @typedef {object} CollectViolationsOptions
 * @property {string} [openapiRelPath]
 * @property {number} [minRoutesWithFields]
 */

/**
 * Check every route in `routes` against the OpenAPI document at
 * `<root>/<options.openapiRelPath>`, plus the two discovery-floor checks that
 * keep this guard from reporting a clean tree because its own inputs moved
 * out from under it.
 *
 * Defaults to purchases' own `OPENAPI_REL_PATH` / `MIN_ROUTES_WITH_FIELDS` so
 * every existing call site — this guard's own `main()` before {@link PILLARS}
 * existed, and every purchases-only test that only ever passed `routes` and
 * `allowlist` — keeps working unchanged; a caller checking a different pillar
 * passes its own values in `options`.
 *
 * @param {string} root
 * @param {readonly RouteSpec[]} [routes]
 * @param {readonly AllowlistEntry[]} [allowlist]
 * @param {CollectViolationsOptions} [options]
 * @returns {string[]}
 */
export function collectViolations(root, routes = ROUTES, allowlist = ALLOWLIST, options = {}) {
  const { openapiRelPath = OPENAPI_REL_PATH, minRoutesWithFields = MIN_ROUTES_WITH_FIELDS } =
    options;
  /** @type {string[]} */
  const violations = [];

  const { index: allowlistIndex, violations: allowlistViolations } = validateAllowlist(allowlist);
  violations.push(...allowlistViolations);

  const openapiPath = join(root, openapiRelPath);
  const openapiText = readFileOrNull(openapiPath);
  if (openapiText === null) {
    violations.push(`could not read ${openapiRelPath}`);
    return violations;
  }
  /** @type {unknown} */
  let doc;
  try {
    doc = JSON.parse(openapiText);
  } catch (err) {
    violations.push(`could not parse ${openapiRelPath}: ${String(err)}`);
    return violations;
  }

  const allPaths = /** @type {Record<string, Record<string, unknown>>} */ (
    /** @type {{ paths?: unknown }} */ (doc).paths ?? {}
  );
  /** @type {Array<{ method: string; path: string }>} */
  const discoveredRoutesWithFields = [];
  for (const [path, methods] of Object.entries(allPaths)) {
    for (const method of Object.keys(methods)) {
      const fields = queryFieldsForRoute(doc, method, path);
      if (fields !== null && fields.length > 0) discoveredRoutesWithFields.push({ method, path });
    }
  }

  if (discoveredRoutesWithFields.length < minRoutesWithFields) {
    violations.push(
      `only ${String(discoveredRoutesWithFields.length)} route(s) with query fields were found in ` +
        `${openapiRelPath}, under this guard's floor of ${String(minRoutesWithFields)}. Either ` +
        "the OpenAPI file moved or went stale, or this guard's field derivation broke."
    );
  }

  for (const { method, path } of discoveredRoutesWithFields) {
    const known = routes.some((r) => r.method === method && r.path === path);
    if (!known) {
      violations.push(
        `${method.toUpperCase()} ${path} advertises a query schema with fields (see ` +
          `${openapiRelPath}) but is not listed in ROUTES in this guard. Add a ` +
          '{ method, path, handlerFile, handlerKey } entry for it.'
      );
    }
  }

  for (const route of routes) {
    const fields = queryFieldsForRoute(doc, route.method, route.path);
    if (fields === null) {
      violations.push(
        `ROUTES entry ${route.method.toUpperCase()} ${route.path} no longer exists in ` +
          `${openapiRelPath}. Update or remove it.`
      );
      continue;
    }
    if (fields.length === 0) continue;

    const handlerAbs = join(root, route.handlerFile);
    const fileText = readFileOrNull(handlerAbs);
    if (fileText === null) {
      violations.push(
        `${route.handlerFile}, the handler for ${route.method.toUpperCase()} ${route.path}, does ` +
          'not exist.'
      );
      continue;
    }

    const entryText = extractHandlerEntryText(fileText, route.handlerKey);
    if (entryText === null) {
      violations.push(
        `could not locate a parseable handler entry '${route.handlerKey}' in ${route.handlerFile} ` +
          `for ${route.method.toUpperCase()} ${route.path}. It may have been renamed, or restructured ` +
          'in a way this guard cannot parse (see the header\'s "WHAT IT DOES NOT SEE").'
      );
      continue;
    }

    const anchor = queryAnchorForRoute(doc, route.method, route.path) ?? 'query';
    const scopes = collectReachableTexts(handlerAbs, entryText, anchor).map((scope) => ({
      text: stripComments(scope.text),
      anchor: scope.anchor,
    }));

    for (const field of fields) {
      if (scopes.some((scope) => fieldIsRead(scope.text, field, scope.anchor))) continue;
      const allowKey = `${route.method} ${route.path} ${field}`;
      const reason = allowlistIndex.get(allowKey);
      if (reason !== undefined) continue;
      violations.push(
        `${route.method.toUpperCase()} ${route.path} advertises query field '${field}' (see ` +
          `${openapiRelPath}) but ${route.handlerFile} -> ${route.handlerKey} never reads it, ` +
          'directly or through a resolver it calls with the whole `query` object. Read it, or add ' +
          'an ALLOWLIST entry recording why it is deliberately unread.'
      );
    }
  }

  return violations;
}

/* -------------------------------------------------------------------------- */
/* Self-test                                                                  */
/* -------------------------------------------------------------------------- */

/** @param {string} root @param {string} rel @param {string} body */
function writeFile(root, rel, body) {
  const abs = join(root, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

/**
 * Writes a fixture tree with an OpenAPI file naming `MIN_ROUTES_WITH_FIELDS`
 * harmless clean routes (so the discovery floor never fires by accident in a
 * case that is not testing it), plus whatever the caller adds beyond that.
 *
 * @param {string} root
 * @param {Record<string, unknown>} extraPaths Merged into the fixture's `paths`.
 */
function writeBaseOpenapi(root, extraPaths) {
  /** @type {Record<string, unknown>} */
  const paths = {};
  for (let i = 0; i < MIN_ROUTES_WITH_FIELDS; i += 1) {
    paths[`/filler-${String(i)}`] = {
      get: { parameters: [{ name: 'tag', in: 'query', schema: { type: 'string' } }] },
    };
    writeFile(
      root,
      `pillars/purchases/src/api/rest/filler-${String(i)}-handlers.ts`,
      'export function makeFillerHandlers() {\n  return {\n    list: async ({ query }) => ({ status: 200, body: { tag: query.tag } }),\n  };\n}\n'
    );
  }
  writeFile(
    root,
    OPENAPI_REL_PATH,
    JSON.stringify(
      {
        openapi: '3.1.0',
        info: { title: 'fixture', version: '0' },
        paths: { ...paths, ...extraPaths },
      },
      null,
      2
    )
  );
}

/**
 * @param {string} root
 * @returns {RouteSpec[]} the filler routes' entries, for the caller to extend.
 */
function fillerRoutes(root) {
  void root;
  return Array.from({ length: MIN_ROUTES_WITH_FIELDS }, (_v, i) => ({
    method: 'get',
    path: `/filler-${String(i)}`,
    handlerFile: `pillars/purchases/src/api/rest/filler-${String(i)}-handlers.ts`,
    handlerKey: 'list',
  }));
}

/**
 * @typedef {object} SelfTestCase
 * @property {string} name
 * @property {(root: string) => { routes: RouteSpec[]; allowlist?: AllowlistEntry[] }} arrange
 * @property {RegExp | null} expect `null` means the tree must come back clean.
 */

/** @returns {SelfTestCase[]} */
function selfTestCases() {
  return [
    {
      // The real POPS-1966 shape: the handler forwards `query.text` and
      // drops `query.filters` entirely. Taken verbatim from the pre-fix
      // commit (aa517b1a3) rather than invented for this test.
      name: 'ADVERSARIAL: pre-fix POST /search dropped query.filters (POPS-1966)',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/search': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        query: {
                          type: 'object',
                          properties: { text: { type: 'string' }, filters: { type: 'array' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/search-handlers.ts',
          [
            "import { searchPurchases } from '../../db/index.js';",
            '',
            'export function makeSearchHandlers(db) {',
            '  return {',
            '    search: async ({ body }) => ({',
            '      status: 200,',
            '      body: {',
            '        hits: searchPurchases(db, body.query.text).map((hit) => ({',
            '          uri: hit.uri,',
            '        })),',
            '      },',
            '    }),',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'post',
              path: '/search',
              handlerFile: 'pillars/purchases/src/api/rest/search-handlers.ts',
              handlerKey: 'search',
            },
          ],
        };
      },
      expect: /field 'filters'/u,
    },
    {
      name: 'PASSING TWIN: POST /search reads both text and filters',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/search': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        query: {
                          type: 'object',
                          properties: { text: { type: 'string' }, filters: { type: 'array' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/search-handlers.ts',
          [
            "import { searchFilterScope, searchPurchases } from '../../db/index.js';",
            '',
            'export function makeSearchHandlers(db) {',
            '  return {',
            '    search: async ({ body }) => {',
            '      const scope = searchFilterScope(body.query.filters ?? []);',
            '      return {',
            '        status: 200,',
            '        body: { hits: searchPurchases(db, body.query.text, scope).map((hit) => ({ uri: hit.uri })) },',
            '      };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'post',
              path: '/search',
              handlerFile: 'pillars/purchases/src/api/rest/search-handlers.ts',
              handlerKey: 'search',
            },
          ],
        };
      },
      expect: null,
    },
    {
      // The real POPS-1849 shape (pre-fix, commit 9a372cb9d's parent): the
      // leaderboard handler builds its filter by hand from sources/statuses/
      // from/to and never reads the four merchant-scope fields it inherited.
      name: 'ADVERSARIAL: pre-fix GET /analytics/product-leaderboard dropped the inherited merchant scope (POPS-1849)',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/analytics/product-leaderboard': {
            get: {
              parameters: [
                { name: 'sources', in: 'query' },
                { name: 'statuses', in: 'query' },
                { name: 'from', in: 'query' },
                { name: 'to', in: 'query' },
                { name: 'currency', in: 'query' },
                { name: 'merchantEntityId', in: 'query' },
                { name: 'merchantEntityName', in: 'query' },
                { name: 'merchantUnattributed', in: 'query' },
                { name: 'minOrderCount', in: 'query' },
              ],
            },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/analytics-handlers.ts',
          [
            "import { rankProductPurchases } from '../../db/index.js';",
            '',
            'export function makeAnalyticsHandlers(db) {',
            '  return {',
            '    productLeaderboard: async ({ query }) => {',
            '      const minOrderCount = query.minOrderCount ?? 1;',
            '      const leaderboard = rankProductPurchases(db, {',
            '        sources: query.sources,',
            '        statuses: query.statuses,',
            '        from: query.from,',
            '        to: query.to,',
            '        minOrderCount,',
            '      });',
            '      return { status: 200, body: leaderboard };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/analytics/product-leaderboard',
              handlerFile: 'pillars/purchases/src/api/rest/analytics-handlers.ts',
              handlerKey: 'productLeaderboard',
            },
          ],
        };
      },
      expect:
        /field 'currency'|field 'merchantEntityId'|field 'merchantEntityName'|field 'merchantUnattributed'/u,
    },
    {
      name: 'PASSING TWIN: GET /analytics/product-leaderboard resolves scope through a followed resolver',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/analytics/product-leaderboard': {
            get: {
              parameters: [
                { name: 'sources', in: 'query' },
                { name: 'statuses', in: 'query' },
                { name: 'from', in: 'query' },
                { name: 'to', in: 'query' },
                { name: 'currency', in: 'query' },
                { name: 'merchantEntityId', in: 'query' },
                { name: 'merchantEntityName', in: 'query' },
                { name: 'merchantUnattributed', in: 'query' },
                { name: 'minOrderCount', in: 'query' },
              ],
            },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/analytics-handlers.ts',
          [
            "import { rankProductPurchases } from '../../db/index.js';",
            "import { resolvePurchaseScope } from './purchase-scope.js';",
            '',
            'export function makeAnalyticsHandlers(db) {',
            '  return {',
            '    productLeaderboard: async ({ query }) => {',
            '      const scope = resolvePurchaseScope(query);',
            '      const minOrderCount = query.minOrderCount ?? 1;',
            '      const leaderboard = rankProductPurchases(db, { ...scope.scope, minOrderCount });',
            '      return { status: 200, body: leaderboard };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        writeFile(
          root,
          'pillars/purchases/src/api/rest/purchase-scope.ts',
          [
            "import { resolveMerchantFilter } from '../../contract/merchant-filter.js';",
            '',
            'export function resolvePurchaseScope(query) {',
            '  const merchant = resolveMerchantFilter(query);',
            '  return {',
            '    ok: true,',
            '    scope: {',
            '      sources: query.sources,',
            '      statuses: query.statuses,',
            '      from: query.from,',
            '      to: query.to,',
            '      currency: query.currency,',
            '      merchant: merchant.merchant,',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        writeFile(
          root,
          'pillars/purchases/src/contract/merchant-filter.ts',
          [
            'export function resolveMerchantFilter(query) {',
            '  if (query.merchantEntityId !== undefined) return { ok: true, merchant: { entityId: query.merchantEntityId } };',
            '  if (query.merchantEntityName !== undefined) return { ok: true, merchant: { name: query.merchantEntityName } };',
            '  if (query.merchantUnattributed === true) return { ok: true, merchant: {} };',
            '  return { ok: true, merchant: undefined };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/analytics/product-leaderboard',
              handlerFile: 'pillars/purchases/src/api/rest/analytics-handlers.ts',
              handlerKey: 'productLeaderboard',
            },
          ],
        };
      },
      expect: null,
    },
    {
      name: 'ADVERSARIAL: an unrelated Array.from call must not be mistaken for reading query.from (anchoring)',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/analytics/window-check': {
            get: { parameters: [{ name: 'from', in: 'query' }] },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/window-handlers.ts',
          [
            'export function makeWindowHandlers(db) {',
            '  return {',
            '    check: async ({ query }) => {',
            '      const rows = Array.from(query.items ?? []);',
            '      return { status: 200, body: { count: rows.length } };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/analytics/window-check',
              handlerFile: 'pillars/purchases/src/api/rest/window-handlers.ts',
              handlerKey: 'check',
            },
          ],
        };
      },
      expect: /field 'from'/u,
    },
    {
      name: 'ADVERSARIAL: a longer chain ending in query (other.query.from) must not count as reading query.from (anchoring)',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/analytics/window-check': {
            get: { parameters: [{ name: 'from', in: 'query' }] },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/window-handlers.ts',
          [
            'export function makeWindowHandlers(db) {',
            '  return {',
            '    check: async ({ query }) => {',
            '      const rows = other.query.from;',
            '      return { status: 200, body: { count: rows.length } };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/analytics/window-check',
              handlerFile: 'pillars/purchases/src/api/rest/window-handlers.ts',
              handlerKey: 'check',
            },
          ],
        };
      },
      expect: /field 'from'/u,
    },
    {
      name: 'ADVERSARIAL: a destructuring from a path nested under query must not count as reading query.from (anchoring)',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/analytics/window-check': {
            get: { parameters: [{ name: 'from', in: 'query' }] },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/window-handlers.ts',
          [
            'export function makeWindowHandlers(db) {',
            '  return {',
            '    check: async ({ query }) => {',
            '      const { from } = query.nested;',
            '      return { status: 200, body: { from } };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/analytics/window-check',
              handlerFile: 'pillars/purchases/src/api/rest/window-handlers.ts',
              handlerKey: 'check',
            },
          ],
        };
      },
      expect: /field 'from'/u,
    },
    {
      name: "PASSING TWIN: a resolver's own parameter, not literally named `query`, still anchors a read of it",
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/analytics/window-check': {
            get: { parameters: [{ name: 'to', in: 'query' }] },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/window-handlers.ts',
          [
            "import { resolveWindowEnd } from './window-scope.js';",
            '',
            'export function makeWindowHandlers(db) {',
            '  return {',
            '    check: async ({ query }) => {',
            '      const end = resolveWindowEnd(query);',
            '      return { status: 200, body: { end } };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        writeFile(
          root,
          'pillars/purchases/src/api/rest/window-scope.ts',
          ['export function resolveWindowEnd(input) {', '  return input.to;', '}', ''].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/analytics/window-check',
              handlerFile: 'pillars/purchases/src/api/rest/window-handlers.ts',
              handlerKey: 'check',
            },
          ],
        };
      },
      expect: null,
    },
    {
      name: 'PASSING TWIN: a resolver whose parameter destructures the query directly counts as reading each named field',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/analytics/window-check': {
            get: { parameters: [{ name: 'from', in: 'query' }] },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/window-handlers.ts',
          [
            "import { resolveWindowStart } from './window-scope.js';",
            '',
            'export function makeWindowHandlers(db) {',
            '  return {',
            '    check: async ({ query }) => {',
            '      const start = resolveWindowStart(query);',
            '      return { status: 200, body: { start } };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        writeFile(
          root,
          'pillars/purchases/src/api/rest/window-scope.ts',
          ['export function resolveWindowStart({ from }) {', '  return from;', '}', ''].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/analytics/window-check',
              handlerFile: 'pillars/purchases/src/api/rest/window-handlers.ts',
              handlerKey: 'check',
            },
          ],
        };
      },
      expect: null,
    },
    {
      name: "ADVERSARIAL: a resolver reading '.from' off an unrelated local object must not count as reading query.from",
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/analytics/window-check': {
            get: { parameters: [{ name: 'from', in: 'query' }] },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/window-handlers.ts',
          [
            "import { resolveWindowStart } from './window-scope.js';",
            '',
            'export function makeWindowHandlers(db) {',
            '  return {',
            '    check: async ({ query }) => {',
            '      const start = resolveWindowStart(query);',
            '      return { status: 200, body: { start } };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        writeFile(
          root,
          'pillars/purchases/src/api/rest/window-scope.ts',
          [
            'export function resolveWindowStart(input) {',
            '  const other = { from: "unrelated" };',
            '  return other.from;',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/analytics/window-check',
              handlerFile: 'pillars/purchases/src/api/rest/window-handlers.ts',
              handlerKey: 'check',
            },
          ],
        };
      },
      expect: /field 'from'/u,
    },
    {
      name: 'MUTATION: dropping just beforeId from a passing list handler is caught',

      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/purchases': {
            get: {
              parameters: [
                { name: 'beforeOrderedAt', in: 'query' },
                { name: 'beforeId', in: 'query' },
              ],
            },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/purchase-handlers.ts',
          [
            'export function makePurchaseHandlers(db) {',
            '  return {',
            '    list: async ({ query }) => {',
            '      const beforeOrderedAt = query.beforeOrderedAt;',
            '      return { status: 200, body: { beforeOrderedAt } };',
            '    },',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/purchases',
              handlerFile: 'pillars/purchases/src/api/rest/purchase-handlers.ts',
              handlerKey: 'list',
            },
          ],
        };
      },
      expect: /field 'beforeId'/u,
    },
    {
      name: 'an allowlist entry without a reason is itself a violation, not silence',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/search': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        query: { type: 'object', properties: { filters: { type: 'array' } } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/search-handlers.ts',
          [
            'export function makeSearchHandlers(db) {',
            '  return {',
            '    search: async ({ body }) => ({ status: 200, body: { hits: [] } }),',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'post',
              path: '/search',
              handlerFile: 'pillars/purchases/src/api/rest/search-handlers.ts',
              handlerKey: 'search',
            },
          ],
          allowlist: [
            /** @type {AllowlistEntry} */ ({ method: 'post', path: '/search', field: 'filters' }),
          ],
        };
      },
      expect: /has no reason recorded/u,
    },
    {
      name: 'an allowlist entry WITH a reason suppresses only its own field',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/search': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        query: { type: 'object', properties: { filters: { type: 'array' } } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/search-handlers.ts',
          [
            'export function makeSearchHandlers(db) {',
            '  return {',
            '    search: async ({ body }) => ({ status: 200, body: { hits: [] } }),',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'post',
              path: '/search',
              handlerFile: 'pillars/purchases/src/api/rest/search-handlers.ts',
              handlerKey: 'search',
            },
          ],
          allowlist: [
            {
              method: 'post',
              path: '/search',
              field: 'filters',
              reason: 'fixture: proves a reasoned entry suppresses exactly its own field',
            },
          ],
        };
      },
      expect: null,
    },
    {
      name: 'DEGENERATE: OpenAPI file is missing',
      arrange: (root) => {
        writeBaseOpenapi(root, {});
        rmSync(join(root, ...OPENAPI_REL_PATH.split('/')));
        return { routes: fillerRoutes(root) };
      },
      expect: /could not read/u,
    },
    {
      name: 'DEGENERATE: OpenAPI file is unparseable',
      arrange: (root) => {
        writeBaseOpenapi(root, {});
        writeFile(root, OPENAPI_REL_PATH, '{ not json');
        return { routes: fillerRoutes(root) };
      },
      expect: /could not parse/u,
    },
    {
      name: 'DEGENERATE: a ROUTES entry no longer exists in the OpenAPI file',
      arrange: (root) => {
        writeBaseOpenapi(root, {});
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/gone',
              handlerFile: 'pillars/purchases/src/api/rest/gone-handlers.ts',
              handlerKey: 'list',
            },
          ],
        };
      },
      expect: /no longer exists/u,
    },
    {
      name: 'DEGENERATE: a route with query fields is missing from ROUTES entirely',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/uncovered': { get: { parameters: [{ name: 'tag', in: 'query' }] } },
        });
        return { routes: fillerRoutes(root) };
      },
      expect: /is not listed in ROUTES/u,
    },
    {
      name: "DEGENERATE: a ROUTES entry's handler file does not exist",
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/broken': { get: { parameters: [{ name: 'tag', in: 'query' }] } },
        });
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/broken',
              handlerFile: 'pillars/purchases/src/api/rest/does-not-exist.ts',
              handlerKey: 'list',
            },
          ],
        };
      },
      expect: /does not exist/u,
    },
    {
      name: 'DEGENERATE: the handler key cannot be found in its file',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/renamed': { get: { parameters: [{ name: 'tag', in: 'query' }] } },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/renamed-handlers.ts',
          'export function makeRenamedHandlers() {\n  return {\n    other: async () => ({ status: 200, body: {} }),\n  };\n}\n'
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/renamed',
              handlerFile: 'pillars/purchases/src/api/rest/renamed-handlers.ts',
              handlerKey: 'list',
            },
          ],
        };
      },
      expect: /could not locate a parseable handler entry/u,
    },
    {
      name: 'DEGENERATE: the discovery floor catches a collapsed OpenAPI file',
      arrange: (root) => {
        writeFile(
          root,
          OPENAPI_REL_PATH,
          JSON.stringify({ openapi: '3.1.0', info: { title: 'fixture', version: '0' }, paths: {} })
        );
        return { routes: [] };
      },
      expect: /under this guard's floor/u,
    },
    {
      // The real media `libraryService.listLibrary(db, query)` shape:
      // `query` as the SECOND of two positional arguments, through a
      // property access on an imported namespace object — not a
      // sole-argument, bare-identifier call.
      name: 'PASSING TWIN: a namespace-qualified call passes query as a non-first positional argument',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/namespace-check': {
            get: {
              parameters: [
                { name: 'type', in: 'query' },
                { name: 'genre', in: 'query' },
              ],
            },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/db-index.ts',
          "export * as libraryService from './services/library-service.js';\n"
        );
        writeFile(
          root,
          'pillars/purchases/src/services/library-service.ts',
          [
            'export function listLibrary(db, input) {',
            '  return { type: input.type, genre: input.genre };',
            '}',
            '',
          ].join('\n')
        );
        writeFile(
          root,
          'pillars/purchases/src/api/rest/namespace-handlers.ts',
          [
            "import { libraryService } from '../../db-index.js';",
            '',
            'export function makeNamespaceHandlers(db) {',
            '  return {',
            '    check: async ({ query }) => ({',
            '      status: 200,',
            '      body: libraryService.listLibrary(db, query),',
            '    }),',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/namespace-check',
              handlerFile: 'pillars/purchases/src/api/rest/namespace-handlers.ts',
              handlerKey: 'check',
            },
          ],
        };
      },
      expect: null,
    },
    {
      name: 'ADVERSARIAL: a namespace-qualified resolver that stops reading a field is still caught',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/namespace-check': {
            get: {
              parameters: [
                { name: 'type', in: 'query' },
                { name: 'genre', in: 'query' },
              ],
            },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/db-index.ts',
          "export * as libraryService from './services/library-service.js';\n"
        );
        writeFile(
          root,
          'pillars/purchases/src/services/library-service.ts',
          [
            'export function listLibrary(db, input) {',
            '  return { type: input.type };',
            '}',
            '',
          ].join('\n')
        );
        writeFile(
          root,
          'pillars/purchases/src/api/rest/namespace-handlers.ts',
          [
            "import { libraryService } from '../../db-index.js';",
            '',
            'export function makeNamespaceHandlers(db) {',
            '  return {',
            '    check: async ({ query }) => ({',
            '      status: 200,',
            '      body: libraryService.listLibrary(db, query),',
            '    }),',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/namespace-check',
              handlerFile: 'pillars/purchases/src/api/rest/namespace-handlers.ts',
              handlerKey: 'check',
            },
          ],
        };
      },
      expect: /field 'genre'/u,
    },
    {
      // The real food `resolveForLine(db, query)` shape: a PLAIN
      // (non-namespace) resolver called with `query` as the second of two
      // positional arguments — the same non-first-argument case as the
      // namespace-qualified one above, without a namespace object in play.
      name: 'PASSING TWIN: a plain (non-namespace) call passes query as a non-first positional argument',
      arrange: (root) => {
        writeBaseOpenapi(root, {
          '/resolve-line-check': {
            get: { parameters: [{ name: 'lineIndex', in: 'query' }] },
          },
        });
        writeFile(
          root,
          'pillars/purchases/src/api/rest/resolve-line-scope.ts',
          [
            'export function resolveForLine(db, args) {',
            '  return { lineIndex: args.lineIndex };',
            '}',
            '',
          ].join('\n')
        );
        writeFile(
          root,
          'pillars/purchases/src/api/rest/resolve-line-handlers.ts',
          [
            "import { resolveForLine } from './resolve-line-scope.js';",
            '',
            'export function makeResolveLineHandlers(db) {',
            '  return {',
            '    check: async ({ query }) => ({',
            '      status: 200,',
            '      body: resolveForLine(db, query),',
            '    }),',
            '  };',
            '}',
            '',
          ].join('\n')
        );
        return {
          routes: [
            ...fillerRoutes(root),
            {
              method: 'get',
              path: '/resolve-line-check',
              handlerFile: 'pillars/purchases/src/api/rest/resolve-line-handlers.ts',
              handlerKey: 'check',
            },
          ],
        };
      },
      expect: null,
    },
  ];
}

/** @returns {boolean} */
function runSelfTest() {
  const cases = selfTestCases();
  let failures = 0;

  for (const testCase of cases) {
    const root = mkdtempSync(join(tmpdir(), 'query-schema-reads-'));
    try {
      const { routes, allowlist } = testCase.arrange(root);
      const violations = collectViolations(root, routes, allowlist ?? []);
      const joined = violations.join('\n');
      const ok = testCase.expect === null ? violations.length === 0 : testCase.expect.test(joined);
      if (ok) {
        console.log(`  ok   ${testCase.name}`);
      } else {
        failures += 1;
        console.error(`  FAIL ${testCase.name}`);
        console.error(
          testCase.expect === null
            ? `       expected a clean tree, got:\n${joined}`
            : `       expected a violation matching ${String(testCase.expect)}, got:\n${
                joined === '' ? '       (nothing — the guard reported clean)' : joined
              }`
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log(
    `\n${String(cases.length - failures)}/${String(cases.length)} self-test cases passed.`
  );
  return failures === 0;
}

const HELP = `check-query-schema-reads — every contract query field a route advertises must be read (POPS-2379).

  --self-test  Run the adversarial matrix, including both historical POPS-1966/POPS-1849 shapes.
  --help       This text.
`;

function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--self-test' && a !== '--help');
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(', ')}\n\n${HELP}`);
    process.exit(2);
  }
  if (args.includes('--help')) {
    console.log(HELP);
    return;
  }
  if (args.includes('--self-test')) {
    process.exit(runSelfTest() ? 0 : 1);
  }

  /** @type {string[]} */
  const violations = [];
  let totalRoutes = 0;
  for (const pillar of PILLARS) {
    const pillarViolations = collectViolations(repoRoot, pillar.routes, pillar.allowlist, {
      openapiRelPath: pillar.openapiRelPath,
      minRoutesWithFields: pillar.minRoutesWithFields,
    });
    violations.push(...pillarViolations.map((v) => `[${pillar.name}] ${v}`));
    totalRoutes += pillar.routes.length;
  }

  if (violations.length > 0) {
    console.error('unread query-schema fields — violations:\n');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(`\n${String(violations.length)} violation(s). See POPS-2379 / POPS-3484.`);
    process.exit(1);
  }
  console.log(
    `OK — every query field on ${String(totalRoutes)} known route(s) across ${String(PILLARS.length)} ` +
      `pillar(s) (${PILLARS.map((p) => p.name).join(', ')}) is read or allowlisted.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
