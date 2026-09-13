/**
 * `check-query-schema-reads.mjs` (POPS-2379, extended beyond purchases by
 * POPS-3484): every query field a route's contract advertises, across every
 * pillar in `PILLARS`, must be read by its handler, directly or through a
 * resolver it calls with the whole `query` object. These tests exercise the
 * unit-level building blocks plus the CLI entry point, including the two
 * historical purchases shapes the guard exists to catch (POPS-1966,
 * POPS-1849/PR #4183) reproduced from their actual pre-fix commits — see
 * `scripts/ci/check-query-schema-reads.mjs`'s own `--self-test`, which runs
 * the same two shapes as part of every guard invocation.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ALLOWLIST,
  BFM_ROUTES,
  blankNonStructural,
  CEREBRUM_ROUTES,
  collectReachableTexts,
  collectViolations,
  extractHandlerEntryText,
  extractImportBindings,
  extractResolverFunctionText,
  fieldIsRead,
  findAnchorCallSites,
  FINANCE_ROUTES,
  FOOD_ROUTES,
  INVENTORY_ROUTES,
  LISTS_ROUTES,
  localFunctionNames,
  matchBalanced,
  MEDIA_ROUTES,
  OPENAPI_REL_PATH,
  parseResolverParam,
  PILLARS,
  queryAnchorForRoute,
  queryFieldsForRoute,
  resolveNamedExportFile,
  resolveNamespaceExportFile,
  resolveRelativeImport,
  ROUTES,
  splitTopLevelCommaList,
} from '../check-query-schema-reads.mjs';

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guardPath = join(repoRoot, 'scripts', 'ci', 'check-query-schema-reads.mjs');

const created: string[] = [];

/**
 * `os.tmpdir()` sits behind a symlink on macOS (`/var` → `/private/var`), and
 * the guard's own CLI entry gate compares `resolve(process.argv[1])` against
 * `resolve(fileURLToPath(import.meta.url))` — the latter comes back
 * realpath-resolved from Node's ESM loader, the former does not, so spawning
 * the guard at a non-realpath'd sandbox path makes it silently do nothing
 * (see `check-vendored-contracts.test.ts` for the same fix, first found there).
 */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'query-schema-reads-test-'));
  created.push(root);
  return realpathSync(root);
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
});

/** @param {string} root @param {string} rel @param {string} body */
function writeFile(root: string, rel: string, body: string): void {
  const abs = join(root, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

describe('against the real repo', () => {
  it('reports every known purchases route clean today', () => {
    expect(collectViolations(repoRoot)).toEqual([]);
  });

  it('ROUTES names at least the eight purchases routes known to carry query fields', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
  });

  it('ALLOWLIST is empty — every field on every known route is read today', () => {
    expect(ALLOWLIST).toEqual([]);
  });

  it('finds query fields for a route known to have them', () => {
    const doc: unknown = JSON.parse(readFileSync(join(repoRoot, OPENAPI_REL_PATH), 'utf8'));
    const fields = queryFieldsForRoute(doc, 'get', '/analytics/product-leaderboard');
    expect(fields).not.toBeNull();
    expect(fields).toEqual(
      expect.arrayContaining([
        'sources',
        'statuses',
        'currency',
        'merchantEntityId',
        'merchantEntityName',
        'merchantUnattributed',
        'from',
        'to',
        'minOrderCount',
      ])
    );
  });

  it('returns null for a route the document does not have', () => {
    const doc = { paths: {} };
    expect(queryFieldsForRoute(doc, 'get', '/nope')).toBeNull();
  });
});

describe('the other real pillars', () => {
  it('PILLARS names exactly purchases, finance, cerebrum, bfm, media, food, lists and inventory', () => {
    expect(PILLARS.map((p) => p.name)).toEqual([
      'purchases',
      'finance',
      'cerebrum',
      'bfm',
      'media',
      'food',
      'lists',
      'inventory',
    ]);
  });

  it.each(PILLARS.map((p) => [p.name, p] as const))(
    'reports %s clean today, at or above its own route floor',
    (_name, pillar) => {
      expect(pillar.routes.length).toBeGreaterThanOrEqual(pillar.minRoutesWithFields);
      expect(
        collectViolations(repoRoot, pillar.routes, pillar.allowlist, {
          openapiRelPath: pillar.openapiRelPath,
          minRoutesWithFields: pillar.minRoutesWithFields,
        })
      ).toEqual([]);
    }
  );

  it('FINANCE_ROUTES names all 17 finance routes known to carry query fields', () => {
    expect(FINANCE_ROUTES.length).toBe(17);
  });

  it('CEREBRUM_ROUTES names all 4 cerebrum routes known to carry query fields', () => {
    expect(CEREBRUM_ROUTES.length).toBe(4);
  });

  it('BFM_ROUTES names both bfm mobile routes known to carry query fields', () => {
    expect(BFM_ROUTES.length).toBe(2);
  });

  it('MEDIA_ROUTES names all 32 media routes known to carry query fields', () => {
    expect(MEDIA_ROUTES.length).toBe(32);
  });

  it('FOOD_ROUTES names all 19 food routes known to carry query fields', () => {
    expect(FOOD_ROUTES.length).toBe(19);
  });

  it('LISTS_ROUTES names both lists routes known to carry query fields', () => {
    expect(LISTS_ROUTES.length).toBe(2);
  });

  it('INVENTORY_ROUTES names all 18 inventory routes known to carry query fields', () => {
    expect(INVENTORY_ROUTES.length).toBe(18);
  });
});

describe('queryFieldsForRoute', () => {
  it('unions GET query parameters with a POST body’s nested `query` object properties', () => {
    const doc = {
      paths: {
        '/search': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      query: { type: 'object', properties: { text: {}, filters: {} } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    expect(queryFieldsForRoute(doc, 'post', '/search')).toEqual(
      expect.arrayContaining(['text', 'filters'])
    );
  });

  it('ignores a body `query` property that is not an object (e.g. left as a free record)', () => {
    const doc = {
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: {
                'application/json': { schema: { properties: { query: { type: 'string' } } } },
              },
            },
          },
        },
      },
    };
    expect(queryFieldsForRoute(doc, 'post', '/x')).toEqual([]);
  });
});

