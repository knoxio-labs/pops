#!/usr/bin/env node
/**
 * Backend cross-pillar expectation guard.
 *
 * A pillar's SERVER calls a sibling through the `@pops/pillar-sdk` proxy,
 * which is typed by the CALLER: `pillar<TRouter>('finance')` accepts
 * whatever router type the consumer declares, and resolves the call at
 * runtime by matching the property chain against an `operationId` in the
 * producer's published OpenAPI. Nothing checks the two agree. A producer
 * that renames an operation, moves a path, or renames a parameter breaks
 * the consumer silently, at runtime, in production.
 *
 * The frontend equivalent of this seam is gated by regenerating a client
 * and diffing it (`cross-pillar-clients` in quality.yml). There is no
 * codegen on the backend side to diff, so this guard asserts the narrow
 * thing the consumer actually depends on instead: that the operation still
 * exists, at the path and method expected, carrying the query parameters
 * the consumer sends and the path parameters it substitutes.
 *
 * Deliberately NOT a vendored copy of the producer's whole spec. Finance's
 * document is 17k lines describing its entire API; vendoring it to pin one
 * operation would mean a change to any unrelated finance route failing this
 * consumer's drift check, which is the kind of noise that teaches people to
 * re-vendor without reading.
 *
 * FOUR HALVES, and the second through fourth are the ones that keep the
 * first honest:
 *
 *   1. `EXPECTATIONS` is curated. Each row pins one OPERATION a consumer
 *      depends on (`consumer`, `producer`, `operationId`), and is checked
 *      against the producer's OpenAPI on disk.
 *   2. Coverage is DISK-DERIVED, and per OPERATION, not per seam. Every
 *      `pillar(...)` call site under `pillars/<consumer>/{src,scripts}` is
 *      enumerated from source; its generic type argument (the router type
 *      the caller declares, e.g. `pillar<ContactsRouter>(...)`) is parsed
 *      for the `domain.method` operations it exposes — see "OPERATION
 *      RESOLUTION" below — and EACH one is matched to its own row. A row
 *      pinning `finance -> registry (users.get)` does not cover a second,
 *      different call to `finance -> registry (entities.list)`: each
 *      operation on a seam needs its own row, so a producer breaking one
 *      operation cannot hide behind another operation's row on the same
 *      seam going unguarded while the guard reports OK — the failure mode
 *      ADR-045 exists to prevent, and the one this guard shipped with.
 *   3. Operation resolution can fail to find what it is looking for — an
 *      unfamiliar shape, an imported router type, a call through a wrapper
 *      whose second argument this scanner does not follow. That is reported
 *      as its own failure category rather than silently trusted as covered
 *      or silently dropped; see "OPERATION RESOLUTION" below for the exact
 *      shape this needs and what falls outside it.
 *   4. Direct `fetch` is enumerated too. A consumer that hand-rolls the HTTP
 *      call instead of using the proxy has no `operationId` to pin and is
 *      invisible to (2) — the guard would print OK over a seam it cannot see,
 *      which is (1)'s failure mode wearing a different hat. A file that
 *      speaks the pillar federation (see `FEDERATION_SIGNALS`) and calls
 *      `fetch` itself is reported unless `SANCTIONED_DIRECT_FETCH` excuses it.
 *
 * OPERATION RESOLUTION. A call site's first argument names the PRODUCER; its
 * generic type argument names the OPERATIONS, because every router type in
 * this tree is written the same narrow way — a local `type` or `interface`
 * literal, one level of domain keys nesting one level of method keys, each
 * method a property (arrow-typed or aliased to a named function type, never
 * method-shorthand): `type ContactsRouter = { entities: { list: (input) =>
 * ...; get: (input) => ...; }; }` resolves to `entities.list` and
 * `entities.get`. That type is DECLARED IN THE SAME FILE as the call site in
 * every instance in this tree today (`resolveRouterOperations` does not look
 * elsewhere), which is also what makes the type trustworthy as an
 * enumeration: every router type here is documented, at its declaration, as
 * "the subset of the producer's router THIS FILE calls" — so treating its
 * keys as the full operation list is not a guess, it is reading what the
 * consumer already asserts about itself. A call site whose type argument is
 * a bare generic parameter (the MCP bridge's `pillar<TRouter>`), or absent,
 * or shaped some other way this parser does not model, resolves to no
 * operations and is REPORTED — not silently treated as covered by whatever
 * row happens to share its seam, which is the exact hole this guard used to
 * have. `KNOWN_BROKEN_OPERATIONS` is the narrow escape hatch for the one
 * case that isn't a scanner limitation: a resolved operation whose producer
 * has already dropped it, where pinning it would fail `checkExpectations`
 * forever until an unrelated business-logic fix lands — see that list's own
 * doc comment.
 *
 * A call site whose target pillar is not a literal (a runtime dispatcher
 * such as the MCP bridge or the orchestrator's search fan-out) cannot be
 * pinned to an operation. Those are named in `UNPINNABLE_CALL_SITES` with a
 * reason; an entry there whose file no longer holds a call site is itself a
 * failure, so the exemption list cannot outlive what it excuses. The same
 * rule governs `SANCTIONED_DIRECT_FETCH`.
 *
 * A pillar can also reach a sibling through a REGISTERED WRAPPER instead of
 * calling `pillar()` directly — bfm's `PillarGateway.call` is the only one in
 * the tree, forwarding its first argument straight into `pillar()` one
 * function down, where the id is a parameter and therefore invisible to this
 * scanner. `PILLAR_CALL_WRAPPERS` names the wrapper's type and method so
 * discovery follows it there instead: an identifier annotated with the
 * registered type, called as `<name>.<method>(<producerId>, ...)`, is the
 * same call site as a literal `pillar(<producerId>)`. Wrappers are matched by
 * REGISTRATION, not by inferring "this looks like one" from shape — an
 * inferred match is exactly the kind of matcher that models one spelling and
 * drifts silently as others appear. `checkWrapperRegistrations` keeps the
 * list honest: an entry whose type is no longer declared where it says it is
 * fails the build, the same way a stale `UNPINNABLE_CALL_SITES` entry does.
 *
 * Source is matched as text, not parsed: this guard runs in a CI job with no
 * `pnpm install` (see ADR-045's stated exception), so no TypeScript parser is
 * on disk when it executes. The scanner models comments, strings, template
 * literals and regex literals so a `pillar(` inside any of them is not a call
 * site, and it reports rather than passes when it ends a file in a state it
 * cannot explain.
 *
 * Usage:
 *   node scripts/ci/check-cross-pillar-expectations.mjs
 *   node scripts/ci/check-cross-pillar-expectations.mjs --self-test
 *
 * Exit 0 = every expectation holds, every operation a call site resolves to
 *          is pinned or excused, and no federation-aware file hand-rolls its
 *          HTTP.
 * Exit 1 = a producer contract moved, or an operation is unguarded.
 * Exit 2 = usage error.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * @typedef {object} Expectation
 * @property {string} consumer   Pillar whose server makes the call.
 * @property {string} producer   Pillar that publishes the contract.
 * @property {string} operationId The SDK resolves a property chain to this.
 * @property {string} path       Expected path in the producer's OpenAPI.
 * @property {string} method     Expected HTTP method, lowercase.
 * @property {string[]} query    Query parameters the consumer sends.
 * @property {string[]} [pathParams] Path parameters the consumer fills in.
 * @property {string} usedBy     Where the consumer's call lives.
 */

/**
 * Every backend-to-backend expectation in the fleet.
 *
 * Add a row when a pillar's server starts calling another's REST API. The
 * row is the machine-checkable half of what the consumer's local router
 * type claims. The coverage check below fails the build if you forget.
 */
