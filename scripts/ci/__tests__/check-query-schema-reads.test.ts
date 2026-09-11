/**
 * `check-query-schema-reads.mjs` (POPS-2379): every query field a purchases
 * route's contract advertises must be read by its handler, directly or
 * through a resolver it calls with the whole `query` object. These tests
 * exercise the unit-level building blocks plus the CLI entry point, including
 * the two historical shapes the guard exists to catch (POPS-1966,
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
  blankNonStructural,
  collectReachableTexts,
  collectViolations,
  extractHandlerEntryText,
  extractImportBindings,
  fieldIsRead,
  matchBalanced,
  OPENAPI_REL_PATH,
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
    const reachable = collectReachableTexts(handlerAbs, entryText);
    expect(reachable).toContain('merchantEntityId');
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
    const reachable = collectReachableTexts(handlerAbs, entryText);
    expect(reachable).not.toContain('MARKER_SHOULD_NOT_APPEAR');
  });

  it('does not follow a non-relative (workspace package) import', () => {
    const root = fixtureRoot();
    const handlerAbs = join(root, 'a', 'handler.ts');
    writeFile(root, 'a/handler.ts', "import { resolveScope } from '@pops/thing';\n");
    const reachable = collectReachableTexts(handlerAbs, 'resolveScope(query)');
    expect(reachable).toBe('resolveScope(query)');
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
    expect(stdout).toContain('8 known purchases route(s)');
  });

  it('its self-test passes, including both historical POPS-1966/POPS-1849 shapes', () => {
    const stdout = execFileSync('node', [guardPath, '--self-test'], { encoding: 'utf8' });
    expect(stdout).toContain('/14 self-test cases passed.');
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
});