describe('blankNonStructural + matchBalanced', () => {
  it('keeps a brace inside a template-literal interpolation from corrupting depth counting', () => {
    const src = 'const x = { a: `hello ${ {} } world`, b: 1 };';
    const structural = blankNonStructural(src);
    const openIdx = structural.indexOf('{');
    const end = matchBalanced(structural, openIdx, '{', '}');
    expect(src.slice(openIdx, end)).toBe('{ a: `hello ${ {} } world`, b: 1 }');
  });

  it('ignores a comment containing an unbalanced brace', () => {
    const src = 'function f() { // a stray { here\n  return 1;\n}';
    const structural = blankNonStructural(src);
    const openIdx = structural.indexOf('{');
    expect(matchBalanced(structural, openIdx, '{', '}')).toBeGreaterThan(openIdx);
  });

  it('returns -1 for an unbalanced input', () => {
    const structural = blankNonStructural('{ a: 1');
    expect(matchBalanced(structural, 0, '{', '}')).toBe(-1);
  });
});

describe('extractHandlerEntryText', () => {
  it('finds a block-bodied handler entry, skipping an unrelated helper function’s own return object', () => {
    const text = [
      'function notFound(id: string) {',
      '  return { status: 404, message: `not found: ${id}` };',
      '}',
      '',
      'export function makeThingHandlers(db: unknown) {',
      '  return {',
      '    get: async ({ query }: { query: { a?: string } }) => {',
      '      return { status: 200, body: { a: query.a } };',
      '    },',
      '  };',
      '}',
      '',
    ].join('\n');
    const entry = extractHandlerEntryText(text, 'get');
    expect(entry).not.toBeNull();
    expect(entry).toContain('query.a');
    expect(entry).not.toContain('not found');
  });

  it('finds a parenthesised-implicit-return handler entry', () => {
    const text = [
      'export function makeThingHandlers(db: unknown) {',
      '  return {',
      '    list: async ({ query }: { query: { source?: string } }) => ({',
      '      status: 200,',
      '      body: { source: query.source },',
      '    }),',
      '  };',
      '}',
      '',
    ].join('\n');
    const entry = extractHandlerEntryText(text, 'list');
    expect(entry).toContain('query.source');
  });

  it('returns null when the factory cannot be found', () => {
    expect(extractHandlerEntryText('export const x = 1;\n', 'list')).toBeNull();
  });

  it('returns null when the handler key is not present', () => {
    const text =
      'export function makeThingHandlers() {\n  return {\n    other: async () => ({}),\n  };\n}\n';
    expect(extractHandlerEntryText(text, 'list')).toBeNull();
  });

  it('does not match a route key that is a prefix of another (e.g. "list" inside "listAll")', () => {
    const text = [
      'export function makeThingHandlers() {',
      '  return {',
      '    listAll: async ({ query }: { query: { z?: string } }) => ({ status: 200, body: { z: query.z } }),',
      '  };',
      '}',
      '',
    ].join('\n');
    expect(extractHandlerEntryText(text, 'list')).toBeNull();
  });
});

describe('extractImportBindings', () => {
  it('captures a named import', () => {
    const bindings = extractImportBindings("import { resolveThing } from './thing.js';\n");
    expect(bindings).toEqual([['resolveThing', './thing.js']]);
  });

  it('captures a renamed named import', () => {
    const bindings = extractImportBindings("import { resolveThing as doIt } from './thing.js';\n");
    expect(bindings).toEqual([['doIt', './thing.js']]);
  });

  it('captures a default import alongside named imports', () => {
    const bindings = extractImportBindings("import Default, { a, b } from './thing.js';\n");
    expect(bindings).toEqual([
      ['Default', './thing.js'],
      ['a', './thing.js'],
      ['b', './thing.js'],
    ]);
  });

  it('skips a whole-statement type-only import', () => {
    expect(extractImportBindings("import type { Thing } from './thing.js';\n")).toEqual([]);
  });

  it('skips an inline `type X` inside a mixed named-import clause', () => {
    const bindings = extractImportBindings(
      "import { type Thing, resolveThing } from './thing.js';\n"
    );
    expect(bindings).toEqual([['resolveThing', './thing.js']]);
  });

  it('does not follow a namespace import', () => {
    expect(extractImportBindings("import * as ns from './thing.js';\n")).toEqual([]);
  });

  it('ignores an import specifier mentioned only inside a comment', () => {
    const bindings = extractImportBindings(
      "// import { fake } from './nope.js';\nimport { real } from './real.js';\n"
    );
    expect(bindings).toEqual([['real', './real.js']]);
  });
});

