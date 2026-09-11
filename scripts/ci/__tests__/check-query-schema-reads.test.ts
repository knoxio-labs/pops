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
  FINANCE_ROUTES,
  matchBalanced,
  OPENAPI_REL_PATH,
  parseResolverParam,
  PILLARS,
  queryAnchorForRoute,
  queryFieldsForRoute,
  resolveRelativeImport,
  ROUTES,
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
  it('PILLARS names exactly purchases, finance, cerebrum and bfm', () => {
    expect(PILLARS.map((p) => p.name)).toEqual(['purchases', 'finance', 'cerebrum', 'bfm']);
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

  it('FINANCE_ROUTES names all 16 finance routes known to carry query fields', () => {
    expect(FINANCE_ROUTES.length).toBe(16);
  });

  it('CEREBRUM_ROUTES names all 4 cerebrum routes known to carry query fields', () => {
    expect(CEREBRUM_ROUTES.length).toBe(4);
  });

  it('BFM_ROUTES names both bfm mobile routes known to carry query fields', () => {
    expect(BFM_ROUTES.length).toBe(2);
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
  function sandboxPillarRest(pillar: string): string {
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
});