export const EXPECTATIONS = [
  {
    consumer: 'purchases',
    producer: 'finance',
    operationId: 'transactions.list',
    path: '/transactions',
    method: 'get',
    query: ['startDate', 'endDate', 'search', 'limit', 'offset'],
    usedBy: 'pillars/purchases/src/api/finance/client.ts',
  },
  {
    consumer: 'purchases',
    producer: 'inventory',
    operationId: 'items.get',
    path: '/items/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/purchases/src/api/cron/pillar-lookup.ts',
  },
  {
    consumer: 'purchases',
    producer: 'inventory',
    operationId: 'items.create',
    path: '/items',
    method: 'post',
    // The whole payload is a body, which this guard does not model. What it
    // can pin is that the operation still exists as a POST on the collection
    // — the leg that turns an accepted fan-out proposal into an asset, and
    // the only call in the fleet that writes into a pillar the caller does
    // not own.
    query: [],
    usedBy: 'pillars/purchases/src/api/inventory/client.ts',
  },
  {
    consumer: 'purchases',
    producer: 'documents',
    operationId: 'paperless.get',
    path: '/paperless/documents/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/purchases/src/api/cron/pillar-lookup.ts',
  },
  {
    consumer: 'purchases',
    producer: 'contacts',
    operationId: 'entities.list',
    path: '/entities',
    method: 'get',
    // The merchant resolver sends a search seed and a candidate cap, then
    // refuses to guess when more than one candidate qualifies. Losing
    // `search` widens that to an unfiltered first page, where "more than one
    // candidate" is always true and every receipt silently resolves to no
    // merchant.
    query: ['search', 'limit'],
    usedBy: 'pillars/purchases/src/api/contacts/merchant.ts',
  },
  {
    consumer: 'bfm',
    producer: 'finance',
    operationId: 'transactions.list',
    path: '/transactions',
    method: 'get',
    // `beforeDate`/`beforeId` are the keyset anchor the mobile cursor decodes
    // to. Losing either one on the producer side turns a stable scroll into an
    // unfiltered first page served over and over, with a 200 every time.
    query: ['limit', 'beforeDate', 'beforeId'],
    usedBy: 'pillars/bfm/src/api/finance/client.ts',
  },
  {
    consumer: 'bfm',
    producer: 'finance',
    operationId: 'transactions.get',
    path: '/transactions/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/bfm/src/api/finance/client.ts',
  },
  {
    consumer: 'bfm',
    producer: 'purchases',
    operationId: 'receipt.upload',
    path: '/receipts',
    method: 'post',
    // The whole request is the body: the parts the handset captured, sent
    // through unchanged so purchases' content-addressed dedup still sees the
    // same bytes on a retry.
    query: [],
    usedBy: 'pillars/bfm/src/api/purchases/client.ts',
  },
  {
    consumer: 'finance',
    producer: 'contacts',
    operationId: 'entities.list',
    path: '/entities',
    method: 'get',
    // `offset` is the paging leg of a sweep with a page cap: without it the
    // sweep re-reads page one until the cap and reports a truncated set as a
    // complete one.
    query: ['search', 'type', 'limit', 'offset'],
    usedBy: 'pillars/finance/src/api/contacts/client.ts',
  },
  {
    consumer: 'finance',
    producer: 'contacts',
    operationId: 'entities.get',
    path: '/entities/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/finance/src/api/contacts/client.ts',
  },
  {
    consumer: 'finance',
    producer: 'contacts',
    operationId: 'entities.create',
    path: '/entities',
    method: 'post',
    query: [],
    usedBy: 'pillars/finance/src/api/contacts/client.ts',
  },
  {
    consumer: 'finance',
    producer: 'contacts',
    operationId: 'entities.create',
    path: '/entities',
    method: 'post',
    query: [],
    usedBy: 'pillars/finance/scripts/migrate-core-entities.ts',
  },
  {
    consumer: 'finance',
    producer: 'registry',
    operationId: 'users.get',
    path: '/users',
    method: 'get',
    // URI-in / URI-out. The cron folds the CallResult kinds into its own
    // vocabulary, so a dropped `uri` reads as "every owner is unknown" and
    // reconciliation quietly orphans rows it should have kept.
    query: ['uri'],
    usedBy: 'pillars/finance/src/api/cron/pillar-lookup.ts',
  },
  {
    consumer: 'inventory',
    producer: 'documents',
    operationId: 'paperless.status',
    path: '/paperless/status',
    method: 'get',
    query: [],
    usedBy: 'pillars/inventory/src/api/documents/client.ts',
  },
  {
    consumer: 'inventory',
    producer: 'documents',
    operationId: 'paperless.search',
    path: '/paperless/search',
    method: 'get',
    query: ['query'],
    usedBy: 'pillars/inventory/src/api/documents/client.ts',
  },
  {
    consumer: 'ai',
    producer: 'cerebrum',
    operationId: 'nudges.create',
    path: '/nudges',
    method: 'post',
    query: [],
    usedBy: 'pillars/ai/src/api/modules/ai-alerts/dispatchers/nudge.ts',
  },
  {
    consumer: 'food',
    producer: 'lists',
    operationId: 'list.get',
    path: '/lists/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/food/src/api/modules/recipes/send-to-list/lists-client.ts',
  },
  {
    consumer: 'food',
    producer: 'lists',
    operationId: 'list.create',
    path: '/lists',
    method: 'post',
    query: [],
    usedBy: 'pillars/food/src/api/modules/recipes/send-to-list/lists-client.ts',
  },
  {
    consumer: 'food',
    producer: 'lists',
    operationId: 'items.upsertByRef',
    path: '/lists/{listId}/items/upsert-by-ref',
    method: 'post',
    query: [],
    // The merge-or-insert leg send-to-list retries against. Losing `listId`
    // leaves the literal placeholder in the URL, and the 404 that follows
    // reads as "that list is gone" rather than "this client is broken".
    pathParams: ['listId'],
    usedBy: 'pillars/food/src/api/modules/recipes/send-to-list/lists-client.ts',
  },
  {
    consumer: 'food',
    producer: 'lists',
    operationId: 'items.add',
    path: '/lists/{listId}/items',
    method: 'post',
    query: [],
    pathParams: ['listId'],
    usedBy: 'pillars/food/src/api/modules/recipes/send-to-list/lists-client.ts',
  },
  {
    consumer: 'food',
    producer: 'lists',
    operationId: 'items.search',
    path: '/items',
    method: 'get',
    // How send-to-list decides a recipe has already been sent. Dropping
    // `notesContains` widens the search to every shopping item in the fleet,
    // where "already sent" is always true and nothing is ever sent again.
    query: ['kind', 'notesContains'],
    usedBy: 'pillars/food/src/api/modules/recipes/send-to-list/lists-client.ts',
  },
  {
    consumer: 'cerebrum',
    producer: 'finance',
    operationId: 'transactions.get',
    path: '/transactions/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/cerebrum/src/api/modules/retrieval/peer-clients.ts',
  },
  {
    consumer: 'cerebrum',
    producer: 'finance',
    operationId: 'transactions.list',
    path: '/transactions',
    method: 'get',
    // `offset` is the paging leg of the cross-source embedding sweep: without
    // it the indexer re-reads page one until `hasMore` says otherwise, which
    // it never does.
    query: ['limit', 'offset'],
    usedBy: 'pillars/cerebrum/src/api/modules/retrieval/peer-clients.ts',
  },
  {
    consumer: 'cerebrum',
    producer: 'media',
    operationId: 'movies.get',
    path: '/movies/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/cerebrum/src/api/modules/retrieval/peer-clients.ts',
  },
  {
    consumer: 'cerebrum',
    producer: 'media',
    operationId: 'movies.list',
    path: '/movies',
    method: 'get',
    query: ['limit', 'offset'],
    usedBy: 'pillars/cerebrum/src/api/modules/retrieval/peer-clients.ts',
  },
  {
    consumer: 'cerebrum',
    producer: 'media',
    operationId: 'tvShows.get',
    path: '/tv-shows/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/cerebrum/src/api/modules/retrieval/peer-clients.ts',
  },
  {
    consumer: 'cerebrum',
    producer: 'media',
    operationId: 'tvShows.list',
    path: '/tv-shows',
    method: 'get',
    query: ['limit', 'offset'],
    usedBy: 'pillars/cerebrum/src/api/modules/retrieval/peer-clients.ts',
  },
  {
    consumer: 'cerebrum',
    producer: 'inventory',
    operationId: 'items.get',
    path: '/items/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/cerebrum/src/api/modules/retrieval/peer-clients.ts',
  },
  {
    consumer: 'cerebrum',
    producer: 'inventory',
    operationId: 'items.list',
    path: '/items',
    method: 'get',
    query: ['limit', 'offset'],
    usedBy: 'pillars/cerebrum/src/api/modules/retrieval/peer-clients.ts',
  },
];

/**
 * @typedef {object} UnpinnableCallSite
 * @property {string} file   Repo-relative path holding the call site(s).
 * @property {string} reason Why no expectation row can exist for it.
 */

/**
 * Call sites that resolve their target pillar at runtime.
 *
 * The whole FILE is excused, not one line, because these are thin
 * dispatchers whose entire job is to forward a pillar id chosen elsewhere.
 * Keep them that way: a pinnable call added to one of these files inherits
 * the exemption. Everything here must still hold a call site, or the entry
 * is stale and the guard says so.
 */
export const UNPINNABLE_CALL_SITES = [
  {
    file: 'pillars/mcp/src/pillar-client.ts',
    reason:
      'MCP bridge: the pillar id comes from the tool invocation, so the set of ' +
      'operations reached through it is whatever the LLM asked for.',
  },
  {
    file: 'pillars/orchestrator/src/search/federation.ts',
    reason:
      'Search fan-out over the live registry snapshot: the target set is every ' +
      'search-capable pillar at runtime, and the one operation it calls is the ' +
      'shared `search.search` every member publishes.',
  },
  {
    file: 'pillars/shell/src/app/pages/settings-page/useTestActionHandler.ts',
    reason:
      'Shell is the browser SPA, not a pillar server. It dispatches a settings ' +
      'test action described by a runtime manifest via `callDynamic`, so both the ' +
      'pillar and the procedure are data.',
  },
  {
    file: 'pillars/shell/src/components/settings/section-renderer/useDynamicOptionsLoaders.ts',
    reason:
      'Shell is the browser SPA, not a pillar server. Settings option loaders are ' +
      'declared by a runtime manifest and invoked via `callDynamic`, so both the ' +
      'pillar and the procedure are data.',
  },
];

/**
 * @typedef {object} KnownBrokenOperation
 * @property {string} consumer
 * @property {string} producer
 * @property {string} operationId
 * @property {string} reason
 */

/**
 * Operations that operation-level coverage (see "OPERATION RESOLUTION" above)
 * resolves from a call site's router type, where a producer has already
 * dropped the operation — pinning it with an `EXPECTATIONS` row would fail
 * `checkExpectations` immediately and PERMANENTLY, for a reason this guard
 * did not introduce and a coverage check cannot fix. That is a different
 * failure shape from everything else this file excuses: `UNPINNABLE_CALL_SITES`
 * is for a target that cannot be known; this is for a target that is known
 * and already wrong, where the fix is a change to the CALLER's business
 * logic, not to this guard.
 *
 * Narrow on purpose, the same as every other exemption list here: an entry
 * names one exact `(consumer, producer, operationId)`, not a file or a seam,
 * so it cannot accidentally swallow some OTHER operation the same call site
 * resolves. And it self-audits — an entry no longer produced by resolving
 * any live call site's router type is stale and fails the build, the same
 * way a stale `UNPINNABLE_CALL_SITES` entry does, so this cannot outlive the
 * bug it excuses either.
 */
export const KNOWN_BROKEN_OPERATIONS = [
  {
    consumer: 'finance',
    producer: 'registry',
    operationId: 'entities.list',
    reason:
      "pillars/finance/scripts/migrate-core-entities.ts's readAllCoreEntities() resolves to " +
      'this operation through its local CoreRouter type, but registry dropped its /entities ' +
      'surface once contacts became authoritative for entities (asserted by ' +
      'pillars/registry/src/contract/__tests__/openapi.test.ts). Repointing or retiring that ' +
      'script is a change to one-shot migration business logic, not to this guard, so it is ' +
      'tracked as its own piece of work rather than folded into a coverage-granularity fix.',
  },
];

/**
 * @typedef {object} SanctionedDirectFetch
 * @property {string} file   Repo-relative path holding the `fetch` call(s).
 * @property {string} reason Why the SDK proxy is not the right transport here.
 */

/**
 * Federation-aware files allowed to call `fetch` themselves.
 *
 * The bar is not "this call is fine", it is "no `operationId` could pin it
 * even if it went through the proxy": the target is chosen at runtime, or the
 * endpoint is not part of any pillar's published contract. A cross-pillar read
 * that COULD be a `pillar('<id>').domain.op(...)` call does not belong here —
 * it belongs in `EXPECTATIONS`.
 *
 * As with `UNPINNABLE_CALL_SITES`, an entry that no longer describes a real
 * call site fails the build, so the list cannot outlive what it excuses.
 */
export const SANCTIONED_DIRECT_FETCH = [
  {
    file: 'pillars/registry/src/api/pillars/dispatcher.ts',
    reason:
      'Cross-pillar URI dispatch: the owning pillar comes out of the registry at ' +
      'request time and every pillar answers the same `POST /uri/resolve`, so the ' +
      'target is data and there is one operation, not a seam per consumer.',
  },
  {
    file: 'pillars/registry/src/api/pillars/health-probe.ts',
    reason:
      'Health fan-out over the live registry: `GET /health` is served outside the ' +
      'ts-rest contract (it must answer before the contract is mounted), so it has ' +
      'no operationId in any producer OpenAPI to pin.',
  },
  {
    file: 'pillars/shell/src/app/pillars/pillar-registry-client.ts',
    reason:
      'Shell is the browser SPA, not a pillar server. It fetches same-origin ' +
      '`/pillars` and `/pillars/health` through its own nginx, and never opens a ' +
      'browser-to-pillar connection — the container base URLs do not resolve there.',
  },
];

/**
 * What marks a file as speaking the pillar federation.
 *
 * Narrow on purpose. The signal is not "this file calls an HTTP API" — half
 * the media and ai pillars do, against TMDB and Ollama, and reporting those
 * would buy a sanction entry per external integration and teach people to add
 * them without reading. It is "this file knows about OTHER PILLARS": it parses
 * the fleet's base-URL format, handles registry entries, or reads the pillar
 * roster. That is what a hand-rolled cross-pillar call needs in order to know
 * where to send the request, and it is what both seams this check was written
 * for had (POPS-1671).
 *
 * The limit, stated rather than discovered later: a hand-rolled call that gets
 * its target from somewhere else entirely — a bespoke `LISTS_URL` env var, a
 * hardcoded container host — carries none of these signals and is not caught.
 */
const FEDERATION_SIGNALS = [
  {
    pattern: /@pops\/pillar-sdk\/pillar-env/u,
    describes: "imports the fleet's pillar base-URL parser",
  },
  { pattern: /(?<![\w$])PillarRegistryEntry(?![\w$])/u, describes: 'handles registry entries' },
  { pattern: /(?<![\w$])POPS_PILLARS(?![\w$])/u, describes: 'reads the pillar roster' },
];