describe('resolveRelativeImport', () => {
  it('resolves a `.js`-suffixed relative specifier to its `.ts` source', () => {
    const root = fixtureRoot();
    writeFile(root, 'a/thing.ts', 'export const x = 1;\n');
    const from = join(root, 'a', 'handler.ts');
    expect(resolveRelativeImport(from, './thing.js')).toBe(join(root, 'a', 'thing.ts'));
  });

  it('returns null for a non-relative (workspace package) specifier', () => {
    const from = join(fixtureRoot(), 'a', 'handler.ts');
    expect(resolveRelativeImport(from, '@pops/thing')).toBeNull();
  });

  it('returns null when nothing on disk matches', () => {
    const from = join(fixtureRoot(), 'a', 'handler.ts');
    expect(resolveRelativeImport(from, './missing.js')).toBeNull();
  });
});

describe('fieldIsRead', () => {
  it('recognises a member access', () => {
    expect(fieldIsRead('const s = query.merchantEntityId;', 'merchantEntityId')).toBe(true);
  });

  it('recognises a destructured binding', () => {
    expect(fieldIsRead('const { merchantEntityId } = query;', 'merchantEntityId')).toBe(true);
  });

  it('recognises a renamed destructured binding', () => {
    expect(fieldIsRead('const { merchantEntityId: id } = query;', 'merchantEntityId')).toBe(true);
  });

  it('is false when the field name appears nowhere', () => {
    expect(fieldIsRead('const s = query.sources;', 'merchantEntityId')).toBe(false);
  });

  it('does not match a field name that is only a substring of a longer identifier', () => {
    expect(fieldIsRead('const s = query.merchantEntityIdentifier;', 'merchantEntityId')).toBe(
      false
    );
  });

  it('does NOT count a read through a longer chain that merely ends in the anchor (`other.query.from`)', () => {
    expect(fieldIsRead('const window = other.query.from;', 'from')).toBe(false);
  });

  it('does NOT count a destructuring from a path nested under the anchor (`= query.nested`)', () => {
    expect(fieldIsRead('const { from } = query.nested;', 'from')).toBe(false);
  });

  it('still counts a destructuring from the anchor itself', () => {
    expect(fieldIsRead('const { from } = query;', 'from')).toBe(true);
  });

  it('does NOT count an unrelated `.from` access (e.g. `Array.from`) as reading query.from', () => {
    expect(fieldIsRead('const rows = Array.from(query.items ?? []);', 'from')).toBe(false);
  });

  it('anchors a member access to a custom anchor (a resolver reading its own, differently-named parameter)', () => {
    expect(fieldIsRead('return input.to;', 'to', 'input')).toBe(true);
  });

  it('does not count a member access on a custom anchor for the DEFAULT `query` anchor', () => {
    expect(fieldIsRead('return input.to;', 'to')).toBe(false);
  });

  it('anchors a member access through a dotted path (`body.query`, the POST /search shape)', () => {
    expect(
      fieldIsRead('const scope = searchFilterScope(body.query.filters);', 'filters', 'body.query')
    ).toBe(true);
  });

  it('does not count a destructuring assigned from an unrelated identifier', () => {
    expect(fieldIsRead('const { from } = other;', 'from')).toBe(false);
  });

  it('does not count an aliased destructure where the field name is only the LOCAL binding', () => {
    // Source key is `other`; `from` is merely the local name it is renamed to.
    expect(fieldIsRead('const { other: from } = query;', 'from')).toBe(false);
  });
});

describe('parseResolverParam', () => {
  it('parses a bare identifier', () => {
    expect(parseResolverParam('query')).toEqual({ kind: 'identifier', name: 'query' });
  });

  it('parses an identifier with a type annotation', () => {
    expect(parseResolverParam('input: PurchaseScopeQuery')).toEqual({
      kind: 'identifier',
      name: 'input',
    });
  });

  it('parses a flat destructuring pattern', () => {
    expect(parseResolverParam('{ from, to }')).toEqual({
      kind: 'destructured',
      fields: ['from', 'to'],
    });
  });

  it('reads the SOURCE key of a renamed destructured field, not the local alias', () => {
    expect(parseResolverParam('{ from: start }')).toEqual({
      kind: 'destructured',
      fields: ['from'],
    });
  });

  it('ignores a rest element in a destructured pattern', () => {
    expect(parseResolverParam('{ from, ...rest }')).toEqual({
      kind: 'destructured',
      fields: ['from'],
    });
  });

  it('returns null for an empty parameter list (no query is received at all)', () => {
    expect(parseResolverParam('')).toBeNull();
  });
});

