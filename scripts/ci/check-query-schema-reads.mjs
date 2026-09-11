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
 *   - Scope: `pillars/purchases` only. Every other pillar with ts-rest query
 *     schemas uses its own handler-module layout (some route query params
 *     straight in a single `handlers.ts`, some split per HTTP verb), so the
 *     `{ handlerFile, handlerKey }` mapping this guard hand-curates in
 *     {@link ROUTES} does not generalise without inventing a convention
 *     those pillars do not already follow. Extending this guard to another
 *     pillar means adding that pillar's own `ROUTES` entries once its handler
 *     layout is confirmed to fit this same shape — not inferring the mapping
 *     from naming.
 *   - A field is only "seen read" through a resolver call shaped exactly
 *     `identifierBoundToAnImport(query)` — a bare identifier literally named
 *     `query`, passed as the sole argument. A handler that destructures
 *     individual fields out of `query` before calling a resolver
 *     (`resolve({ sources: query.sources })`), or spreads it (`{ ...query }`),
 *     is not followed into that resolver; the guard would then report those
 *     fields as unread even if the resolver reads them. Every resolver call in
 *     `pillars/purchases` today passes the whole object, so this has not been
 *     a false positive in practice, but it is a real limit of the heuristic —
 *     the fix in that case is to read the field directly in the handler
 *     rather than to fight the checker.
 *   - Once a resolver IS followed, its own reads are anchored to its own
 *     declared parameter, parsed from its `function name(param) { … }`
 *     signature — a simple identifier (`query`, `input`, anything) anchors
 *     member access and destructuring inside its body to that name; a
 *     destructured parameter (`function name({ from, to })`) is read as
 *     equivalent to destructuring those fields off the call's own argument
 *     directly, with no need to also read them again in the resolver body.
 *     A resolver whose parameter cannot be parsed this way (a nested pattern,
 *     a rest element, anything beyond a flat identifier or a flat destructure)
 *     is not followed past that point — conservative in the same direction as
 *     every other gap in this list: a field could be reported as unread when
 *     the resolver does read it, never the reverse.
 *   - Anchoring is per-scope, not global: the handler's own binding for its
 *     entry, each followed resolver's own parameter for its own body. A field
 *     name that merely APPEARS somewhere in reachable text — an unrelated
 *     `.field` access on some other object, an unrelated destructuring, a
 *     method of the same name (`Array.from`) — is never mistaken for a read
 *     of the query field, because the read must chain off the one binding
 *     that scope actually received the query data through.
 *   - Only relative (`./`, `../`) imports are followed into a resolver. A
 *     resolver reached through a workspace package specifier (`@pops/...`)
 *     is invisible to the traversal — no purchases handler does this today.
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
 * The source text of one route's handler entry — from its property key
 * through the end of its arrow function — inside a `make*Handlers` factory's
 * `return { … }` object literal.
 *
 * Handles both bodies this codebase writes: a block (`=> { … }`) and an
 * implicit-return parenthesised expression (`=> ({ … })`). Anything else
 * (a bare expression with neither) is reported as unparseable by the caller
 * rather than guessed at.
 *
 * @param {string} fileText
 * @param {string} handlerKey
 * @returns {string | null}
 */