/**
 * @typedef {object} PillarCallWrapper
 * @property {string} typeName  Interface/type whose method forwards to `pillar()`.
 * @property {string} method    Method that takes the producer id as its first argument.
 * @property {string} definedIn Repo-relative file declaring `typeName`, checked for staleness.
 */

/**
 * Wrapper functions discovery follows in addition to a literal `pillar(...)`.
 *
 * A call site earns discovery by being named here, not by looking like one:
 * `checkWrapperRegistrations` below keeps the list honest by failing when an
 * entry's `typeName` is no longer declared in `definedIn`, the same way
 * `UNPINNABLE_CALL_SITES` cannot outlive what it excuses.
 */
export const PILLAR_CALL_WRAPPERS = [
  {
    typeName: 'PillarGateway',
    method: 'call',
    definedIn: 'pillars/bfm/src/api/pillars/gateway.ts',
  },
];

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '__tests__', 'generated']);

/**
 * Keywords a `/` can legally follow and still open a regex literal.
 *
 * Everything else ending in a word character is a value, so the `/` after it
 * divides. Without this list `return /x/` reads as division and the regex
 * body gets scanned as code — which is how a `//` inside a pattern would
 * blank the rest of a line and hide whatever came after it.
 */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

/**
 * @typedef {object} ScannedSource
 * @property {string} code      Comments blanked; string bodies intact.
 * @property {string} scannable Comments AND literal bodies blanked.
 * @property {string | null} unterminated Why the scan lost its place, if it did.
 */

/**
 * Scan a TypeScript source into the two views this guard needs.
 *
 * Both views keep the original offsets — characters are replaced with
 * spaces, never removed — so a position found in one indexes the other, and
 * a reported line number points at the real file.
 *
 * `scannable` is where the `pillar` token is looked for: comment prose and
 * literal bodies are blanked there, so neither `// pillar('x')` nor
 * `` `${n} pillar(s) inspected` `` is mistaken for a call. `code` keeps
 * string bodies so the resolved argument can be read back out of it.
 *
 * When the scan ends somewhere it cannot explain — an unclosed comment,
 * string, template or regex — that is REPORTED. A desynced scanner blanks
 * real code and reports a clean repo, which is the failing-quiet direction
 * ADR-045 is about.
 *
 * @param {string} source
 * @returns {ScannedSource}
 */
export function scanSource(source) {
  // `split('')` and not `[...source]`: the spread iterates CODE POINTS, so a
  // single astral character (an emoji in a UI string, say) becomes one array
  // element while `source[i]` still advances by code unit. Every offset after
  // it would then be off by one, which is how a `/` in the middle of a
  // division ends up read as a regex opener and the rest of the file goes
  // dark.
  const code = source.split('');
  const scannable = source.split('');
  /** @type {Array<{ kind: 'template' | 'interp', depth: number }>} */
  const frames = [];
  let mode = 'code';
  let i = 0;

  const blankBoth = (from, to) => {
    for (let k = from; k < to; k++) {
      if (code[k] === '\n') continue;
      code[k] = ' ';
      scannable[k] = ' ';
    }
  };
  const blankLiteral = (from, to) => {
    for (let k = from; k < to; k++) if (scannable[k] !== '\n') scannable[k] = ' ';
  };
  const done = (unterminated) => ({
    code: code.join(''),
    scannable: scannable.join(''),
    unterminated,
  });

  while (i < source.length) {
    const c = source[i];
    const d = source[i + 1];

    if (mode === 'line') {
      if (c === '\n') mode = 'code';
      else blankBoth(i, i + 1);
      i++;
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && d === '/') {
        blankBoth(i, i + 2);
        mode = 'code';
        i += 2;
        continue;
      }
      blankBoth(i, i + 1);
      i++;
      continue;
    }
    if (mode === 'single' || mode === 'double') {
      if (c === '\\') {
        blankLiteral(i, i + 2);
        i += 2;
        continue;
      }
      if (c === '\n') return done('string literal');
      if ((mode === 'single' && c === "'") || (mode === 'double' && c === '"')) {
        mode = 'code';
        i++;
        continue;
      }
      blankLiteral(i, i + 1);
      i++;
      continue;
    }
    if (mode === 'regex' || mode === 'regex-class') {
      if (c === '\\') {
        blankLiteral(i, i + 2);
        i += 2;
        continue;
      }
      if (c === '\n') return done('regex literal');
      if (mode === 'regex' && c === '[') mode = 'regex-class';
      else if (mode === 'regex-class' && c === ']') mode = 'regex';
      else if (mode === 'regex' && c === '/') {
        mode = 'code';
        i++;
        continue;
      }
      blankLiteral(i, i + 1);
      i++;
      continue;
    }
    if (mode === 'template') {
      if (c === '\\') {
        blankLiteral(i, i + 2);
        i += 2;
        continue;
      }
      if (c === '$' && d === '{') {
        frames.push({ kind: 'interp', depth: 0 });
        mode = 'code';
        i += 2;
        continue;
      }
      if (c === '`') {
        frames.pop();
        mode = frames.at(-1)?.kind === 'template' ? 'template' : 'code';
        i++;
        continue;
      }
      blankLiteral(i, i + 1);
      i++;
      continue;
    }

    if (c === '/' && d === '/') {
      blankBoth(i, i + 2);
      mode = 'line';
      i += 2;
      continue;
    }
    if (c === '/' && d === '*') {
      blankBoth(i, i + 2);
      mode = 'block';
      i += 2;
      continue;
    }
    if (c === '/' && opensRegexAt(code, i)) {
      mode = 'regex';
      i++;
      continue;
    }
    if (c === "'") {
      mode = 'single';
      i++;
      continue;
    }
    if (c === '"') {
      mode = 'double';
      i++;
      continue;
    }
    if (c === '`') {
      frames.push({ kind: 'template', depth: 0 });
      mode = 'template';
      i++;
      continue;
    }
    const top = frames.at(-1);
    if (top?.kind === 'interp') {
      if (c === '{') top.depth++;
      else if (c === '}') {
        if (top.depth === 0) {
          frames.pop();
          mode = 'template';
          i++;
          continue;
        }
        top.depth--;
      }
    }
    i++;
  }

  if (mode === 'block') return done('block comment');
  if (mode === 'single' || mode === 'double') return done('string literal');
  if (mode === 'regex' || mode === 'regex-class') return done('regex literal');
  if (mode === 'template' || frames.length > 0) return done('template literal');
  return done(null);
}

/**
 * Whether the `/` at `index` opens a regex literal rather than dividing.
 *
 * Decided from what precedes it, which is the only thing available without a
 * parser: a regex can start only where a VALUE is expected. `<` is division
 * here on purpose — in a `.tsx` file the `/` of a `</div>` closing tag is
 * always preceded by one, and reading those as regex openers desynchronises
 * the scan across every component in the tree.
 *
 * Getting this wrong in the division direction can only produce a false call
 * site, which is loud. Getting it wrong the other way blanks real code, so
 * the ambiguous cases resolve towards division.
 *
 * @param {string[]} code Buffer scanned so far (comments already blanked).
 * @param {number} index
 * @returns {boolean}
 */
function opensRegexAt(code, index) {
  let i = index - 1;
  while (i >= 0 && /\s/u.test(code[i])) i--;
  if (i < 0) return true;

  const previous = code[i];
  if (previous === '>') return i > 0 && code[i - 1] === '=';
  if (previous === '<') return false;
  if (/[)\]}'"`]/u.test(previous)) return false;
  if (!/[\w$]/u.test(previous)) return true;

  let start = i;
  while (start >= 0 && /[\w$]/u.test(code[start])) start--;
  return REGEX_PRECEDING_KEYWORDS.has(code.slice(start + 1, i + 1).join(''));
}

/**
 * @typedef {object} RawCallSite
 * @property {string} argument First argument, verbatim and trimmed.
 * @property {string | null} typeArg Text of the generic type argument list
 *   (everything between `<` and `>`), verbatim and trimmed, or `null` when
 *   the call carries none.
 * @property {number} line     1-based line of the `pillar` token.
 */

/**
 * Every `pillar(...)` / `pillar<T>(...)` invocation in a scanned source.
 *
 * Matches the bare form as well as the generic one on purpose: a seam
 * written `const h: PillarHandle<X> = pillar(ID)` is the same seam, and
 * matching only `pillar<` would let it through unnoticed.
 *
 * @param {ScannedSource} scanned
 * @returns {RawCallSite[]}
 */
export function findPillarCalls(scanned) {
  return findCalls(scanned, /(?<![\w$.])pillar(?![\w$])/gu);
}

/**
 * Every raw HTTP call in a scanned source: `fetch(...)`, and the injected
 * `fetchImpl(...)` seam every hand-rolled client in this tree uses so its
 * tests can swap the transport.
 *
 * Unlike the pillar token, a leading `.` is ALLOWED: `globalThis.fetch(url)`
 * and `this.fetchImpl(url)` are the same raw call, and excluding them would
 * mean the check is defeated by the most obvious spelling of the thing it
 * looks for. A bare reference (`const f = globalThis.fetch`) is not matched —
 * only a call is, so a defaulted parameter is not mistaken for one.
 *
 * @param {ScannedSource} scanned
 * @returns {RawCallSite[]}
 */
export function findFetchCalls(scanned) {
  return findCalls(scanned, /(?<![\w$])fetch(?:Impl)?(?![\w$])/gu);
}

/**
 * Every `<name>.<method>(...)` invocation in a scanned source, for `name`
 * bound — by a `name: TypeName` annotation — to one of the registered wrapper
 * types.
 *
 * Keyed on the LOCAL identifier, not the type: this guard has no type
 * checker, so "this variable holds a `PillarGateway`" is read off the
 * annotation at its declaration, the same trust `resolveProducerId` places in
 * a module-level `const`. A same-named identifier elsewhere in the file that
 * is not really the wrapper would be misread as one — the trade text matching
 * always makes — but it only ever widens discovery, never narrows it.
 *
 * @param {ScannedSource} scanned
 * @param {PillarCallWrapper[]} wrappers
 * @returns {RawCallSite[]}
 */
export function findWrapperCalls(scanned, wrappers) {
  /** @type {RawCallSite[]} */
  const sites = [];
  for (const wrapper of wrappers) {
    const names = boundNames(scanned.scannable, wrapper.typeName);
    if (names.size === 0) continue;
    const alternation = [...names].map((name) => RegExp.escape(name)).join('|');
    const token = new RegExp(
      `(?<![\\w$.])(?:${alternation})(?![\\w$])\\s*\\.\\s*${RegExp.escape(wrapper.method)}(?![\\w$])`,
      'gu'
    );
    sites.push(...findCalls(scanned, token));
  }
  return sites;
}

/**
 * Local identifiers annotated `name: typeName` anywhere in a scanned source —
 * a function parameter or a variable declaration, which is how every wrapper
 * consumer in the tree binds one today.
 *
 * @param {string} scannable
 * @param {string} typeName
 * @returns {Set<string>}
 */