describe('extractResolverFunctionText', () => {
  it('extracts a named function’s own parameter text and body, not a sibling helper’s', () => {
    const text = [
      'export function unrelatedHelper() {',
      '  return Array.from([1, 2, 3]);',
      '}',
      '',
      'export function resolveWindow(input: unknown) {',
      '  return input;',
      '}',
      '',
    ].join('\n');
    const fn = extractResolverFunctionText(text, 'resolveWindow');
    expect(fn).not.toBeNull();
    expect(fn?.paramText.trim()).toBe('input: unknown');
    expect(fn?.bodyText).not.toContain('Array.from');
  });

  it('returns null when the named function is not declared in the file', () => {
    expect(extractResolverFunctionText('export const x = 1;\n', 'resolveWindow')).toBeNull();
  });

  it('skips an object-literal return-type annotation rather than mistaking it for the body', () => {
    // The real `toListInput` shape in `pillars/food/src/api/rest/aliases-handlers.ts`:
    // the return type is itself a `{ … }` object literal, immediately followed
    // by the function's own body `{ … }`. A naive "find the next `{`" would
    // capture the TYPE as the body and never see the real one.
    const text = [
      'function toListInput(query: ListQuery): {',
      '  search?: string;',
      '  target?: AliasTarget;',
      '} {',
      '  return { search: query.search, target: undefined };',
      '}',
      '',
    ].join('\n');
    const fn = extractResolverFunctionText(text, 'toListInput');
    expect(fn).not.toBeNull();
    expect(fn?.bodyText).toContain('query.search');
    expect(fn?.bodyText).not.toContain('search?: string');
  });

  it('still finds a simple identifier return type (no object-literal ambiguity)', () => {
    const text = [
      'function listLibrary(db: unknown, input: LibraryListInput): LibraryListResult {',
      '  return { rows: input.rows };',
      '}',
      '',
    ].join('\n');
    const fn = extractResolverFunctionText(text, 'listLibrary');
    expect(fn?.bodyText).toContain('input.rows');
  });
});

describe('splitTopLevelCommaList', () => {
  it('splits a simple comma list', () => {
    expect(splitTopLevelCommaList('a, b, c')).toEqual(['a', ' b', ' c']);
  });

  it('does not split inside a nested destructuring parameter', () => {
    expect(splitTopLevelCommaList('db, { from, to }')).toEqual(['db', ' { from, to }']);
  });

  it('does not split inside a nested call or array', () => {
    expect(splitTopLevelCommaList('foo(a, b), [c, d]')).toEqual(['foo(a, b)', ' [c, d]']);
  });

  it('returns an empty array for an empty parameter/argument list', () => {
    expect(splitTopLevelCommaList('')).toEqual([]);
  });

  it('returns a single-element array when there is exactly one item', () => {
    expect(splitTopLevelCommaList('query')).toEqual(['query']);
  });
});

describe('findAnchorCallSites', () => {
  it('finds a bare call with the anchor as the sole argument (position 0)', () => {
    expect(findAnchorCallSites('resolve(query)', 'resolve', 'query')).toEqual([
      { method: null, argIndex: 0 },
    ]);
  });

  it('finds a bare call with the anchor at a non-first position', () => {
    expect(findAnchorCallSites('resolveForLine(db, query)', 'resolveForLine', 'query')).toEqual([
      { method: null, argIndex: 1 },
    ]);
  });

  it('finds a namespace-qualified call with the anchor at a non-first position', () => {
    expect(
      findAnchorCallSites('libraryService.listLibrary(db, query)', 'libraryService', 'query')
    ).toEqual([{ method: 'listLibrary', argIndex: 1 }]);
  });

  it('does not match an argument that merely contains the anchor (`query.sources`)', () => {
    expect(findAnchorCallSites('resolve(query.sources)', 'resolve', 'query')).toEqual([]);
  });

  it('does not match a differently-named call', () => {
    expect(findAnchorCallSites('other(query)', 'resolve', 'query')).toEqual([]);
  });

  it('finds every matching call site when the same name is called more than once', () => {
    expect(findAnchorCallSites('ns.a(query); ns.b(db, query);', 'ns', 'query')).toEqual([
      { method: 'a', argIndex: 0 },
      { method: 'b', argIndex: 1 },
    ]);
  });
});

describe('resolveNamespaceExportFile', () => {
  it('resolves a namespace declared directly with `export * as`', () => {
    const root = fixtureRoot();
    writeFile(root, 'a/service.ts', 'export function method() { return 1; }\n');
    writeFile(root, 'a/index.ts', "export * as ns from './service.js';\n");
    expect(resolveNamespaceExportFile(join(root, 'a', 'index.ts'), 'ns')).toBe(
      join(root, 'a', 'service.ts')
    );
  });

  it('follows a bare `export *` re-export chain to find a namespace declared one level deeper', () => {
    // The real media shape: `db/index.ts` re-exports `services/rotation/index.ts`
    // wholesale, and THAT file (not `db/index.ts`) declares
    // `export * as rotationCandidatesService from './candidates.js'`.
    const root = fixtureRoot();
    writeFile(root, 'a/candidates.ts', 'export function listCandidates() { return []; }\n');
    writeFile(
      root,
      'a/rotation-index.ts',
      "export * as rotationCandidatesService from './candidates.js';\n"
    );
    writeFile(root, 'a/index.ts', "export * from './rotation-index.js';\n");
    expect(
      resolveNamespaceExportFile(join(root, 'a', 'index.ts'), 'rotationCandidatesService')
    ).toBe(join(root, 'a', 'candidates.ts'));
  });

  it('returns null when the namespace is never named in the export graph', () => {
    const root = fixtureRoot();
    writeFile(root, 'a/index.ts', "export * from './other.js';\n");
    writeFile(root, 'a/other.ts', 'export const x = 1;\n');
    expect(resolveNamespaceExportFile(join(root, 'a', 'index.ts'), 'nope')).toBeNull();
  });
});