export function extractHandlerEntryText(fileText, handlerKey) {
  const structural = blankNonStructural(fileText);

  // Anchor to the `make*Handlers` factory's OWN body first. Several of these
  // files define plain helper functions (`notFound`, `itemNotFound`, …) ahead
  // of the factory, and those helpers have their own `return { … }` object
  // literals — searching the whole file for the first `return {` found one
  // of those instead of the factory's, in every file with a helper function
  // before it.
  const factoryMatch = /function\s+make\w*Handlers\s*\(/u.exec(structural);
  if (factoryMatch === null) return null;
  const factoryParamsStart = factoryMatch.index + factoryMatch[0].length - 1; // at '('
  const factoryParamsEnd = matchBalanced(structural, factoryParamsStart, '(', ')');
  if (factoryParamsEnd === -1) return null;
  let factoryBodyStart = factoryParamsEnd;
  while (factoryBodyStart < structural.length && /\s/u.test(structural[factoryBodyStart] ?? '')) {
    factoryBodyStart += 1;
  }
  if (structural[factoryBodyStart] !== '{') return null;
  const factoryBodyEnd = matchBalanced(structural, factoryBodyStart, '{', '}');
  if (factoryBodyEnd === -1) return null;

  const returnIdx = structural.indexOf('return {', factoryBodyStart);
  if (returnIdx === -1 || returnIdx >= factoryBodyEnd) return null;
  const objStart = returnIdx + 'return '.length;
  const objEnd = matchBalanced(structural, objStart, '{', '}');
  if (objEnd === -1 || objEnd > factoryBodyEnd) return null;

  const keyRe = new RegExp(`(^|[{,\\s])(${escapeRegExp(handlerKey)})\\s*:`, 'u');
  const objectBody = structural.slice(objStart, objEnd);
  const localMatch = keyRe.exec(objectBody);
  if (localMatch?.[1] === undefined) return null;
  const keyIndex = objStart + localMatch.index + localMatch[1].length;

  const colonIdx = structural.indexOf(':', keyIndex);
  if (colonIdx === -1 || colonIdx >= objEnd) return null;
  let cursor = colonIdx + 1;

  const asyncMatch = /^\s*async\b/u.exec(structural.slice(cursor));
  if (asyncMatch) cursor += asyncMatch[0].length;
  while (cursor < structural.length && /\s/u.test(structural[cursor] ?? '')) cursor += 1;
  if (structural[cursor] !== '(') return null;

  const paramEnd = matchBalanced(structural, cursor, '(', ')');
  if (paramEnd === -1) return null;

  let bodyCursor = paramEnd;
  while (bodyCursor < structural.length && /\s/u.test(structural[bodyCursor] ?? ''))
    bodyCursor += 1;
  if (structural.slice(bodyCursor, bodyCursor + 2) !== '=>') return null;
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
    return null;
  }
  if (bodyEnd === -1) return null;

  return fileText.slice(keyIndex, bodyEnd);
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

  let bodyStart = parenEnd;
  while (bodyStart < structural.length && structural[bodyStart] !== '{') bodyStart += 1;
  if (bodyStart >= structural.length) return null;
  const bodyEnd = matchBalanced(structural, bodyStart, '{', '}');
  if (bodyEnd === -1) return null;

  return { paramText, bodyText: fileText.slice(bodyStart, bodyEnd) };
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
 * shaped `importedName(<anchor>)` — the exact binding that carries the query
 * at that point, passed as-is — through relative imports, transitively. Each
 * scope in the returned list carries its OWN anchor: the handler entry's is
 * `startAnchor`; a followed resolver's is whatever its own signature names
 * its parameter, read fresh from that resolver — never assumed to be `query`
 * just because the call site's argument was.
 *
 * A resolver whose parameter is itself a destructuring pattern
 * (`function r({ from, to })`) reads those fields the moment it is called —
 * that call is equivalent to destructuring them off `<anchor>` right there,
 * so it is recorded as a synthetic scope anchored to the CALLER's `anchor`
 * rather than the resolver's own, and traversal does not continue past it.
 *
 * This is what lets `resolvePurchaseScope` calling `resolveMerchantFilter`
 * count as reading the merchant fields on behalf of every route that calls
 * `resolvePurchaseScope(query)`, without each of those routes' handler
 * bodies mentioning the merchant fields by name — see the header's
 * "THE RULE".
 *
 * @param {string} startFileAbs
 * @param {string} startEntryText The specific handler entry's own text, not the whole file.
 * @param {string} [startAnchor] The binding path the entry's query fields hang off. Defaults to `'query'`.
 * @returns {ReachableScope[]}
 */
export function collectReachableTexts(startFileAbs, startEntryText, startAnchor = 'query') {
  /** @type {ReachableScope[]} */
  const scopes = [{ text: startEntryText, anchor: startAnchor }];
  const visited = new Set([startFileAbs]);
  /** @type {Array<{ file: string; scanText: string; callAnchor: string }>} */
  const queue = [{ file: startFileAbs, scanText: startEntryText, callAnchor: startAnchor }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    const { file, scanText, callAnchor } = next;
    const bindings = extractImportBindings(readFileOrNull(file) ?? '');
    const callAnchorPattern = anchorPattern(callAnchor);

    for (const [name, specifier] of bindings) {
      const callRe = new RegExp(
        `(?<![\\w$.])${escapeRegExp(name)}\\s*\\(\\s*${callAnchorPattern}\\s*\\)`,
        'u'
      );
      if (!callRe.test(scanText)) continue;
      const resolved = resolveRelativeImport(file, specifier);
      if (resolved === null || visited.has(resolved)) continue;
      visited.add(resolved);
      const fileText = readFileOrNull(resolved);
      if (fileText === null) continue;

      const fn = extractResolverFunctionText(fileText, name);
      if (fn === null) continue;
      const param = parseResolverParam(fn.paramText);
      if (param === null) continue;

      if (param.kind === 'destructured') {
        scopes.push({
          text: `{ ${param.fields.join(', ')} } = ${callAnchor};`,
          anchor: callAnchor,
        });
        continue;
      }

      scopes.push({ text: fn.bodyText, anchor: param.name });
      queue.push({ file: resolved, scanText: fn.bodyText, callAnchor: param.name });
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
 * Check every route in `routes` against the OpenAPI document at `root`, plus
 * the two discovery-floor checks that keep this guard from reporting a clean
 * tree because its own inputs moved out from under it.
 *
 * @param {string} root
 * @param {readonly RouteSpec[]} [routes]
 * @param {readonly AllowlistEntry[]} [allowlist]
 * @returns {string[]}
 */
export function collectViolations(root, routes = ROUTES, allowlist = ALLOWLIST) {
  /** @type {string[]} */
  const violations = [];

  const { index: allowlistIndex, violations: allowlistViolations } = validateAllowlist(allowlist);
  violations.push(...allowlistViolations);

  const openapiPath = join(root, OPENAPI_REL_PATH);
  const openapiText = readFileOrNull(openapiPath);
  if (openapiText === null) {
    violations.push(`could not read ${OPENAPI_REL_PATH}`);
    return violations;
  }
  /** @type {unknown} */
  let doc;
  try {
    doc = JSON.parse(openapiText);
  } catch (err) {
    violations.push(`could not parse ${OPENAPI_REL_PATH}: ${String(err)}`);
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

  if (discoveredRoutesWithFields.length < MIN_ROUTES_WITH_FIELDS) {
    violations.push(
      `only ${String(discoveredRoutesWithFields.length)} route(s) with query fields were found in ` +
        `${OPENAPI_REL_PATH}, under this guard's floor of ${String(MIN_ROUTES_WITH_FIELDS)}. Either ` +
        "the OpenAPI file moved or went stale, or this guard's field derivation broke."
    );
  }

  for (const { method, path } of discoveredRoutesWithFields) {
    const known = routes.some((r) => r.method === method && r.path === path);
    if (!known) {
      violations.push(
        `${method.toUpperCase()} ${path} advertises a query schema with fields (see ` +
          `${OPENAPI_REL_PATH}) but is not listed in ROUTES in this guard. Add a ` +
          '{ method, path, handlerFile, handlerKey } entry for it.'
      );
    }
  }

  for (const route of routes) {
    const fields = queryFieldsForRoute(doc, route.method, route.path);
    if (fields === null) {
      violations.push(
        `ROUTES entry ${route.method.toUpperCase()} ${route.path} no longer exists in ` +
          `${OPENAPI_REL_PATH}. Update or remove it.`
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
          `${OPENAPI_REL_PATH}) but ${route.handlerFile} -> ${route.handlerKey} never reads it, ` +
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

  const violations = collectViolations(repoRoot);
  if (violations.length > 0) {
    console.error('unread query-schema fields — violations:\n');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(`\n${String(violations.length)} violation(s). See POPS-2379.`);
    process.exit(1);
  }
  console.log(
    `OK — every query field on ${String(ROUTES.length)} known purchases route(s) is read or allowlisted.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