function boundNames(scannable, typeName) {
  const names = new Set();
  const pattern = new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*${RegExp.escape(typeName)}\\b`, 'gu');
  for (const match of scannable.matchAll(pattern)) names.add(match[1]);
  return names;
}

/**
 * Shared call-site finder: every invocation of `token` in a scanned source.
 *
 * @param {ScannedSource} scanned
 * @param {RegExp} token Global regex matching the callee name.
 * @returns {RawCallSite[]}
 */
function findCalls(scanned, token) {
  const { code, scannable } = scanned;
  /** @type {RawCallSite[]} */
  const sites = [];
  for (const match of scannable.matchAll(token)) {
    const start = match.index;
    let cursor = skipSpace(scannable, start + match[0].length);
    let typeArg = null;
    if (scannable[cursor] === '<') {
      const openAngle = cursor;
      const close = matchAngle(scannable, cursor);
      if (close === -1) continue;
      typeArg = code.slice(openAngle + 1, close).trim();
      cursor = skipSpace(scannable, close + 1);
    }
    if (scannable[cursor] !== '(') continue;
    const span = firstArgumentSpan(scannable, cursor);
    if (span === null) continue;
    sites.push({
      argument: code.slice(span.start, span.end).trim(),
      typeArg,
      line: lineOf(code, start),
    });
  }
  return sites;
}

function skipSpace(text, index) {
  let i = index;
  while (i < text.length && /\s/u.test(text[i])) i++;
  return i;
}

/**
 * Index of the `>` closing the type-argument list opened at `openIndex`.
 *
 * A `>` preceded by `=` is the tail of an arrow, not a closer — a generic
 * such as `pillar<() => void>(…)` would otherwise close one token early and
 * the call would be dropped without a word.
 *
 * @returns {number} -1 when no closer is found before the statement ends.
 */
function matchAngle(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const c = text[i];
    if (c === '<') depth++;
    else if (c === '>' && text[i - 1] !== '=') {
      depth--;
      if (depth === 0) return i;
    } else if (c === ';') return -1;
  }
  return -1;
}

/**
 * Offsets of the first argument inside the call opening at `openParenIndex`.
 *
 * @returns {{ start: number, end: number } | null}
 */
function firstArgumentSpan(text, openParenIndex) {
  let depth = 0;
  const start = openParenIndex + 1;
  for (let i = openParenIndex; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') {
      depth++;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return { start, end: i };
      continue;
    }
    if (c === ',' && depth === 1) return { start, end: i };
  }
  return null;
}

function lineOf(code, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (code[i] === '\n') line++;
  return line;
}

/**
 * Resolve a call's first argument to a pillar id, or `null` when it is not
 * decidable from this file alone.
 *
 * Two shapes are decidable: a string literal, and a MODULE-LEVEL `const`
 * bound to one (`export const CONTACTS_PILLAR_ID = 'contacts'`, which is how
 * every such call site in the tree is written). Anything else — a parameter,
 * an import, a `let`, a computed value — is a runtime dispatcher and needs an
 * exemption.
 *
 * The binding must start its line, so an identically named binding nested
 * inside some unrelated function cannot answer for a call site that is really
 * reading a parameter. That mistake would resolve to a plausible-looking
 * WRONG producer and pin the seam to a contract nobody calls — a quiet pass,
 * where refusing to resolve merely demands an exemption.
 *
 * @param {string} argument
 * @param {string} code Whole stripped file, for the module-level const lookup.
 * @returns {string | null}
 */
export function resolveProducerId(argument, code) {
  const literal = /^(['"])([^'"]*)\1$/u.exec(argument) ?? /^`([^`${\\]*)`$/u.exec(argument);
  if (literal) return literal[2] ?? literal[1];

  if (!/^[A-Za-z_$][\w$]*$/u.test(argument)) return null;
  // `$` is legal in an identifier and is a regex metacharacter, so the name
  // goes in escaped or `$ID` silently never matches its own binding.
  const binding = new RegExp(
    `^(?:export\\s+)?const\\s+${RegExp.escape(argument)}\\s*(?::[^=;]*)?=\\s*(['"])([^'"]*)\\1`,
    'mu'
  );
  const bound = binding.exec(code);
  return bound ? bound[2] : null;
}

/**
 * The first name in a generic argument list: `pillar<X>` yields `X`,
 * `gateway.call<X, unknown>` also yields `X` — the wrapper's second type
 * argument is the call's return type, never the router.
 *
 * The first argument is isolated by splitting on a comma at DEPTH 0 (not
 * inside `<>`/`()`/`[]`/`{}`), because a parameterised argument can itself
 * contain commas: `pillar<Record<string, unknown>>(...)` has one type
 * argument, not two. That isolated segment must then be nothing BUT a bare
 * identifier. A type argument written any other way — an inline object
 * literal, a function type, a parameterised type such as
 * `Record<string, unknown>` itself — is not how any router type is spelled
 * at a call site in this tree today, and returning `null` for it routes the
 * call into `resolveRouterOperations`'s "not found" leg rather than
 * guessing at a name that cannot be a local router type's.
 *
 * @param {string | null} typeArg
 * @returns {string | null}
 */
export function firstTypeArgName(typeArg) {
  if (typeArg === null) return null;
  let depth = 0;
  let end = typeArg.length;
  for (let i = 0; i < typeArg.length; i++) {
    const c = typeArg[i];
    if (c === '<' || c === '(' || c === '[' || c === '{') depth++;
    else if (c === '>' || c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && c === ',') {
      end = i;
      break;
    }
  }
  const first = typeArg.slice(0, end).trim();
  return /^[A-Za-z_$][\w$]*$/u.test(first) ? first : null;
}

/**
 * Index of the `}` matching the `{` at `openIndex`.
 *
 * @param {string} text
 * @param {number} openIndex
 * @returns {number} -1 when no closer is found.
 */
function matchBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * @typedef {object} TypeMember
 * @property {string} key
 * @property {number} valueStart Index into `body` where the value begins.
 * @property {number} valueEnd   Index into `body` one past the value.
 */

/**
 * Top-level `key: value` members of a type-literal body — the text strictly
 * between a type's outer `{` and its matching `}`.
 *
 * Depth-aware so a member's value can itself hold braces, parens, brackets
 * or generics (a nested object type, a function's parameter list, an array
 * type, `Promise<Result<A, B>>`) without those being mistaken for the
 * body's own closing punctuation — a comma inside `<A, B>` is not a member
 * separator. A member ends at the next `;` or `,` seen at the body's own
 * depth, or at the end of the body for a final member with no trailing
 * separator.
 *
 * Only the `key: value` property form is modelled (every router type in
 * this tree uses it — see "OPERATION RESOLUTION" in this file's header).
 * A key not followed by `:` — method-shorthand (`get(): Y`), a quoted or
 * computed key, or anything else this scanner does not recognise — aborts
 * the WHOLE parse and returns `null` rather than skipping just that member:
 * once one member's shape is unmodelled, later text originally meant as its
 * value (parameter names, return-type tokens) would otherwise be misread as
 * unrelated keys, silently manufacturing operations nobody declared. `null`
 * here, not a partial list, is what keeps that impossible — the direction
 * ADR-045 says a guard that cannot explain what it sees must take.
 *
 * @param {string} body
 * @returns {TypeMember[] | null}
 */
function typeLiteralMembers(body) {
  /** @type {TypeMember[]} */
  const members = [];
  let i = 0;
  while (i < body.length) {
    if (/\s/u.test(body[i]) || body[i] === ';' || body[i] === ',') {
      i++;
      continue;
    }
    if (!/[A-Za-z_$]/u.test(body[i])) {
      i++;
      continue;
    }
    const keyStart = i;
    while (i < body.length && /[\w$]/u.test(body[i])) i++;
    const key = body.slice(keyStart, i);
    while (i < body.length && /\s/u.test(body[i])) i++;
    if (body[i] === '?') i++;
    while (i < body.length && /\s/u.test(body[i])) i++;
    if (body[i] !== ':') return null;
    i++;
    const valueStart = i;
    let depth = 0;
    while (i < body.length) {
      const c = body[i];
      if (c === '{' || c === '(' || c === '[' || c === '<') depth++;
      else if (c === '}' || c === ')' || c === ']') depth--;
      // `>` closes a generic UNLESS it is the tail of `=>`: a method value
      // like `(input) => Promise<Result<A, B>>` opens two `<` (`Result` and
      // `Promise`'s) and the arrow's `>` must not be read as closing either
      // one, or the very next `>` (a real closer) reads as depth 0 and lets
      // the comma inside `<A, B>` end the member early. Same guard `matchAngle`
      // uses for the identical ambiguity at a call site's generic argument.
      else if (c === '>') {
        if (body[i - 1] !== '=') depth--;
      } else if (depth === 0 && (c === ';' || c === ',')) break;
      i++;
    }
    members.push({ key, valueStart, valueEnd: i });
  }
  return members;
}

/**
 * Locate the outer `{ ... }` of a `type`/`interface` declaration named
 * `typeName` in `scannable`.
 *
 * @param {string} scannable
 * @param {string} typeName
 * @returns {{ start: number, end: number } | null} Offsets of the body,
 *   exclusive of the braces themselves; `null` when no such object-literal
 *   declaration is found before the statement ends.
 */
function findTypeLiteralBody(scannable, typeName) {
  const declared = new RegExp(
    `\\b(?:export\\s+)?(?:type|interface)\\s+${RegExp.escape(typeName)}\\b`,
    'u'
  );
  const match = declared.exec(scannable);
  if (!match) return null;
  let i = match.index + match[0].length;
  while (i < scannable.length) {
    const c = scannable[i];
    if (c === '{') {
      const close = matchBrace(scannable, i);
      return close === -1 ? null : { start: i + 1, end: close };
    }
    if (c === ';') return null;
    i++;
  }
  return null;
}

/**
 * Every `domain.method` operation a router type declares, read structurally
 * from its own local declaration — see "OPERATION RESOLUTION" in this file's
 * header for why the type's keys are trusted as the operation list.
 *
 * Three things return `null`, and all are reported by the caller rather
 * than treated as "no operations": the type is not declared in `scannable`
 * at all (imported, misspelled, or not a bare identifier `firstTypeArgName`
 * could read off the call site); it is declared but not as an object type
 * literal (a union, a mapped type, a re-export of something else); or it IS
 * an object literal but a domain or method member is written in a shape
 * `typeLiteralMembers` does not model (method-shorthand, a quoted or
 * computed key) — see that function's own doc comment for why the whole
 * result is discarded rather than just the one member.
 *
 * A type found and parsed but genuinely empty (`type X = {}`) returns `[]`,
 * which the caller treats the same as `null` — a router with no operations
 * covers nothing, so there is no useful distinction between "couldn't find
 * any" and "found zero".
 *
 * @param {string} scannable
 * @param {string | null} typeName
 * @returns {string[] | null}
 */
export function resolveRouterOperations(scannable, typeName) {
  if (typeName === null) return null;
  const body = findTypeLiteralBody(scannable, typeName);
  if (body === null) return null;
  const outer = scannable.slice(body.start, body.end);
  const domains = typeLiteralMembers(outer);
  if (domains === null) return null;

  /** @type {string[]} */
  const operations = [];
  for (const domain of domains) {
    const value = outer.slice(domain.valueStart, domain.valueEnd);
    const firstNonSpace = value.search(/\S/u);
    if (firstNonSpace === -1 || value[firstNonSpace] !== '{') continue;
    const close = matchBrace(value, firstNonSpace);
    if (close === -1) continue;
    const inner = value.slice(firstNonSpace + 1, close);
    const methods = typeLiteralMembers(inner);
    if (methods === null) return null;
    for (const method of methods) {
      operations.push(`${domain.key}.${method.key}`);
    }
  }
  return operations;
}

/**
 * @typedef {object} CallSite
 * @property {string} consumer Pillar the call site lives in.
 * @property {string | null} producer Resolved target, or null when runtime-chosen.
 * @property {string} argument Verbatim first argument, for the failure message.
 * @property {string | null} routerType Name of the resolved generic type argument,
 *   or null when the call carried none or it was not a bare identifier.
 * @property {string[] | null} operationIds `domain.method` operations the router
 *   type declares, or null when `routerType` could not be resolved to one.
 * @property {string} file Repo-relative path.
 * @property {number} line 1-based line.
 */

/**
 * @typedef {object} DirectFetchSite
 * @property {string} consumer Pillar the call lives in.
 * @property {string} file Repo-relative path.
 * @property {number} line 1-based line.
 * @property {string[]} signals Why the file counts as federation-aware.
 */

/**
 * Which {@link FEDERATION_SIGNALS} a source carries.
 *
 * Read from the comment-stripped view, so a docstring that merely MENTIONS
 * `POPS_PILLARS` — including the ones explaining why a file no longer uses
 * it — does not make the file federation-aware. String bodies are kept,
 * because the import path and the env-var name are both string literals.
 *
 * @param {string} code Scanned source, comments blanked, strings intact.
 * @returns {string[]}
 */
export function federationSignals(code) {
  return FEDERATION_SIGNALS.filter((signal) => signal.pattern.test(code)).map((s) => s.describes);
}

/**
 * Directories under `pillars/<id>` this guard walks.
 *
 * `scripts` joined `src` because `pillars/finance/scripts/migrate-core-entities.ts`
 * held two `pillar<T>()` call sites that were pinnable but invisible — the
 * original enumeration scoped itself to `src` only. A one-shot deploy
 * script's failure mode is an operator seeing an error rather than a user
 * seeing a wrong number, but "the guard's `OK` line implies every
 * cross-pillar call is covered" was already false the moment `scripts` held
 * one it could not see — so it is walked the same way `src` is, not
 * exempted.
 *
 * That script's `entities.create` call into contacts got its own row above.
 * Its OTHER call, `pillar<CoreRouter>('registry').entities.list(...)`, did
 * not: registry dropped `/entities` when contacts became authoritative (see
 * `pillars/registry/src/contract/__tests__/openapi.test.ts`, which asserts
 * registry exposes no entities surface at all), so a row pinning that
 * operationId would fail `checkExpectations` immediately and permanently —
 * correctly, because the call is already broken on disk, not because this
 * guard is wrong. Coverage is per-OPERATION (see "OPERATION RESOLUTION"
 * above), so the unrelated `users.get` row a few lines up does NOT cover
 * this operation the way it would have under the guard's original,
 * seam-level coverage — `entities.list` is named in
 * `KNOWN_BROKEN_OPERATIONS` instead, which is the documented, self-auditing
 * escape hatch for exactly this shape. Fixing the migrator itself is tracked
 * separately rather than folded into a guard change.
 */
const SCANNED_ROOTS = ['src', 'scripts'];

/**
 * Enumerate every pillar-SDK call site under `pillars/<id>/{src,scripts}`,
 * plus every raw `fetch` in a federation-aware file there, from disk.
 *
 * @param {string} root Repo root.
 * @returns {{ sites: CallSite[], directFetchSites: DirectFetchSite[], scanErrors: string[] }}
 */
export function discoverCallSites(root) {
  const pillarsRoot = join(root, 'pillars');
  /** @type {CallSite[]} */
  const sites = [];
  /** @type {DirectFetchSite[]} */
  const directFetchSites = [];
  /** @type {string[]} */
  const scanErrors = [];
  if (!existsSync(pillarsRoot)) {
    return { sites, directFetchSites, scanErrors: [`no pillars directory at ${pillarsRoot}`] };
  }

  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const consumer = entry.name;
    for (const rootName of SCANNED_ROOTS) {
      const scanRoot = join(pillarsRoot, consumer, rootName);
      if (!existsSync(scanRoot)) continue;
      for (const file of walkSources(scanRoot)) {
        const relativePath = file
          .slice(root.length + 1)
          .split(sep)
          .join('/');
        const scanned = scanSource(readFileSync(file, 'utf8'));
        if (scanned.unterminated !== null) {
          scanErrors.push(
            `${relativePath}: source scan ended inside an unterminated ${scanned.unterminated}. ` +
              'The scanner cannot see call sites past that point, so this is reported rather ' +
              'than passed.'
          );
          continue;
        }
        const calls = [
          ...findPillarCalls(scanned),
          ...findWrapperCalls(scanned, PILLAR_CALL_WRAPPERS),
        ];
        for (const call of calls) {
          const routerType = firstTypeArgName(call.typeArg);
          sites.push({
            consumer,
            producer: resolveProducerId(call.argument, scanned.code),
            argument: call.argument,
            routerType,
            operationIds: resolveRouterOperations(scanned.scannable, routerType),
            file: relativePath,
            line: call.line,
          });
        }
        const signals = federationSignals(scanned.code);
        if (signals.length === 0) continue;
        for (const call of findFetchCalls(scanned)) {
          directFetchSites.push({ consumer, file: relativePath, line: call.line, signals });
        }
      }
    }
  }
  return { sites, directFetchSites, scanErrors };
}

function* walkSources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      yield* walkSources(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (/\.(test|spec)\.[cm]?tsx?$/u.test(entry.name)) continue;
    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    yield full;
  }
}