describe('resolveNamedExportFile', () => {
  it('returns the file itself when it declares the function directly', () => {
    const root = fixtureRoot();
    writeFile(root, 'a/scope.ts', 'export function resolveThing() { return 1; }\n');
    expect(resolveNamedExportFile(join(root, 'a', 'scope.ts'), 'resolveThing')).toBe(
      join(root, 'a', 'scope.ts')
    );
  });

  it('follows a named re-export to where the function is actually declared (the real lists shape)', () => {
    const root = fixtureRoot();
    writeFile(root, 'a/list-items-search.ts', 'export function searchListItems() { return []; }\n');
    writeFile(root, 'a/index.ts', "export { searchListItems } from './list-items-search.js';\n");
    expect(resolveNamedExportFile(join(root, 'a', 'index.ts'), 'searchListItems')).toBe(
      join(root, 'a', 'list-items-search.ts')
    );
  });

  it('follows an ALIASED named re-export to the ORIGINAL declared name', () => {
    const root = fixtureRoot();
    writeFile(root, 'a/impl.ts', 'export function original() { return 1; }\n');
    writeFile(root, 'a/index.ts', "export { original as renamed } from './impl.js';\n");
    expect(resolveNamedExportFile(join(root, 'a', 'index.ts'), 'renamed')).toBe(
      join(root, 'a', 'impl.ts')
    );
  });

  it('follows a bare `export *` re-export chain', () => {
    const root = fixtureRoot();
    writeFile(root, 'a/impl.ts', 'export function deepFn() { return 1; }\n');
    writeFile(root, 'a/mid.ts', "export * from './impl.js';\n");
    writeFile(root, 'a/index.ts', "export * from './mid.js';\n");
    expect(resolveNamedExportFile(join(root, 'a', 'index.ts'), 'deepFn')).toBe(
      join(root, 'a', 'impl.ts')
    );
  });

  it('returns null when the function is never declared anywhere in the export graph', () => {
    const root = fixtureRoot();
    writeFile(root, 'a/index.ts', 'export const x = 1;\n');
    expect(resolveNamedExportFile(join(root, 'a', 'index.ts'), 'nope')).toBeNull();
  });
});

describe('localFunctionNames', () => {
  it('finds every function declaration in a file, exported or not', () => {
    const text = [
      'function privateHelper() {}',
      'export function publicHelper() {}',
      'export async function asyncHelper() {}',
      '',
    ].join('\n');
    expect(localFunctionNames(text)).toEqual(
      expect.arrayContaining(['privateHelper', 'publicHelper', 'asyncHelper'])
    );
  });

  it('returns an empty array when the file declares no named function', () => {
    expect(localFunctionNames('export const x = () => 1;\n')).toEqual([]);
  });
});

describe('queryAnchorForRoute', () => {
  it("returns 'query' for a GET route's query-string parameters", () => {
    const doc = { paths: { '/x': { get: { parameters: [{ name: 'a', in: 'query' }] } } } };
    expect(queryAnchorForRoute(doc, 'get', '/x')).toBe('query');
  });

  it("returns 'body.query' for the POST /search body-nested shape", () => {
    const doc = {
      paths: {
        '/search': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { properties: { query: { type: 'object', properties: { text: {} } } } },
                },
              },
            },
          },
        },
      },
    };
    expect(queryAnchorForRoute(doc, 'post', '/search')).toBe('body.query');
  });

  it('returns null for a route not in the document', () => {
    expect(queryAnchorForRoute({ paths: {} }, 'get', '/nope')).toBeNull();
  });
});

describe('collectReachableTexts', () => {
  it('follows a resolver called with the bare `query` identifier, transitively', () => {
    const root = fixtureRoot();
    writeFile(
      root,
      'a/scope.ts',
      [
        "import { resolveMerchant } from './merchant.js';",
        'export function resolveScope(query: unknown) {',
        '  return resolveMerchant(query);',
        '}',
        '',
      ].join('\n')
    );
    writeFile(
      root,
      'a/merchant.ts',
      'export function resolveMerchant(query: { merchantEntityId?: string }) {\n  return query.merchantEntityId;\n}\n'
    );
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(
      root,
      'a/handler.ts',
      "import { resolveScope } from './scope.js';\nexport const entry = 'resolveScope(query)';\n"
    );
    const entryText = 'resolveScope(query)';
    const scopes = collectReachableTexts(handlerAbs, entryText);
    expect(scopes.some((s) => s.text.includes('merchantEntityId') && s.anchor === 'query')).toBe(
      true
    );
  });

  it("anchors a followed resolver's scope to ITS OWN parameter name, not the caller's `query`", () => {
    const root = fixtureRoot();
    writeFile(
      root,
      'a/scope.ts',
      'export function resolveWindow(input: unknown) {\n  return input.to;\n}\n'
    );
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(root, 'a/handler.ts', "import { resolveWindow } from './scope.js';\n");
    const scopes = collectReachableTexts(handlerAbs, 'resolveWindow(query)');
    const resolverScope = scopes.find((s) => s.text.includes('input.to'));
    expect(resolverScope?.anchor).toBe('input');
  });

  it('records a destructured resolver parameter as reading its fields off the CALLER’s anchor', () => {
    const root = fixtureRoot();
    writeFile(
      root,
      'a/scope.ts',
      'export function resolveWindow({ from, to }) {\n  return from;\n}\n'
    );
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(root, 'a/handler.ts', "import { resolveWindow } from './scope.js';\n");
    const scopes = collectReachableTexts(handlerAbs, 'resolveWindow(query)');
    expect(scopes.some((s) => fieldIsRead(s.text, 'from', s.anchor))).toBe(true);
    expect(scopes.some((s) => fieldIsRead(s.text, 'to', s.anchor))).toBe(true);
  });

  it('does not follow a call whose argument is not the bare identifier `query`', () => {
    const root = fixtureRoot();
    writeFile(
      root,
      'a/scope.ts',
      'export function resolveScope(q: unknown) {\n  return q;\n}\nexport const marker = "MARKER_SHOULD_NOT_APPEAR";\n'
    );
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(root, 'a/handler.ts', "import { resolveScope } from './scope.js';\n");
    const entryText = 'resolveScope(query.sources)'; // not the bare identifier
    const scopes = collectReachableTexts(handlerAbs, entryText);
    expect(scopes.some((s) => s.text.includes('MARKER_SHOULD_NOT_APPEAR'))).toBe(false);
  });

  it('does not follow a non-relative (workspace package) import', () => {
    const root = fixtureRoot();
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(root, 'a/handler.ts', "import { resolveScope } from '@pops/thing';\n");
    const scopes = collectReachableTexts(handlerAbs, 'resolveScope(query)');
    expect(scopes).toEqual([{ text: 'resolveScope(query)', anchor: 'query' }]);
  });

  it('follows a namespace-qualified call with query as a non-first positional argument', () => {
    const root = fixtureRoot();
    writeFile(
      root,
      'a/library-service.ts',
      'export function listLibrary(db, input) {\n  return input.genre;\n}\n'
    );
    writeFile(root, 'a/db-index.ts', "export * as libraryService from './library-service.js';\n");
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(root, 'a/handler.ts', "import { libraryService } from './db-index.js';\n");
    const entryText = 'libraryService.listLibrary(db, query)';
    const scopes = collectReachableTexts(handlerAbs, entryText);
    expect(scopes.some((s) => fieldIsRead(s.text, 'genre', s.anchor))).toBe(true);
  });

  it('follows a plain (non-namespace) call with query as a non-first positional argument, transitively (the real food resolveForLine → loadLine shape)', () => {
    const root = fixtureRoot();
    writeFile(
      root,
      'a/loaders.ts',
      'export function loadLine(db, args) {\n  return args.lineIndex;\n}\n'
    );
    writeFile(
      root,
      'a/resolve.ts',
      "import { loadLine } from './loaders.js';\nexport function resolveForLine(db, args) {\n  return loadLine(db, args);\n}\n"
    );
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(root, 'a/handler.ts', "import { resolveForLine } from './resolve.js';\n");
    const entryText = 'resolveForLine(db, query)';
    const scopes = collectReachableTexts(handlerAbs, entryText);
    expect(scopes.some((s) => fieldIsRead(s.text, 'lineIndex', s.anchor))).toBe(true);
  });

  it('follows a call to a helper defined in the SAME file, never imported at all (the real media buildWhereClause / food toListInput shape)', () => {
    const root = fixtureRoot();
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(
      root,
      'a/handler.ts',
      ['function toListInput(query) {', '  return { search: query.search };', '}', ''].join('\n')
    );
    const entryText = 'toListInput(query)';
    const scopes = collectReachableTexts(handlerAbs, entryText);
    expect(scopes.some((s) => fieldIsRead(s.text, 'search', s.anchor))).toBe(true);
  });

  it('follows a namespace call through a two-level `export *` barrel (the real media rotation-candidates shape)', () => {
    const root = fixtureRoot();
    writeFile(
      root,
      'a/candidates.ts',
      'export function listCandidates(db, input) {\n  return input.status;\n}\n'
    );
    writeFile(
      root,
      'a/rotation-index.ts',
      "export * as rotationCandidatesService from './candidates.js';\n"
    );
    writeFile(root, 'a/db-index.ts', "export * from './rotation-index.js';\n");
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(root, 'a/handler.ts', "import { rotationCandidatesService } from './db-index.js';\n");
    const entryText = 'rotationCandidatesService.listCandidates(db, query)';
    const scopes = collectReachableTexts(handlerAbs, entryText);
    expect(scopes.some((s) => fieldIsRead(s.text, 'status', s.anchor))).toBe(true);
  });
});

describe('collectViolations — allowlist validation', () => {
  it('reports a malformed entry missing a field', () => {
    const root = fixtureRoot();
    const violations = collectViolations(root, [], [{ method: 'get', path: '/x' } as never]);
    expect(violations.some((v) => v.includes('missing a method, path or field'))).toBe(true);
  });

  it('reports an entry with a blank reason the same as a missing one', () => {
    const root = fixtureRoot();
    const violations = collectViolations(
      root,
      [],
      [{ method: 'get', path: '/x', field: 'y', reason: '   ' }]
    );
    expect(violations.some((v) => v.includes('has no reason recorded'))).toBe(true);
  });
});