/**
 * @typedef {object} UnlistedOperation
 * @property {string} consumer
 * @property {string} producer
 * @property {string} operationId Operation resolved from the call site's
 *   router type that no `EXPECTATIONS` row pins.
 * @property {string} argument Verbatim first argument, for the failure message.
 * @property {string} file Repo-relative path.
 * @property {number} line 1-based line.
 */

/**
 * @typedef {object} CoverageReport
 * @property {UnlistedOperation[]} unlisted Resolved operations with no expectation row.
 * @property {CallSite[]} unresolved Runtime-chosen targets with no exemption.
 * @property {CallSite[]} unresolvedOperations Known-producer call sites whose
 *   router type could not be resolved to an operation list.
 * @property {string[]} staleExemptions Exempted files holding no call site.
 * @property {string[]} staleKnownBrokenOperations `KNOWN_BROKEN_OPERATIONS`
 *   entries no discovered call site's router type still resolves to.
 * @property {number} exempted How many discovered sites an exemption covered.
 */

/**
 * The key two records agree on when they describe the same seam.
 *
 * A pillar id is an identifier, so ` -> ` cannot occur inside either half and
 * the composite cannot collide. Spelt the same way the failure messages spell
 * a seam, so a key seen while debugging reads as the thing it names.
 *
 * @param {{ consumer: string, producer: string | null }} seam
 * @returns {string}
 */
function seamKey(seam) {
  return `${seam.consumer} -> ${String(seam.producer)}`;
}

/**
 * The key two records agree on when they pin the same OPERATION — a seam
 * plus the specific `operationId` on it. This is the granularity coverage
 * actually checks at: two operations on one seam need two rows, and sharing
 * a seam key is not enough for one to cover the other. See "OPERATION
 * RESOLUTION" in this file's header for why a call site can name more than
 * one operationId (its router type may declare several).
 *
 * @param {{ consumer: string, producer: string | null, operationId: string }} op
 * @returns {string}
 */
function operationKey(op) {
  return `${seamKey(op)} :: ${op.operationId}`;
}

/**
 * Diff the disk-derived call sites against the curated rows, at OPERATION
 * granularity: a call site whose router type resolves to N operations needs
 * N rows, not one row for its seam. See "OPERATION RESOLUTION" in this
 * file's header for how a call site's operations are read, and
 * `KNOWN_BROKEN_OPERATIONS`'s own doc comment for the one deliberate
 * exception.
 *
 * Pure, and exported so the degenerate cases are testable without a tree.
 *
 * @param {CallSite[]} sites
 * @param {Array<{ consumer: string, producer: string, operationId: string }>} expectations
 *   Only `consumer`/`producer`/`operationId` are read here, so a caller may
 *   pass anything naming those — which is what lets a test drive this
 *   without inventing a whole OpenAPI expectation.
 * @param {UnpinnableCallSite[]} exemptions
 * @param {KnownBrokenOperation[]} [knownBrokenOperations]
 * @returns {CoverageReport}
 */
export function findCoverageGaps(sites, expectations, exemptions, knownBrokenOperations = []) {
  const pinned = new Set(expectations.map(operationKey));
  const knownBroken = new Set(knownBrokenOperations.map(operationKey));
  const knownBrokenSeen = new Set();
  const exemptFiles = new Set(exemptions.map((e) => e.file));
  const exemptFilesSeen = new Set();

  /** @type {UnlistedOperation[]} */
  const unlisted = [];
  /** @type {CallSite[]} */
  const unresolved = [];
  /** @type {CallSite[]} */
  const unresolvedOperations = [];
  let exempted = 0;

  for (const site of sites) {
    if (exemptFiles.has(site.file)) {
      exemptFilesSeen.add(site.file);
      exempted++;
      continue;
    }
    if (site.producer === null) {
      unresolved.push(site);
      continue;
    }
    if (site.operationIds === null || site.operationIds.length === 0) {
      unresolvedOperations.push(site);
      continue;
    }
    for (const operationId of site.operationIds) {
      const op = { consumer: site.consumer, producer: site.producer, operationId };
      const key = operationKey(op);
      if (pinned.has(key)) continue;
      if (knownBroken.has(key)) {
        knownBrokenSeen.add(key);
        continue;
      }
      unlisted.push({ ...op, argument: site.argument, file: site.file, line: site.line });
    }
  }

  return {
    unlisted,
    unresolved,
    unresolvedOperations,
    staleExemptions: exemptions.map((e) => e.file).filter((f) => !exemptFilesSeen.has(f)),
    staleKnownBrokenOperations: knownBrokenOperations
      .filter((op) => !knownBrokenSeen.has(operationKey(op)))
      .map(operationKey),
    exempted,
  };
}

/**
 * @typedef {object} DirectFetchReport
 * @property {DirectFetchSite[]} unsanctioned Raw HTTP calls nothing excuses.
 * @property {string[]} staleSanctions Sanctioned files holding no such call.
 * @property {number} sanctioned How many discovered calls a sanction covered.
 */

/**
 * Diff the disk-derived direct-fetch calls against the sanctioned list.
 *
 * Pure, and exported so both directions are testable without a tree.
 *
 * @param {DirectFetchSite[]} sites
 * @param {SanctionedDirectFetch[]} sanctioned
 * @returns {DirectFetchReport}
 */
export function findDirectFetchGaps(sites, sanctioned) {
  const sanctionedFiles = new Set(sanctioned.map((s) => s.file));
  const seen = new Set();

  /** @type {DirectFetchSite[]} */
  const unsanctioned = [];
  let covered = 0;

  for (const site of sites) {
    if (sanctionedFiles.has(site.file)) {
      seen.add(site.file);
      covered++;
      continue;
    }
    unsanctioned.push(site);
  }

  return {
    unsanctioned,
    staleSanctions: sanctioned.map((s) => s.file).filter((f) => !seen.has(f)),
    sanctioned: covered,
  };
}

/**
 * Check one expectation against a producer's OpenAPI document.
 *
 * @param {Expectation} expectation
 * @param {unknown} doc Parsed OpenAPI document.
 * @returns {string[]} Human-readable failures; empty when it holds.
 */