describe('the guard CLI', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  it('passes against the real repo', () => {
    const stdout = execFileSync('node', [guardPath], { encoding: 'utf8' });
    expect(stdout).toContain('OK —');
    expect(stdout).toContain('purchases, finance, cerebrum, bfm');
  });

  it('its self-test passes, including both historical POPS-1966/POPS-1849 shapes', () => {
    const stdout = execFileSync('node', [guardPath, '--self-test'], { encoding: 'utf8' });
    const tally = /(\d+)\/(\d+) self-test cases passed\./u.exec(stdout);
    expect(tally?.[1]).toBeDefined();
    expect(tally?.[1]).toBe(tally?.[2]);
    expect(stdout).not.toContain('FAIL');
  });

  it('rejects an unknown flag with exit code 2', () => {
    expect(() => execFileSync('node', [guardPath, '--nope'], { stdio: 'pipe' })).toThrow();
    try {
      execFileSync('node', [guardPath, '--nope'], { stdio: 'pipe' });
    } catch (error) {
      expect((error as { status?: number }).status).toBe(2);
    }
  });

  it('fails loudly, not with OK, when a real route regresses to dropping a field', () => {
    // Runs the real guard against a sandboxed copy of the real repo tree with
    // one line removed from `purchase-list-keyset.ts` — the same mutation
    // proved in the PR description. Copies only what the guard reads, not the
    // whole repo, to keep the fixture fast.
    const sandbox = fixtureRoot();
    mkdirSync(join(sandbox, 'scripts', 'ci'), { recursive: true });
    execFileSync('cp', ['-R', join(repoRoot, 'scripts', 'ci'), join(sandbox, 'scripts')]);
    mkdirSync(join(sandbox, 'pillars', 'purchases'), { recursive: true });
    execFileSync('cp', [
      '-R',
      join(repoRoot, 'pillars', 'purchases', 'openapi'),
      join(sandbox, 'pillars', 'purchases', 'openapi'),
    ]);
    execFileSync('cp', [
      '-R',
      join(repoRoot, 'pillars', 'purchases', 'src'),
      join(sandbox, 'pillars', 'purchases', 'src'),
    ]);

    const keysetPath = join(
      sandbox,
      'pillars',
      'purchases',
      'src',
      'api',
      'rest',
      'purchase-list-keyset.ts'
    );
    const original = readFileSync(keysetPath, 'utf8');
    const mutated = original
      .replace(
        /if \(\(query\.beforeOrderedAt === undefined\) !== \(query\.beforeId === undefined\)\) \{[\s\S]*?\n  \}\n\n/u,
        ''
      )
      .replace(
        'return { ok: true, beforeOrderedAt, beforeId: query.beforeId };',
        'return { ok: true, beforeOrderedAt };'
      );
    expect(mutated).not.toBe(original);
    writeFileSync(keysetPath, mutated);

    const handlerPath = join(
      sandbox,
      'pillars',
      'purchases',
      'src',
      'api',
      'rest',
      'purchase-handlers.ts'
    );
    const handlerOriginal = readFileSync(handlerPath, 'utf8');
    const handlerMutated = handlerOriginal.replace(/\s*beforeId: keyset\.beforeId,\n/u, '\n');
    expect(handlerMutated).not.toBe(handlerOriginal);
    writeFileSync(handlerPath, handlerMutated);

    let stderr = '';
    let threw = false;
    try {
      execFileSync('node', [join(sandbox, 'scripts', 'ci', 'check-query-schema-reads.mjs')], {
        stdio: 'pipe',
      });
    } catch (error) {
      threw = true;
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }

    expect(threw).toBe(true);
    expect(stderr).toContain("field 'beforeId'");
  });

  /**
   * The POPS-3484 adversarial proof for a newly-added pillar: sandbox its
   * real `openapi/` + `src/api/rest/` (the only files its `PILLARS` entry
   * reads), remove one real field read from one real handler, and confirm
   * the guard flags exactly that field. Lighter than the purchases fixture
   * above — no resolver chain to follow for any of these three, so only the
   * `rest/` directory (not all of `src/`) needs to exist on disk.
   */
  function sandboxPillarRest(pillar: string, extraRelDirs: string[] = []): string {
    const sandbox = fixtureRoot();
    mkdirSync(join(sandbox, 'scripts', 'ci'), { recursive: true });
    execFileSync('cp', ['-R', join(repoRoot, 'scripts', 'ci'), join(sandbox, 'scripts')]);
    mkdirSync(join(sandbox, 'pillars', pillar, 'src', 'api'), { recursive: true });
    execFileSync('cp', [
      '-R',
      join(repoRoot, 'pillars', pillar, 'openapi'),
      join(sandbox, 'pillars', pillar, 'openapi'),
    ]);
    execFileSync('cp', [
      '-R',
      join(repoRoot, 'pillars', pillar, 'src', 'api', 'rest'),
      join(sandbox, 'pillars', pillar, 'src', 'api', 'rest'),
    ]);
    // A namespace- or resolver-chain-following mutation proof needs the
    // service/module files the rest handlers delegate into, which live
    // outside `src/api/rest/` — e.g. media's `src/db/services/library.ts`.
    for (const relDir of extraRelDirs) {
      const dest = join(sandbox, 'pillars', pillar, ...relDir.split('/'));
      mkdirSync(dirname(dest), { recursive: true });
      execFileSync('cp', ['-R', join(repoRoot, 'pillars', pillar, ...relDir.split('/')), dest]);
    }
    return sandbox;
  }

  function expectSandboxGuardToFlag(sandbox: string, fieldName: string): void {
    let stderr = '';
    let threw = false;
    try {
      execFileSync('node', [join(sandbox, 'scripts', 'ci', 'check-query-schema-reads.mjs')], {
        stdio: 'pipe',
      });
    } catch (error) {
      threw = true;
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    expect(threw).toBe(true);
    expect(stderr).toContain(`field '${fieldName}'`);
  }

  it('fails loudly for finance when GET /budgets regresses to dropping `active` (POPS-3484)', () => {
    const sandbox = sandboxPillarRest('finance');
    const handlerPath = join(
      sandbox,
      'pillars',
      'finance',
      'src',
      'api',
      'rest',
      'budgets-handlers.ts'
    );
    const original = readFileSync(handlerPath, 'utf8');
    const mutated = original.replace(
      /let activeFilter: boolean \| undefined;\n\s*if \(query\.active === 'true'\) activeFilter = true;\n\s*else if \(query\.active === 'false'\) activeFilter = false;\n/u,
      'let activeFilter: boolean | undefined;\n'
    );
    expect(mutated).not.toBe(original);
    writeFileSync(handlerPath, mutated);

    expectSandboxGuardToFlag(sandbox, 'active');
  });

  it('fails loudly for cerebrum when GET /tags regresses to dropping `limit` (POPS-3484)', () => {
    const sandbox = sandboxPillarRest('cerebrum');
    const handlerPath = join(
      sandbox,
      'pillars',
      'cerebrum',
      'src',
      'api',
      'rest',
      'tags-handlers.ts'
    );
    const original = readFileSync(handlerPath, 'utf8');
    const mutated = original.replace('listTags(db, prefix, query.limit)', 'listTags(db, prefix)');
    expect(mutated).not.toBe(original);
    writeFileSync(handlerPath, mutated);

    expectSandboxGuardToFlag(sandbox, 'limit');
  });

  it('fails loudly for bfm when GET /mobile/finance/transactions regresses to dropping `accountId` (POPS-3484)', () => {
    const sandbox = sandboxPillarRest('bfm');
    const handlerPath = join(
      sandbox,
      'pillars',
      'bfm',
      'src',
      'api',
      'rest',
      'mobile-finance-handlers.ts'
    );
    const original = readFileSync(handlerPath, 'utf8');
    const mutated = original.replace('accountId: query.accountId ?? null,\n', '');
    expect(mutated).not.toBe(original);
    writeFileSync(handlerPath, mutated);

    expectSandboxGuardToFlag(sandbox, 'accountId');
  });

  it('fails loudly for media when GET /library regresses to dropping `genre`, read only through a namespace-qualified call', () => {
    const sandbox = sandboxPillarRest('media', ['src/db']);
    const servicePath = join(sandbox, 'pillars', 'media', 'src', 'db', 'services', 'library.ts');
    const original = readFileSync(servicePath, 'utf8');
    const mutated = original.replace(
      '  if (input.genre) {\n    conditions.push(\n      sql`EXISTS (SELECT 1 FROM json_each(genres) WHERE json_each.value = ${input.genre})`\n    );\n  }\n',
      ''
    );
    expect(mutated).not.toBe(original);
    writeFileSync(servicePath, mutated);

    expectSandboxGuardToFlag(sandbox, 'genre');
  });

  it('fails loudly for food when GET /substitutions/resolve-line regresses to dropping `recipeVersionId`, read two resolver calls deep', () => {
    // `resolveForLine`'s own body reads `args.lineIndex` directly, so that
    // field survives even a broken `loadLine` — `recipeVersionId` is read
    // ONLY inside `loadLine`, the actual two-levels-deep resolver this
    // mutation targets.
    const sandbox = sandboxPillarRest('food', ['src/api/modules']);
    const loaderPath = join(
      sandbox,
      'pillars',
      'food',
      'src',
      'api',
      'modules',
      'substitutions',
      'substitutions-resolve-line-loaders.ts'
    );
    const original = readFileSync(loaderPath, 'utf8');
    const mutated = original.replace(
      '        eq(recipeLines.recipeVersionId, args.recipeVersionId),\n        eq(recipeLines.position, args.lineIndex)\n',
      '        eq(recipeLines.position, args.lineIndex)\n'
    );
    expect(mutated).not.toBe(original);
    writeFileSync(loaderPath, mutated);

    expectSandboxGuardToFlag(sandbox, 'recipeVersionId');
  });

  it('fails loudly for lists when GET /items regresses to dropping `labelContains`, read through a plain (non-namespace) delegated call', () => {
    const sandbox = sandboxPillarRest('lists', ['src/db']);
    const servicePath = join(
      sandbox,
      'pillars',
      'lists',
      'src',
      'db',
      'services',
      'list-items-search.ts'
    );
    const original = readFileSync(servicePath, 'utf8');
    const mutated = original.replace(
      "    filter.labelContains === undefined\n      ? undefined\n      : sql`${listItems.label} LIKE ${`%${escapeLikePattern(filter.labelContains)}%`} ESCAPE '\\\\'`,\n",
      ''
    );
    expect(mutated).not.toBe(original);
    writeFileSync(servicePath, mutated);

    expectSandboxGuardToFlag(sandbox, 'labelContains');
  });

  it('fails loudly for inventory when GET /items regresses to dropping `assetId`', () => {
    const sandbox = sandboxPillarRest('inventory');
    const handlerPath = join(
      sandbox,
      'pillars',
      'inventory',
      'src',
      'api',
      'rest',
      'items-handlers.ts'
    );
    const original = readFileSync(handlerPath, 'utf8');
    const mutated = original.replace('            assetId: query.assetId,\n', '');
    expect(mutated).not.toBe(original);
    writeFileSync(handlerPath, mutated);

    expectSandboxGuardToFlag(sandbox, 'assetId');
  });
});