export function checkExpectation(expectation, doc) {
  /** @type {string[]} */
  const failures = [];
  const paths = isRecord(doc) && isRecord(doc['paths']) ? doc['paths'] : null;
  if (!paths) {
    return [`${expectation.producer}: OpenAPI document has no paths object`];
  }

  /** @type {Array<{ path: string, method: string, operation: Record<string, unknown>, pathItem: Record<string, unknown> }>} */
  const matches = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (!isRecord(operation)) continue;
      if (operation['operationId'] !== expectation.operationId) continue;
      matches.push({ path, method: method.toLowerCase(), operation, pathItem });
    }
  }

  if (matches.length === 0) {
    return [
      `${expectation.producer} no longer declares operationId '${expectation.operationId}'. ` +
        `${expectation.consumer} resolves its call by that id (${expectation.usedBy}), so this ` +
        `is a silent runtime break.`,
    ];
  }

  // The SDK resolves a property chain to the FIRST operation carrying the id.
  // Two operations sharing one makes which route a consumer reaches an
  // artefact of document ordering, so it is reported rather than resolved.
  if (matches.length > 1) {
    const where = matches.map((m) => `${m.method.toUpperCase()} ${m.path}`).join(', ');
    failures.push(
      `${expectation.producer} declares operationId '${expectation.operationId}' ` +
        `${String(matches.length)} times (${where}); the SDK cannot tell which one ` +
        `${expectation.consumer} means`
    );
  }

  const found = matches[0];
  if (found.path !== expectation.path || found.method !== expectation.method) {
    failures.push(
      `${expectation.operationId} moved to ${found.method.toUpperCase()} ${found.path}, ` +
        `expected ${expectation.method.toUpperCase()} ${expectation.path}`
    );
  }

  const query = declaredParams(found.operation, found.pathItem, 'query');
  for (const name of expectation.query) {
    if (!query.has(name)) {
      failures.push(
        `${expectation.operationId} no longer declares query parameter '${name}', which ` +
          `${expectation.consumer} sends`
      );
    }
  }

  // A renamed path parameter is the quietest break of the lot: the SDK
  // substitutes `{name}` from the input keys, so a producer renaming `:id`
  // to `:itemId` leaves the literal placeholder in the URL and the consumer
  // reads the resulting 404 as a real answer.
  const pathParams = declaredParams(found.operation, found.pathItem, 'path');
  for (const name of expectation.pathParams ?? []) {
    if (!pathParams.has(name)) {
      failures.push(
        `${expectation.operationId} no longer declares path parameter '${name}', which ` +
          `${expectation.consumer} substitutes into the URL`
      );
    }
  }

  return failures;
}

/**
 * Names of the parameters in force for an operation, in one location.
 *
 * OpenAPI lets a producer hoist a parameter shared by every method on a path
 * onto the path item itself, where it applies to all of them. Reading only
 * the operation's own list would fail a producer that did exactly that —
 * a false alarm on a legal document, which is the kind that gets a guard
 * disabled.
 *
 * @param {Record<string, unknown>} operation
 * @param {Record<string, unknown>} pathItem
 * @param {'query' | 'path'} location
 * @returns {Set<string>}
 */
export function declaredParams(operation, pathItem, location) {
  const lists = [pathItem['parameters'], operation['parameters']];
  const names = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const parameter of list) {
      if (!isRecord(parameter) || parameter['in'] !== location) continue;
      names.add(String(parameter['name']));
    }
  }
  return names;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function producerSpecPath(producer) {
  return join(repoRoot, 'pillars', producer, 'openapi', `${producer}.openapi.json`);
}

/**
 * Read and parse a producer's published OpenAPI document.
 *
 * Both failure legs answer with a distinct message rather than an empty
 * document, so a producer whose spec vanished or got corrupted cannot read
 * as "nothing to check".
 *
 * @param {string} producer
 * @param {string} specPath
 * @returns {{ doc: unknown, failure: null } | { doc: null, failure: string }}
 */
export function loadProducerDoc(producer, specPath) {
  if (!existsSync(specPath)) {
    return { doc: null, failure: `${producer}: no published OpenAPI at ${specPath}` };
  }
  try {
    return { doc: JSON.parse(readFileSync(specPath, 'utf8')), failure: null };
  } catch (cause) {
    return { doc: null, failure: `${producer}: OpenAPI is not valid JSON (${String(cause)})` };
  }
}

/**
 * Failures for the curated half: does every row still hold on disk, and does
 * the row itself still point at a file that exists.
 *
 * @param {string} root
 * @param {Expectation[]} expectations
 * @returns {string[]}
 */
/**
 * Failures for the wrapper registry: does every entry's type still exist
 * where it says it does.
 *
 * Symmetric to the exemption-staleness check in {@link findCoverageGaps}: a
 * registration that has drifted from source is worse than an absent one,
 * because discovery keeps matching a name that used to mean "forwards to
 * `pillar()`" and may no longer — a silent MISS is what this whole guard
 * exists to turn into a loud one.
 *
 * Checked against `scanned.scannable`, not the raw file: a `typeName` that
 * survives only in a comment or a string (`// removed PillarGateway`) must
 * not read as a live declaration, the same reasoning that keeps `pillar(`
 * prose out of {@link findPillarCalls}.
 *
 * @param {string} root
 * @param {PillarCallWrapper[]} wrappers
 * @returns {string[]}
 */
export function checkWrapperRegistrations(root, wrappers) {
  /** @type {string[]} */
  const failures = [];
  for (const wrapper of wrappers) {
    const path = join(root, wrapper.definedIn);
    if (!existsSync(path)) {
      failures.push(
        `PILLAR_CALL_WRAPPERS registers '${wrapper.typeName}' at ${wrapper.definedIn}, which ` +
          'does not exist. Repoint it at the type or drop the registration.'
      );
      continue;
    }
    const scanned = scanSource(readFileSync(path, 'utf8'));
    if (scanned.unterminated !== null) {
      failures.push(
        `${wrapper.definedIn}: source scan ended inside an unterminated ${scanned.unterminated}. ` +
          `PILLAR_CALL_WRAPPERS cannot verify '${wrapper.typeName}' is still declared past that point.`
      );
      continue;
    }
    const declared = new RegExp(
      `\\b(?:interface|type)\\s+${RegExp.escape(wrapper.typeName)}\\b`,
      'u'
    );
    if (!declared.test(scanned.scannable)) {
      failures.push(
        `PILLAR_CALL_WRAPPERS registers '${wrapper.typeName}' at ${wrapper.definedIn}, but no ` +
          'such type is declared there anymore. Discovery trusts this entry to find every call ' +
          'through the wrapper — update the registration or drop it.'
      );
    }
  }
  return failures;
}

export function checkExpectations(root, expectations) {
  /** @type {string[]} */
  const failures = [];
  if (expectations.length === 0) {
    return [
      'EXPECTATIONS is empty. The fleet has cross-pillar call sites, so an empty list ' +
        'means the rows were lost, not that the seams were.',
    ];
  }

  for (const expectation of expectations) {
    if (!existsSync(join(root, expectation.usedBy))) {
      failures.push(
        `${expectation.consumer} -> ${expectation.producer} (${expectation.operationId}): ` +
          `usedBy points at ${expectation.usedBy}, which does not exist. Repoint it at the ` +
          'call site or drop the row.'
      );
    }
    const { doc, failure } = loadProducerDoc(
      expectation.producer,
      producerSpecPath(expectation.producer)
    );
    if (failure !== null) {
      failures.push(failure);
      continue;
    }
    failures.push(...checkExpectation(expectation, doc));
  }
  return failures;
}

function reportCoverage(report) {
  /** @type {string[]} */
  const failures = [];
  for (const op of report.unlisted) {
    failures.push(
      `${op.file}:${String(op.line)} calls ${op.producer}'s '${op.operationId}' operation and no ` +
        `EXPECTATIONS row pins ${op.consumer} -> ${op.producer} (${op.operationId}) specifically ` +
        '— a row pinning a DIFFERENT operation on this seam does not cover it. That operation is ' +
        'unguarded: a renamed operationId breaks it in production, not in CI. Add a row.'
    );
  }
  for (const site of report.unresolved) {
    failures.push(
      `${site.file}:${String(site.line)} calls pillar(${site.argument}) — the target is not a ` +
        'literal, so no expectation can pin it. Either pass a literal pillar id, or add the ' +
        'file to UNPINNABLE_CALL_SITES with a reason.'
    );
  }
  for (const site of report.unresolvedOperations) {
    failures.push(
      `${site.file}:${String(site.line)} calls the ${String(site.producer)} pillar through router ` +
        `type '${String(site.routerType)}', but this guard could not resolve that type to a list ` +
        'of operations (not declared in this file as a plain object-literal type, or declared but ' +
        'empty). Per-operation coverage cannot be checked for it, so it is reported rather than ' +
        'treated as covered — see "OPERATION RESOLUTION" in this file for the shape a router type ' +
        'needs.'
    );
  }
  for (const file of report.staleExemptions) {
    failures.push(
      `UNPINNABLE_CALL_SITES lists ${file}, which holds no pillar() call site. The exemption ` +
        'outlived what it excused — delete it.'
    );
  }
  for (const op of report.staleKnownBrokenOperations) {
    failures.push(
      `KNOWN_BROKEN_OPERATIONS lists ${op}, which no discovered call site's router type resolves ` +
        'to anymore. The exemption outlived what it excused — delete it, or add a row if the ' +
        'operation is pinnable again.'
    );
  }
  return failures;
}

function reportDirectFetch(report) {
  /** @type {string[]} */
  const failures = [];
  for (const site of report.unsanctioned) {
    failures.push(
      `${site.file}:${String(site.line)} calls fetch directly, in a file that ` +
        `${site.signals.join(' and ')}. A cross-pillar call written that way resolves no ` +
        'operationId, so the enumeration above cannot see it and no EXPECTATIONS row can pin ' +
        'it — the producer renames a route and this breaks in production while CI says OK. ' +
        'Route it through pillar(), or add the file to SANCTIONED_DIRECT_FETCH with a reason.'
    );
  }
  for (const file of report.staleSanctions) {
    failures.push(
      `SANCTIONED_DIRECT_FETCH lists ${file}, which holds no direct fetch call. The sanction ` +
        'outlived what it excused — delete it.'
    );
  }
  return failures;
}

function run() {
  const { sites, directFetchSites, scanErrors } = discoverCallSites(repoRoot);

  /** @type {string[]} */
  const failures = [...scanErrors];

  if (sites.length === 0 && scanErrors.length === 0) {
    failures.push(
      'Discovered no pillar() call sites under pillars/*/src. The fleet has several, so this ' +
        'is a broken scan reporting a clean repo — the exact failure ADR-045 forbids.'
    );
  }

  failures.push(...checkExpectations(repoRoot, EXPECTATIONS));
  failures.push(...checkWrapperRegistrations(repoRoot, PILLAR_CALL_WRAPPERS));
  failures.push(
    ...reportCoverage(
      findCoverageGaps(sites, EXPECTATIONS, UNPINNABLE_CALL_SITES, KNOWN_BROKEN_OPERATIONS)
    )
  );
  const directFetch = findDirectFetchGaps(directFetchSites, SANCTIONED_DIRECT_FETCH);
  failures.push(...reportDirectFetch(directFetch));

  if (failures.length > 0) {
    console.error('Backend cross-pillar expectation(s) broken:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\nUpdate the consumer to match, then update EXPECTATIONS in this script.\n' +
        'Do NOT silence this: the SDK proxy is untyped at the network edge, so nothing\n' +
        'else fails until the call runs in production.'
    );
    process.exit(1);
  }

  console.log(
    `OK — ${String(EXPECTATIONS.length)} backend cross-pillar expectation(s) hold, each ` +
      `discovered call site's operations are individually pinned or excused across ` +
      `${String(sites.length)} discovered pillar() call site(s), and ` +
      `${String(directFetch.sanctioned)} direct-fetch call(s) are sanctioned.`
  );
}

function selfTest() {
  const expectation = EXPECTATIONS[0];
  const good = {
    paths: {
      '/transactions': {
        get: {
          operationId: 'transactions.list',
          parameters: expectation.query.map((name) => ({ name, in: 'query' })),
        },
      },
    },
  };
  assert(checkExpectation(expectation, good).length === 0, 'a matching document must pass');

  const renamed = { paths: { '/transactions': { get: { operationId: 'transactions.query' } } } };
  assert(checkExpectation(expectation, renamed).length === 1, 'a renamed operation must fail');

  const moved = {
    paths: {
      '/txns': {
        get: {
          operationId: 'transactions.list',
          parameters: expectation.query.map((name) => ({ name, in: 'query' })),
        },
      },
    },
  };
  assert(
    checkExpectation(expectation, moved).some((f) => f.includes('moved')),
    'a moved path must fail'
  );

  const missingParam = {
    paths: {
      '/transactions': {
        get: {
          operationId: 'transactions.list',
          parameters: [{ name: 'startDate', in: 'query' }],
        },
      },
    },
  };
  assert(
    checkExpectation(expectation, missingParam).some((f) => f.includes('endDate')),
    'a dropped query parameter must fail'
  );

  const duplicated = {
    paths: {
      '/transactions': {
        get: {
          operationId: 'transactions.list',
          parameters: expectation.query.map((name) => ({ name, in: 'query' })),
        },
      },
      '/transactions/all': {
        get: {
          operationId: 'transactions.list',
          parameters: expectation.query.map((name) => ({ name, in: 'query' })),
        },
      },
    },
  };
  assert(
    checkExpectation(expectation, duplicated).some((f) => f.includes('2 times')),
    'a duplicated operationId must fail'
  );

  const withPathParam = {
    consumer: 'c',
    producer: 'p',
    operationId: 'items.get',
    path: '/items/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'nowhere',
  };
  const renamedPathParam = {
    paths: {
      '/items/{id}': {
        get: { operationId: 'items.get', parameters: [{ name: 'itemId', in: 'path' }] },
      },
    },
  };
  assert(
    checkExpectation(withPathParam, renamedPathParam).some((f) =>
      f.includes("path parameter 'id'")
    ),
    'a renamed path parameter must fail'
  );

  const intactPathParam = {
    paths: {
      '/items/{id}': {
        get: { operationId: 'items.get', parameters: [{ name: 'id', in: 'path' }] },
      },
    },
  };
  assert(
    checkExpectation(withPathParam, intactPathParam).length === 0,
    'a matching path parameter must pass'
  );

  const hoistedPathParam = {
    paths: {
      '/items/{id}': {
        parameters: [{ name: 'id', in: 'path' }],
        get: { operationId: 'items.get' },
      },
    },
  };
  assert(
    checkExpectation(withPathParam, hoistedPathParam).length === 0,
    'a path-level parameter must satisfy the same expectation as an operation-level one'
  );

  assert(EXPECTATIONS.length > 0, 'EXPECTATIONS must not be empty');
  assert(
    checkExpectations(repoRoot, []).some((f) => f.includes('EXPECTATIONS is empty')),
    'an empty EXPECTATIONS list must fail rather than vacuously pass'
  );

  const absent = loadProducerDoc('ghost', join(repoRoot, 'pillars', 'ghost', 'openapi', 'x.json'));
  assert(
    absent.doc === null && absent.failure?.includes('no published OpenAPI at') === true,
    'a producer with no published OpenAPI must fail, not be skipped'
  );

  const scratch = mkdtempSync(join(tmpdir(), 'cross-pillar-selftest-'));
  try {
    const corrupt = join(scratch, 'corrupt.openapi.json');
    writeFileSync(corrupt, '{ "paths": ');
    const parsed = loadProducerDoc('ghost', corrupt);
    assert(
      parsed.doc === null && parsed.failure?.includes('not valid JSON') === true,
      'a corrupt OpenAPI document must fail, not be skipped'
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const site = (over) => ({
    consumer: 'purchases',
    producer: 'contacts',
    argument: "'contacts'",
    routerType: 'ContactsRouter',
    operationIds: ['entities.list'],
    file: 'pillars/purchases/src/api/contacts/merchant.ts',
    line: 1,
    ...over,
  });
  const row = { consumer: 'purchases', producer: 'contacts', operationId: 'entities.list' };

  assert(
    findCoverageGaps([site({})], [row], []).unlisted.length === 0,
    'a call site whose one resolved operation has a matching row must pass coverage'
  );
  assert(
    findCoverageGaps([site({ producer: 'lists' })], [row], []).unlisted.length === 1,
    'a call site whose seam has no row must fail coverage'
  );
  assert(
    (() => {
      const report = findCoverageGaps(
        [site({ operationIds: ['entities.list', 'entities.create'] })],
        [row],
        []
      );
      return report.unlisted.length === 1 && report.unlisted[0].operationId === 'entities.create';
    })(),
    'a SECOND, unpinned operation on an already-pinned seam must be caught, not covered by the ' +
      'first operation’s row'
  );
  assert(
    findCoverageGaps(
      [site({ producer: null, argument: 'pillarId', operationIds: null })],
      [row],
      []
    ).unresolved.length === 1,
    'a runtime-chosen target with no exemption must fail coverage'
  );
  assert(
    findCoverageGaps(
      [
        site({
          producer: null,
          argument: 'pillarId',
          operationIds: null,
          file: 'pillars/mcp/src/pillar-client.ts',
        }),
      ],
      [row],
      [{ file: 'pillars/mcp/src/pillar-client.ts', reason: 'why' }]
    ).unresolved.length === 0,
    'an exempted file must satisfy coverage'
  );
  assert(
    findCoverageGaps([site({})], [row], [{ file: 'pillars/gone/src/x.ts', reason: 'why' }])
      .staleExemptions.length === 1,
    'an exemption covering no call site must fail'
  );
  assert(
    findCoverageGaps([site({ operationIds: [] })], [row], []).unresolvedOperations.length === 1,
    'a call site whose router type resolved to zero operations must be reported, not treated as ' +
      'covered'
  );
  assert(
    findCoverageGaps([site({ operationIds: null, routerType: null })], [row], [])
      .unresolvedOperations.length === 1,
    'a call site whose router type could not be found at all must be reported the same way'
  );

  const brokenOp = { consumer: 'finance', producer: 'registry', operationId: 'entities.list' };
  const brokenSite = site({
    consumer: 'finance',
    producer: 'registry',
    routerType: 'CoreRouter',
    operationIds: ['entities.list'],
    file: 'pillars/finance/scripts/migrate-core-entities.ts',
  });
  assert(
    findCoverageGaps([brokenSite], [], [], [brokenOp]).unlisted.length === 0,
    'an operation named in KNOWN_BROKEN_OPERATIONS must satisfy coverage without a row'
  );
  assert(
    findCoverageGaps([brokenSite], [], [], [brokenOp]).staleKnownBrokenOperations.length === 0,
    'a KNOWN_BROKEN_OPERATIONS entry a live call site still resolves to must not be stale'
  );
  assert(
    findCoverageGaps([site({})], [row], [], [brokenOp]).staleKnownBrokenOperations.length === 1,
    'a KNOWN_BROKEN_OPERATIONS entry no discovered call site resolves to must be reported stale'
  );

  assert(
    resolveRouterOperations(
      'type ContactsRouter = { entities: { list: (i) => X; get: (i) => Y; }; };',
      'ContactsRouter'
    )
      .toSorted()
      .join(',') === 'entities.get,entities.list',
    'a two-method single-domain router type must resolve both operations'
  );
  assert(
    resolveRouterOperations(
      'type ListsRouter = { list: { get: (i) => X; }; items: { add: (i) => Y; search: (i) => Z; }; };',
      'ListsRouter'
    )
      .toSorted()
      .join(',') === 'items.add,items.search,list.get',
    'a multi-domain router type must resolve operations from every domain'
  );
  assert(
    resolveRouterOperations(
      'type CerebrumNudgesHandle = { nudges: { create: NudgeSink }; };',
      'CerebrumNudgesHandle'
    ).join(',') === 'nudges.create',
    'a method aliased to a named function type, not an inline arrow, must still resolve — the ' +
      'parser reads keys structurally and does not care what shape the value is'
  );
  assert(
    (() => {
      const withMultiArgGeneric = resolveRouterOperations(
        'type R = { items: { get: (i) => Promise<Result<A, B>>; }; };',
        'R'
      );
      const withCurriedArrow = resolveRouterOperations(
        'type R = { items: { get: (i) => (y) => Promise<Record<string, unknown>>; }; };',
        'R'
      );
      return (
        withMultiArgGeneric?.join(',') === 'items.get' &&
        withCurriedArrow?.join(',') === 'items.get'
      );
    })(),
    'a comma inside a multi-arg generic return type must not be misread as a member separator, ' +
      "and an arrow token's own '>' must not be misread as a generic closer"
  );
  assert(
    resolveRouterOperations('type Empty = {};', 'Empty').length === 0,
    'a declared-but-empty router type must resolve to zero operations, not error'
  );
  assert(
    resolveRouterOperations('const x = 1;', 'GhostRouter') === null,
    'a type name not declared anywhere in the file must resolve to null, not an empty list — the ' +
      'caller treats both as "cannot check", but only null explains why in a message'
  );
  assert(
    resolveRouterOperations('type Alias = string;', 'Alias') === null,
    'a type declared but not as an object literal must resolve to null'
  );
  assert(
    resolveRouterOperations('...', null) === null,
    'a call site with no type argument at all must resolve to null'
  );
  assert(
    resolveRouterOperations('type X = { entities: { get(): Y; set(v: Z): void; }; };', 'X') ===
      null,
    'method-shorthand (no colon before the parameter list) must resolve to null, not to a ' +
      "garbage operation manufactured from the parameter name — a parser that CAN'T explain " +
      'this shape must say so rather than guess at what it found'
  );
  assert(
    resolveRouterOperations('type X = { a: { m1(): A; m2(): B; m3(): C; }; };', 'X') === null,
    'multiple consecutive method-shorthand members must still resolve to null, not to a partial ' +
      'or empty list that reads as "this router has no operations" when it plainly has three'
  );
  assert(
    firstTypeArgName('FinanceTransactionsRouter, unknown') === 'FinanceTransactionsRouter',
    "a wrapper's two-argument generic must read the ROUTER type, not the return type"
  );
  assert(
    firstTypeArgName('() => void') === null,
    'a type argument that is not a bare identifier must not be misread as one'
  );
  assert(firstTypeArgName(null) === null, 'no type argument at all must resolve to null');

  const scanned = scanSource(
    [
      "// pillar('never')",
      "/* pillar('never') */",
      'const s = "pillar(\'never\')";',
      'const re = /pillar\\/\\/x/u;',
      'const jsx = <div>{items.map((i) => /a\\/b/u.test(i))}</div>;',
      'const ratio = total / count / 2;',
      "const t = `${n} pillar(s) inspected ${pillar('interpolated')}`;",
      "const real = pillar<Router>('contacts');",
    ].join('\n')
  );
  assert(
    scanned.unterminated === null,
    `the scanner must finish a well-formed file cleanly (got ${String(scanned.unterminated)})`
  );
  const scannedCalls = findPillarCalls(scanned);
  assert(
    scannedCalls.length === 2,
    `only real calls count as call sites (found ${String(scannedCalls.length)}: ` +
      `${scannedCalls.map((c) => c.argument).join(' | ')})`
  );
  assert(
    scannedCalls.every((c) => resolveProducerId(c.argument, scanned.code) !== 'never'),
    'a pillar id written inside a comment or string must never be read as a call target'
  );
  assert(
    scannedCalls.some((c) => resolveProducerId(c.argument, scanned.code) === 'contacts'),
    'a real call must still be found after all the decoys'
  );

  assert(
    scanSource('/* never closed').unterminated === 'block comment',
    'an unterminated block comment must be reported, not silently swallowed'
  );
  assert(
    scanSource('const t = `never closed').unterminated === 'template literal',
    'an unterminated template literal must be reported'
  );
  assert(
    findPillarCalls(scanSource("const h = pillar<() => void>('lists');")).length === 1,
    'an arrow inside the type argument must not swallow the call'
  );
  const pastAnEmoji = scanSource("const emoji = '🔥';\nconst h = pillar<R>('lists');");
  assert(
    pastAnEmoji.unterminated === null && findPillarCalls(pastAnEmoji).length === 1,
    'an astral character must not shift every offset after it and blind the scan'
  );

  assert(
    resolveProducerId('CONTACTS_PILLAR_ID', "const CONTACTS_PILLAR_ID = 'contacts';") ===
      'contacts',
    'a local const bound to a literal must resolve'
  );
  assert(
    resolveProducerId('pillarId', 'export function f(pillarId: string) {}') === null,
    'a parameter must not resolve to a pillar id'
  );

  const fetching = scanSource(
    [
      '// fetch(url)',
      "const s = 'fetch(url)';",
      'const f = globalThis.fetch;',
      'const a = await fetchJson(url);',
      'const b = await prefetch(url);',
      'const c = await fetch(url);',
      'const d = await fetchImpl(url);',
      'const e = await globalThis.fetch(url);',
    ].join('\n')
  );
  assert(
    findFetchCalls(fetching)
      .map((c) => c.line)
      .join(',') === '6,7,8',
    'only real fetch CALLS count, and a dotted or injected one still does ' +
      `(found lines ${findFetchCalls(fetching)
        .map((c) => String(c.line))
        .join(',')})`
  );

  assert(
    federationSignals("import { parsePillarsEnv } from '@pops/pillar-sdk/pillar-env';").length ===
      1,
    'importing the fleet base-URL parser must mark a file federation-aware'
  );
  assert(
    federationSignals(scanSource('/* POPS_PILLARS is no longer read here */').code).length === 0,
    'a comment merely mentioning the roster must NOT mark a file federation-aware'
  );

  const fetchSite = (over) => ({
    consumer: 'registry',
    file: 'pillars/registry/src/api/pillars/dispatcher.ts',
    line: 1,
    signals: ['handles registry entries'],
    ...over,
  });
  assert(
    findDirectFetchGaps([fetchSite({})], SANCTIONED_DIRECT_FETCH).unsanctioned.length === 0,
    'a sanctioned direct fetch must pass'
  );
  assert(
    findDirectFetchGaps([fetchSite({ file: 'pillars/food/src/x.ts' })], []).unsanctioned.length ===
      1,
    'an unsanctioned direct fetch in a federation-aware file must fail'
  );
  assert(
    findDirectFetchGaps([], [{ file: 'pillars/gone/src/x.ts', reason: 'why' }]).staleSanctions
      .length === 1,
    'a sanction covering no fetch call must fail'
  );

  const wrapper = { typeName: 'PillarGateway', method: 'call', definedIn: 'gateway.ts' };
  const wrapperCallSource = scanSource(
    [
      "const TARGET = 'contacts';",
      'function useGateway(gateway: PillarGateway) {',
      '  return gateway.call<Router, unknown>(TARGET, (h) => h.entities.list({}));',
      '}',
    ].join('\n')
  );
  const wrapperCalls = findWrapperCalls(wrapperCallSource, [wrapper]);
  assert(wrapperCalls.length === 1, 'a call through a registered wrapper must be discovered');
  assert(
    resolveProducerId(wrapperCalls[0].argument, wrapperCallSource.code) === 'contacts',
    'a wrapper call argument must resolve the same way a literal pillar() call does'
  );
  assert(
    findWrapperCalls(
      scanSource('function f(other: SomeOtherType) { return other.call(pillarId); }'),
      [wrapper]
    ).length === 0,
    'an identifier not bound to a registered wrapper type must not be read as one'
  );

  const wrapperScratch = mkdtempSync(join(tmpdir(), 'cross-pillar-wrapper-'));
  try {
    writeFileSync(
      join(wrapperScratch, 'gateway.ts'),
      'export interface PillarGateway { call(): void; }'
    );
    assert(
      checkWrapperRegistrations(wrapperScratch, [wrapper]).length === 0,
      'a wrapper type still declared where it is registered must pass'
    );
    writeFileSync(
      join(wrapperScratch, 'renamed.ts'),
      'export interface SomethingElse { call(): void; }'
    );
    assert(
      checkWrapperRegistrations(wrapperScratch, [{ ...wrapper, definedIn: 'renamed.ts' }]).some(
        (f) => f.includes('no such type is declared')
      ),
      'a wrapper registration whose type moved or was renamed must fail'
    );
    assert(
      checkWrapperRegistrations(wrapperScratch, [{ ...wrapper, definedIn: 'missing.ts' }]).some(
        (f) => f.includes('does not exist')
      ),
      'a wrapper registration pointing at a missing file must fail'
    );
    writeFileSync(
      join(wrapperScratch, 'commented-out.ts'),
      '// export interface PillarGateway { call(): void; }\nconst note = "interface PillarGateway";'
    );
    assert(
      checkWrapperRegistrations(wrapperScratch, [
        { ...wrapper, definedIn: 'commented-out.ts' },
      ]).some((f) => f.includes('no such type is declared')),
      'a type name surviving only in a comment or string must not read as a live declaration'
    );
  } finally {
    rmSync(wrapperScratch, { recursive: true, force: true });
  }

  assert(
    checkWrapperRegistrations(repoRoot, PILLAR_CALL_WRAPPERS).length === 0,
    'every registered wrapper must still name a type declared where it says it is'
  );

  const { sites, directFetchSites, scanErrors } = discoverCallSites(repoRoot);
  assert(scanErrors.length === 0, `the live tree must scan cleanly (${scanErrors.join('; ')})`);
  assert(
    sites.length > 0,
    'discovery must find call sites in the live tree; finding none is a broken scan'
  );
  assert(
    directFetchSites.length > 0,
    'discovery must find the sanctioned direct-fetch calls in the live tree; finding none is a ' +
      'broken detector that would report OK over the next hand-rolled cross-pillar call'
  );
  assert(
    sites.filter((s) => s.consumer === 'bfm' && s.file === 'pillars/bfm/src/api/finance/client.ts')
      .length === 2,
    "discovery must follow bfm's PillarGateway.call wrapper into finance, not just a literal " +
      'pillar() token — these two calls resolve their producer through gateway.call, not pillar()'
  );
  assert(
    sites.filter((s) => s.file === 'pillars/finance/scripts/migrate-core-entities.ts').length === 2,
    'discovery must walk pillars/*/scripts as well as pillars/*/src — this one-shot migrator ' +
      'holds two call sites that a src-only walk would never see'
  );

  assert(
    sites.every((s) => s.producer === null || s.operationIds !== null),
    'every discovered call site with a literal producer must resolve to a known operation list ' +
      "— finding one that doesn't means a router type in this tree stopped matching the shape " +
      '"OPERATION RESOLUTION" documents, silently, and per-operation coverage would go blind for it'
  );

  const liveCoverage = findCoverageGaps(sites, EXPECTATIONS, UNPINNABLE_CALL_SITES, [
    ...KNOWN_BROKEN_OPERATIONS,
  ]);
  assert(
    liveCoverage.unlisted.length === 0 &&
      liveCoverage.unresolved.length === 0 &&
      liveCoverage.unresolvedOperations.length === 0 &&
      liveCoverage.staleExemptions.length === 0 &&
      liveCoverage.staleKnownBrokenOperations.length === 0,
    'every operation every live call site resolves to must be pinned, exempted, or named in ' +
      `KNOWN_BROKEN_OPERATIONS (got: ${JSON.stringify(liveCoverage)})`
  );

  assert(
    (() => {
      // finance -> registry is pinned by the `users.get` row from
      // pillars/finance/src/api/cron/pillar-lookup.ts. migrate-core-entities.ts
      // resolves a SECOND, different operation on that same seam
      // (`entities.list`) that no row pins. Dropping KNOWN_BROKEN_OPERATIONS
      // (its documented, tracked exemption) must surface that operation as
      // unlisted rather than let the `users.get` row cover it — proving
      // coverage is per-operation, not per-seam, against the real tree
      // rather than a synthetic fixture.
      const withoutKnownBroken = findCoverageGaps(sites, EXPECTATIONS, UNPINNABLE_CALL_SITES, []);
      return withoutKnownBroken.unlisted.some(
        (op) =>
          op.consumer === 'finance' &&
          op.producer === 'registry' &&
          op.operationId === 'entities.list'
      );
    })(),
    'the finance -> registry seam being pinned by an unrelated users.get row must NOT cover ' +
      "migrate-core-entities.ts's separate entities.list operation on that same seam"
  );

  const scriptsScratch = mkdtempSync(join(tmpdir(), 'cross-pillar-scripts-'));
  try {
    mkdirSync(join(scriptsScratch, 'pillars', 'delta', 'scripts'), { recursive: true });
    writeFileSync(
      join(scriptsScratch, 'pillars', 'delta', 'scripts', 'one-shot.ts'),
      "pillar<R>('epsilon');"
    );
    const scriptsSites = discoverCallSites(scriptsScratch).sites;
    assert(
      scriptsSites.some((s) => s.consumer === 'delta' && s.producer === 'epsilon'),
      'a fixture tree with no src directory at all must still surface a call site under scripts'
    );
  } finally {
    rmSync(scriptsScratch, { recursive: true, force: true });
  }

  console.log(
    'self-test OK — flags a renamed operation, a moved path, a dropped query parameter, a ' +
      'renamed path parameter, a duplicated operationId, a missing or corrupt producer spec, ' +
      'an empty expectation list, an unresolvable target, a stale exemption, an unsanctioned ' +
      'direct fetch, a stale sanction, a gateway-wrapper call site, an identifier not bound to a ' +
      'registered wrapper, a stale or missing wrapper registration, a call site under ' +
      'pillars/*/scripts, a source scan that lost its place, a SECOND unpinned operation on an ' +
      'already-pinned seam, a router type that resolves to no operations, a known-broken-operation ' +
      'exemption and its own staleness, and the live core-entities migration seam that would slip ' +
      'past seam-level coverage but does not slip past this one.'
  );
}

function assert(condition, message) {
  if (!condition) {
    console.error(`self-test FAILED: ${message}`);
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-cross-pillar-expectations.mjs [--self-test]\n' +
        "Fails when a producer's OpenAPI no longer matches what a consumer's server calls,\n" +
        'when a pillar() call site on disk has no expectation row pinning it, or when a\n' +
        'federation-aware file calls fetch directly instead of going through the SDK.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) selfTest();
  else run();
}

if (import.meta.main) {
  main();
}
