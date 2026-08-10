import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  checkExpectation,
  checkExpectations,
  checkWrapperRegistrations,
  declaredParams,
  discoverCallSites,
  EXPECTATIONS,
  federationSignals,
  findCoverageGaps,
  findDirectFetchGaps,
  findFetchCalls,
  findPillarCalls,
  findWrapperCalls,
  loadProducerDoc,
  PILLAR_CALL_WRAPPERS,
  resolveProducerId,
  SANCTIONED_DIRECT_FETCH,
  scanSource,
  UNPINNABLE_CALL_SITES,
} from '../check-cross-pillar-expectations.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const anExpectation = {
  consumer: 'purchases',
  producer: 'contacts',
  operationId: 'entities.list',
  path: '/entities',
  method: 'get',
  query: ['search', 'limit'],
  usedBy: 'pillars/purchases/src/api/contacts/merchant.ts',
};

describe('scanSource — what is code and what is prose', () => {
  it('blanks a call written inside a line comment', () => {
    const scanned = scanSource("// pillar('never')\nconst x = 1;");
    expect(findPillarCalls(scanned)).toHaveLength(0);
  });

  it('blanks a call written inside a block comment', () => {
    const scanned = scanSource("/**\n * pillar('never') is how this works\n */\nconst x = 1;");
    expect(findPillarCalls(scanned)).toHaveLength(0);
  });

  it('blanks a call written inside a string', () => {
    const scanned = scanSource('const message = "call pillar(\'never\') to reach it";');
    expect(findPillarCalls(scanned)).toHaveLength(0);
  });

  it('blanks `pillar(s)` prose inside a template literal', () => {
    const scanned = scanSource('const m = `${rows.length} pillar(s) inspected`;');
    expect(findPillarCalls(scanned)).toHaveLength(0);
  });

  it('still sees a real call interpolated into a template literal', () => {
    const scanned = scanSource("const m = `${pillar<R>('lists').id}`;");
    expect(findPillarCalls(scanned).map((c) => c.argument)).toEqual(["'lists'"]);
  });

  it('keeps string bodies readable in `code` while blanking them in `scannable`', () => {
    const scanned = scanSource("const id = 'contacts';");
    expect(scanned.code).toContain("'contacts'");
    expect(scanned.scannable).not.toContain('contacts');
    expect(scanned.scannable).toHaveLength(scanned.code.length);
  });

  it('does not treat a `//` inside a string as a comment', () => {
    const scanned = scanSource("const url = 'https://x/';\nconst h = pillar<R>('lists');");
    expect(scanned.unterminated).toBeNull();
    expect(findPillarCalls(scanned)).toHaveLength(1);
  });

  it('reads a slash after an identifier as division, not a regex opener', () => {
    const scanned = scanSource("const page = offset / SIZE;\nconst h = pillar<R>('lists');");
    expect(scanned.unterminated).toBeNull();
    expect(findPillarCalls(scanned)).toHaveLength(1);
  });

  it('reads a slash after `return` as a regex opener', () => {
    const scanned = scanSource("const f = () => { return /a\\/\\/b/u.test('x'); };");
    expect(scanned.unterminated).toBeNull();
    expect(scanned.scannable).not.toContain('a');
  });

  it('reads a slash after `=>` as a regex opener', () => {
    const scanned = scanSource(
      "const f = (v) => /^\\/\\//u.test(v);\nconst h = pillar<R>('lists');"
    );
    expect(scanned.unterminated).toBeNull();
    expect(findPillarCalls(scanned)).toHaveLength(1);
  });

  it('survives a JSX closing tag, whose slash follows a `<`', () => {
    const scanned = scanSource(
      "const C = () => <div className='x'>hi</div>;\nconst h = pillar<R>('lists');"
    );
    expect(scanned.unterminated).toBeNull();
    expect(findPillarCalls(scanned)).toHaveLength(1);
  });

  it('keeps offsets aligned past an astral character', () => {
    const scanned = scanSource("const emoji = '🔥';\nconst h = pillar<R>('lists');");
    expect(scanned.unterminated).toBeNull();
    expect(findPillarCalls(scanned)).toEqual([{ argument: "'lists'", line: 2 }]);
  });

  it('reports rather than tolerates an unterminated block comment', () => {
    expect(scanSource('/* never closed').unterminated).toBe('block comment');
  });

  it('reports rather than tolerates an unterminated template literal', () => {
    expect(scanSource('const t = `never closed').unterminated).toBe('template literal');
  });

  it('reports rather than tolerates an unterminated string literal', () => {
    expect(scanSource("const s = 'never closed\nconst x = 1;").unterminated).toBe('string literal');
  });
});

describe('findPillarCalls', () => {
  it('finds the generic form', () => {
    expect(findPillarCalls(scanSource("pillar<FinanceRouter>('finance')"))).toEqual([
      { argument: "'finance'", line: 1 },
    ]);
  });

  it('finds the bare form, which carries the same seam', () => {
    expect(findPillarCalls(scanSource('const h: PillarHandle<X> = pillar(ID);'))).toEqual([
      { argument: 'ID', line: 1 },
    ]);
  });

  it('does not swallow the call when the type argument holds an arrow', () => {
    expect(findPillarCalls(scanSource("pillar<() => void>('lists')"))).toEqual([
      { argument: "'lists'", line: 1 },
    ]);
  });

  it('handles a nested type argument', () => {
    expect(findPillarCalls(scanSource("pillar<Record<string, unknown>>('lists')"))).toEqual([
      { argument: "'lists'", line: 1 },
    ]);
  });

  it('ignores a same-named method on another object', () => {
    expect(findPillarCalls(scanSource("sdk.pillar('lists')"))).toHaveLength(0);
  });

  it('ignores a longer identifier that merely ends in the token', () => {
    expect(findPillarCalls(scanSource("getPillar<R>('lists')"))).toHaveLength(0);
  });

  it('ignores the import that brings the function in', () => {
    expect(
      findPillarCalls(scanSource("import { isOk, pillar } from '@pops/pillar-sdk/client';"))
    ).toHaveLength(0);
  });

  it('ignores an object property that happens to be called pillar', () => {
    expect(findPillarCalls(scanSource('const meta = { pillar: FINANCE_PILLAR_ID };'))).toHaveLength(
      0
    );
  });

  it('reports the line the call is written on', () => {
    expect(findPillarCalls(scanSource("\n\n\npillar<R>('lists')")).map((c) => c.line)).toEqual([4]);
  });

  it('reads only the first argument, not the options object', () => {
    expect(findPillarCalls(scanSource("pillar<R>('lists', { transport, cacheTtlMs: 0 })"))).toEqual(
      [{ argument: "'lists'", line: 1 }]
    );
  });
});

describe('findWrapperCalls', () => {
  const wrapper = { typeName: 'PillarGateway', method: 'call', definedIn: 'gateway.ts' };

  it('finds a call through an identifier bound by a parameter type annotation', () => {
    const scanned = scanSource(
      "function f(gateway: PillarGateway) { return gateway.call<R, unknown>('finance', cb); }"
    );
    expect(findWrapperCalls(scanned, [wrapper])).toEqual([{ argument: "'finance'", line: 1 }]);
  });

  it('reads whatever the bound identifier is named, not a fixed name', () => {
    const scanned = scanSource(
      "function f(cerebrumGateway: PillarGateway) { return cerebrumGateway.call('cerebrum', cb); }"
    );
    expect(findWrapperCalls(scanned, [wrapper])).toEqual([{ argument: "'cerebrum'", line: 1 }]);
  });

  it('ignores a `.call` on an identifier not bound to a registered wrapper type', () => {
    const scanned = scanSource('function f(other: SomeOtherType) { return other.call(pillarId); }');
    expect(findWrapperCalls(scanned, [wrapper])).toHaveLength(0);
  });

  it('ignores an unrelated `.call` entirely when no wrapper type is bound in the file', () => {
    expect(findWrapperCalls(scanSource("fn.call(null, 'arg');"), [wrapper])).toHaveLength(0);
  });

  it('returns nothing when no wrapper is registered', () => {
    const scanned = scanSource("function f(gateway: PillarGateway) { return gateway.call('x'); }");
    expect(findWrapperCalls(scanned, [])).toHaveLength(0);
  });

  it('finds every call when two identifiers are bound to the same wrapper type', () => {
    const scanned = scanSource(
      [
        "function a(gateway: PillarGateway) { gateway.call('one', cb); }",
        "function b(otherGateway: PillarGateway) { otherGateway.call('two', cb); }",
      ].join('\n')
    );
    expect(findWrapperCalls(scanned, [wrapper]).map((c) => c.argument)).toEqual(["'one'", "'two'"]);
  });

  it('blanks a wrapper-shaped call written inside a comment', () => {
    const scanned = scanSource(
      "// function f(gateway: PillarGateway) { gateway.call('never'); }\nconst x = 1;"
    );
    expect(findWrapperCalls(scanned, [wrapper])).toHaveLength(0);
  });
});

describe('checkWrapperRegistrations', () => {
  let scratch: string;
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'cross-pillar-wrapper-registration-'));
    writeFileSync(join(scratch, 'gateway.ts'), 'export interface PillarGateway { call(): void; }');
    writeFileSync(join(scratch, 'alias.ts'), 'export type PillarGateway = { call(): void };');
    writeFileSync(join(scratch, 'renamed.ts'), 'export interface SomethingElse { call(): void; }');
    writeFileSync(
      join(scratch, 'commented-out.ts'),
      '// export interface PillarGateway { call(): void; }\nconst note = "interface PillarGateway";'
    );
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it('passes when the type is still declared where it is registered', () => {
    expect(
      checkWrapperRegistrations(scratch, [
        { typeName: 'PillarGateway', method: 'call', definedIn: 'gateway.ts' },
      ])
    ).toEqual([]);
  });

  it('accepts a type alias, not only an interface', () => {
    expect(
      checkWrapperRegistrations(scratch, [
        { typeName: 'PillarGateway', method: 'call', definedIn: 'alias.ts' },
      ])
    ).toEqual([]);
  });

  it('fails when the type has been renamed or moved out of the registered file', () => {
    const failures = checkWrapperRegistrations(scratch, [
      { typeName: 'PillarGateway', method: 'call', definedIn: 'renamed.ts' },
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('no such type is declared');
  });

  it('fails when the registered file does not exist', () => {
    const failures = checkWrapperRegistrations(scratch, [
      { typeName: 'PillarGateway', method: 'call', definedIn: 'missing.ts' },
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('does not exist');
  });

  it('does not let a type name inside a comment or string satisfy the declaration', () => {
    const failures = checkWrapperRegistrations(scratch, [
      { typeName: 'PillarGateway', method: 'call', definedIn: 'commented-out.ts' },
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('no such type is declared');
  });
});

describe('findFetchCalls', () => {
  it('finds a plain call', () => {
    expect(findFetchCalls(scanSource('const r = await fetch(url);'))).toEqual([
      { argument: 'url', line: 1 },
    ]);
  });

  it('finds the injected-transport spelling every hand-rolled client uses', () => {
    expect(findFetchCalls(scanSource('const r = await fetchImpl(url, init);'))).toHaveLength(1);
  });

  it('finds a dotted call, which is the most obvious way to dodge the check', () => {
    expect(findFetchCalls(scanSource('const r = await globalThis.fetch(url);'))).toHaveLength(1);
  });

  it('ignores a bare reference, so a defaulted parameter is not a call', () => {
    expect(findFetchCalls(scanSource('const f: FetchImpl = globalThis.fetch;'))).toHaveLength(0);
  });

  it('ignores a longer identifier that merely starts with the token', () => {
    expect(findFetchCalls(scanSource('const b = await fetchJson(url);'))).toHaveLength(0);
    expect(findFetchCalls(scanSource('const b = await fetchPillarHealth();'))).toHaveLength(0);
  });

  it('ignores a longer identifier that merely ends with the token', () => {
    expect(findFetchCalls(scanSource('const b = await prefetch(url);'))).toHaveLength(0);
  });

  it('ignores a call written inside a comment or a string', () => {
    expect(findFetchCalls(scanSource('// fetch(url)\nconst s = "fetch(url)";'))).toHaveLength(0);
  });
});

describe('federationSignals', () => {
  it('marks a file importing the fleet base-URL parser', () => {
    const code = "import { parsePillarsEnv } from '@pops/pillar-sdk/pillar-env';";
    expect(federationSignals(code)).toHaveLength(1);
  });

  it('marks a file handling registry entries', () => {
    expect(federationSignals("import type { PillarRegistryEntry } from '@pops/types';")).toEqual([
      'handles registry entries',
    ]);
  });

  it('marks a file reading the pillar roster', () => {
    expect(federationSignals("process.env['POPS_PILLARS']")).toEqual(['reads the pillar roster']);
  });

  it('does not mark a file whose only mention is prose in a comment', () => {
    const scanned = scanSource('/** POPS_PILLARS is deliberately not read here. */\nexport {};');
    expect(federationSignals(scanned.code)).toEqual([]);
  });

  it('does not mark an ordinary external-API client', () => {
    const code = 'const res = await fetch(`${provider.baseUrl}/api/tags`);';
    expect(federationSignals(code)).toEqual([]);
  });
});

describe('findDirectFetchGaps', () => {
  const site = (over: Record<string, unknown> = {}) => ({
    consumer: 'registry',
    file: 'pillars/registry/src/api/pillars/dispatcher.ts',
    line: 137,
    signals: ['handles registry entries'],
    ...over,
  });
  const sanction = { file: 'pillars/registry/src/api/pillars/dispatcher.ts', reason: 'runtime' };

  it('passes a sanctioned call', () => {
    const report = findDirectFetchGaps([site()], [sanction]);
    expect(report.unsanctioned).toEqual([]);
    expect(report.sanctioned).toBe(1);
    expect(report.staleSanctions).toEqual([]);
  });

  it('fails a call nothing sanctions', () => {
    const report = findDirectFetchGaps(
      [site({ file: 'pillars/food/src/api/lists.ts' })],
      [sanction]
    );
    expect(report.unsanctioned.map((s) => s.file)).toEqual(['pillars/food/src/api/lists.ts']);
  });

  it('fails a sanction that no longer covers any call', () => {
    expect(findDirectFetchGaps([], [sanction]).staleSanctions).toEqual([sanction.file]);
  });

  it('does not let a sanction hide a hand-rolled call elsewhere in the tree', () => {
    const report = findDirectFetchGaps(
      [site(), site({ file: 'pillars/food/src/api/lists.ts' })],
      [sanction]
    );
    expect(report.unsanctioned).toHaveLength(1);
    expect(report.staleSanctions).toEqual([]);
  });
});

describe('resolveProducerId', () => {
  it('resolves a single-quoted literal', () => {
    expect(resolveProducerId("'contacts'", '')).toBe('contacts');
  });

  it('resolves a double-quoted literal', () => {
    expect(resolveProducerId('"contacts"', '')).toBe('contacts');
  });

  it('resolves a backtick literal with no interpolation', () => {
    expect(resolveProducerId('`contacts`', '')).toBe('contacts');
  });

  it('resolves a local const bound to a literal', () => {
    expect(
      resolveProducerId('CONTACTS_PILLAR_ID', "export const CONTACTS_PILLAR_ID = 'contacts';")
    ).toBe('contacts');
  });

  it('resolves a local const carrying a type annotation', () => {
    expect(resolveProducerId('ID', "const ID: PillarId = 'documents';")).toBe('documents');
  });

  it('resolves an identifier containing a regex metacharacter', () => {
    // `$` is legal in an identifier. Interpolated raw it reads as end-of-input
    // and the binding can never match, so the call site is reported unresolved
    // and someone is sent to write an exemption for a seam that is pinnable.
    expect(resolveProducerId('$CONTACTS_ID', "const $CONTACTS_ID = 'contacts';")).toBe('contacts');
  });

  it('refuses a function parameter', () => {
    expect(resolveProducerId('pillarId', 'export function f(pillarId: string) {}')).toBeNull();
  });

  it('refuses a nested binding, which would answer for an unrelated parameter', () => {
    const source = [
      'export function dispatch(pillarId: string) {',
      "  const pillarId = 'lists';",
      '  return pillar(pillarId);',
      '}',
    ].join('\n');
    expect(resolveProducerId('pillarId', source)).toBeNull();
  });

  it('refuses a reassignable binding, which pins nothing', () => {
    expect(resolveProducerId('ID', "let ID = 'contacts';")).toBeNull();
  });

  it('refuses an identifier imported from elsewhere', () => {
    expect(resolveProducerId('REMOTE_ID', "import { REMOTE_ID } from './ids.js';")).toBeNull();
  });

  it('refuses a computed expression', () => {
    expect(resolveProducerId('`${prefix}-lists`', '')).toBeNull();
  });
});

describe('discoverCallSites — fixture tree', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'cross-pillar-'));
    const write = (relative: string, body: string): void => {
      const full = join(root, relative);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    };

    write('pillars/alpha/src/api/client.ts', "const h = pillar<R>('beta');");
    write('pillars/alpha/src/api/__tests__/client.test.ts', "pillar<R>('ghost');");
    write('pillars/alpha/src/api/client.test.ts', "pillar<R>('ghost');");
    write('pillars/alpha/src/ui/Widget.tsx', "const h = pillar<R>('gamma');");
    write('pillars/alpha/app/src/page.ts', "pillar<R>('ghost');");
    write('pillars/beta/src/dispatch.ts', 'const h = pillar<R>(pillarId);');
    write('pillars/beta/README.md', "pillar<R>('ghost')");
    write('pillars/gamma/docs/notes.ts', "pillar<R>('ghost');");
    write(
      'pillars/alpha/src/api/hand-rolled.ts',
      [
        "import { parsePillarsEnv } from '@pops/pillar-sdk/pillar-env';",
        'const res = await fetch(`${baseUrl}/items`);',
      ].join('\n')
    );
    write('pillars/alpha/src/api/tmdb.ts', 'const res = await fetch(`${BASE_URL}/movie`);');
    write(
      'pillars/beta/src/api/wrapper.ts',
      [
        "const WRAPPER_TARGET = 'gamma';",
        'function useWrapper(gateway: PillarGateway) {',
        '  return gateway.call<R, unknown>(WRAPPER_TARGET, (h) => h.x());',
        '}',
      ].join('\n')
    );
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('finds a call in a pillar src file', () => {
    expect(discoverCallSites(root).sites).toContainEqual({
      consumer: 'alpha',
      producer: 'beta',
      argument: "'beta'",
      file: 'pillars/alpha/src/api/client.ts',
      line: 1,
    });
  });

  it('scans .tsx as well as .ts', () => {
    expect(discoverCallSites(root).sites.map((s) => s.file)).toContain(
      'pillars/alpha/src/ui/Widget.tsx'
    );
  });

  it('records a runtime-chosen target as unresolved rather than skipping it', () => {
    expect(discoverCallSites(root).sites).toContainEqual({
      consumer: 'beta',
      producer: null,
      argument: 'pillarId',
      file: 'pillars/beta/src/dispatch.ts',
      line: 1,
    });
  });

  it('ignores __tests__ directories, .test.ts files, non-source files and dirs outside src', () => {
    expect(discoverCallSites(root).sites.map((s) => s.producer)).not.toContain('ghost');
  });

  it('follows a registered wrapper call, not just a literal pillar() token', () => {
    expect(discoverCallSites(root).sites).toContainEqual({
      consumer: 'beta',
      producer: 'gamma',
      argument: 'WRAPPER_TARGET',
      file: 'pillars/beta/src/api/wrapper.ts',
      line: 3,
    });
  });

  it('reports a source it could not finish scanning instead of passing over it', () => {
    const broken = mkdtempSync(join(tmpdir(), 'cross-pillar-broken-'));
    try {
      mkdirSync(join(broken, 'pillars', 'alpha', 'src'), { recursive: true });
      writeFileSync(join(broken, 'pillars', 'alpha', 'src', 'x.ts'), '/* never closed');
      const { sites, scanErrors } = discoverCallSites(broken);
      expect(sites).toHaveLength(0);
      expect(scanErrors).toHaveLength(1);
      expect(scanErrors[0]).toContain('unterminated block comment');
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  });

  it('reports a missing pillars directory rather than answering "no call sites"', () => {
    const empty = mkdtempSync(join(tmpdir(), 'cross-pillar-empty-'));
    try {
      const { sites, directFetchSites, scanErrors } = discoverCallSites(empty);
      expect(sites).toHaveLength(0);
      expect(directFetchSites).toHaveLength(0);
      expect(scanErrors[0]).toContain('no pillars directory');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('reports a hand-rolled fetch in a federation-aware file', () => {
    expect(discoverCallSites(root).directFetchSites).toContainEqual({
      consumer: 'alpha',
      file: 'pillars/alpha/src/api/hand-rolled.ts',
      line: 2,
      signals: ["imports the fleet's pillar base-URL parser"],
    });
  });

  it('leaves an ordinary external-API client alone', () => {
    expect(discoverCallSites(root).directFetchSites.map((s) => s.file)).not.toContain(
      'pillars/alpha/src/api/tmdb.ts'
    );
  });
});

describe('findCoverageGaps', () => {
  const site = (over: Record<string, unknown> = {}) => ({
    consumer: 'purchases',
    producer: 'contacts' as string | null,
    argument: "'contacts'",
    file: 'pillars/purchases/src/api/contacts/merchant.ts',
    line: 143,
    ...over,
  });
  const row = { consumer: 'purchases', producer: 'contacts' };

  it('passes a call site whose seam has a row', () => {
    expect(findCoverageGaps([site()], [row], []).unlisted).toEqual([]);
  });

  it('fails a call site whose seam has no row', () => {
    const report = findCoverageGaps([site({ producer: 'lists' })], [row], []);
    expect(report.unlisted.map((s) => s.producer)).toEqual(['lists']);
  });

  it('fails a call site whose consumer differs from every row, same producer', () => {
    expect(findCoverageGaps([site({ consumer: 'media' })], [row], []).unlisted).toHaveLength(1);
  });

  it('fails an unresolved target that nothing exempts', () => {
    const report = findCoverageGaps([site({ producer: null, argument: 'pillarId' })], [row], []);
    expect(report.unresolved).toHaveLength(1);
  });

  it('accepts an unresolved target in an exempted file', () => {
    const exempt = [{ file: 'pillars/mcp/src/pillar-client.ts', reason: 'runtime dispatch' }];
    const report = findCoverageGaps(
      [site({ producer: null, argument: 'pillarId', file: 'pillars/mcp/src/pillar-client.ts' })],
      [row],
      exempt
    );
    expect(report.unresolved).toEqual([]);
    expect(report.exempted).toBe(1);
    expect(report.staleExemptions).toEqual([]);
  });

  it('fails an exemption that no longer covers any call site', () => {
    const report = findCoverageGaps(
      [site()],
      [row],
      [{ file: 'pillars/gone/src/x.ts', reason: 'r' }]
    );
    expect(report.staleExemptions).toEqual(['pillars/gone/src/x.ts']);
  });

  it('does not let an exemption hide a resolvable seam elsewhere in the tree', () => {
    const exempt = [{ file: 'pillars/mcp/src/pillar-client.ts', reason: 'runtime dispatch' }];
    const report = findCoverageGaps(
      [
        site({ producer: null, argument: 'id', file: 'pillars/mcp/src/pillar-client.ts' }),
        site({ producer: 'lists', file: 'pillars/purchases/src/other.ts' }),
      ],
      [row],
      exempt
    );
    expect(report.unlisted).toHaveLength(1);
  });
});

describe('checkExpectation', () => {
  const doc = (operation: unknown, path = '/entities') => ({
    paths: { [path]: { get: operation } },
  });
  const withQuery = (names: string[]) => names.map((name) => ({ name, in: 'query' }));

  it('passes a document that still matches', () => {
    expect(
      checkExpectation(
        anExpectation,
        doc({ operationId: 'entities.list', parameters: withQuery(['search', 'limit']) })
      )
    ).toEqual([]);
  });

  it('fails a renamed operationId', () => {
    expect(checkExpectation(anExpectation, doc({ operationId: 'entities.query' }))).toHaveLength(1);
  });

  it('fails a moved path', () => {
    const moved = doc(
      { operationId: 'entities.list', parameters: withQuery(['search', 'limit']) },
      '/contacts'
    );
    expect(checkExpectation(anExpectation, moved).join(' ')).toContain('moved');
  });

  it('fails a dropped query parameter', () => {
    const dropped = doc({ operationId: 'entities.list', parameters: withQuery(['search']) });
    expect(checkExpectation(anExpectation, dropped).join(' ')).toContain("'limit'");
  });

  it('fails a document with no paths object rather than passing vacuously', () => {
    expect(checkExpectation(anExpectation, {})).toHaveLength(1);
    expect(checkExpectation(anExpectation, null)).toHaveLength(1);
  });

  it('reports a duplicated operationId instead of letting the last match win', () => {
    const duplicated = {
      paths: {
        '/entities': {
          get: { operationId: 'entities.list', parameters: withQuery(['search', 'limit']) },
        },
        '/entities/all': {
          get: { operationId: 'entities.list', parameters: withQuery(['search', 'limit']) },
        },
      },
    };
    const failures = checkExpectation(anExpectation, duplicated);
    expect(failures.join(' ')).toContain('2 times');
    expect(failures.join(' ')).toContain('/entities/all');
  });

  it('does not silently pass when a second declaration sits at the expected path', () => {
    // The pre-fix loop kept the LAST match, so a stray duplicate at the right
    // path masked a first declaration that had moved. Both are reported now.
    const duplicated = {
      paths: {
        '/moved-away': { get: { operationId: 'entities.list' } },
        '/entities': {
          get: { operationId: 'entities.list', parameters: withQuery(['search', 'limit']) },
        },
      },
    };
    expect(checkExpectation(anExpectation, duplicated).join(' ')).toContain('2 times');
  });

  it('accepts a path parameter hoisted to the path item, which is legal OpenAPI', () => {
    const hoisted = {
      paths: {
        '/entities/{id}': {
          parameters: [{ name: 'id', in: 'path' }],
          get: { operationId: 'entities.get' },
        },
      },
    };
    const expectation = {
      ...anExpectation,
      operationId: 'entities.get',
      path: '/entities/{id}',
      query: [],
      pathParams: ['id'],
    };
    expect(checkExpectation(expectation, hoisted)).toEqual([]);
  });

  it('accepts a query parameter hoisted to the path item', () => {
    const hoisted = {
      paths: {
        '/entities': {
          parameters: withQuery(['search']),
          get: { operationId: 'entities.list', parameters: withQuery(['limit']) },
        },
      },
    };
    expect(checkExpectation(anExpectation, hoisted)).toEqual([]);
  });

  it('fails a renamed path parameter', () => {
    const renamed = {
      paths: {
        '/entities/{id}': {
          get: { operationId: 'entities.get', parameters: [{ name: 'entityId', in: 'path' }] },
        },
      },
    };
    const expectation = {
      ...anExpectation,
      operationId: 'entities.get',
      path: '/entities/{id}',
      query: [],
      pathParams: ['id'],
    };
    expect(checkExpectation(expectation, renamed).join(' ')).toContain("path parameter 'id'");
  });

  it('does not mistake a non-method path-item key for an operation', () => {
    const withSiblings = {
      paths: {
        '/entities': {
          summary: 'Contacts',
          parameters: withQuery(['search', 'limit']),
          get: { operationId: 'entities.list' },
        },
      },
    };
    expect(checkExpectation(anExpectation, withSiblings)).toEqual([]);
  });
});

describe('declaredParams', () => {
  it('unions the path-item list with the operation list', () => {
    const names = declaredParams(
      { parameters: [{ name: 'limit', in: 'query' }] },
      { parameters: [{ name: 'search', in: 'query' }] },
      'query'
    );
    expect([...names].toSorted()).toEqual(['limit', 'search']);
  });

  it('filters by location', () => {
    const names = declaredParams(
      {
        parameters: [
          { name: 'id', in: 'path' },
          { name: 'limit', in: 'query' },
        ],
      },
      {},
      'path'
    );
    expect([...names]).toEqual(['id']);
  });

  it('tolerates a missing or non-array parameters key', () => {
    expect(declaredParams({}, {}, 'query').size).toBe(0);
    expect(declaredParams({ parameters: 'nope' }, {}, 'query').size).toBe(0);
  });
});

describe('loadProducerDoc', () => {
  let scratch: string;
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'cross-pillar-docs-'));
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it('reports a producer with no published OpenAPI', () => {
    const result = loadProducerDoc('ghost', join(scratch, 'absent.json'));
    expect(result.doc).toBeNull();
    expect(result.failure).toContain('no published OpenAPI at');
  });

  it('reports an OpenAPI document that is not valid JSON', () => {
    const corrupt = join(scratch, 'corrupt.json');
    writeFileSync(corrupt, '{ "paths": ');
    const result = loadProducerDoc('ghost', corrupt);
    expect(result.doc).toBeNull();
    expect(result.failure).toContain('not valid JSON');
  });

  it('parses a well-formed document', () => {
    const good = join(scratch, 'good.json');
    writeFileSync(good, '{"paths":{}}');
    expect(loadProducerDoc('ghost', good)).toEqual({ doc: { paths: {} }, failure: null });
  });
});

describe('checkExpectations', () => {
  it('fails an empty expectation list rather than reporting nothing to check', () => {
    expect(checkExpectations(repoRoot, []).join(' ')).toContain('EXPECTATIONS is empty');
  });

  it('fails a row whose usedBy no longer exists', () => {
    const rotted = { ...anExpectation, usedBy: 'pillars/purchases/src/api/gone.ts' };
    expect(checkExpectations(repoRoot, [rotted]).join(' ')).toContain('does not exist');
  });
});

describe('against the live repo', () => {
  it('EXPECTATIONS is not empty', () => {
    expect(EXPECTATIONS.length).toBeGreaterThan(0);
  });

  it('every expectation holds against the producer OpenAPI on disk', () => {
    expect(checkExpectations(repoRoot, EXPECTATIONS)).toEqual([]);
  });

  it('scans every pillar source without losing its place', () => {
    expect(discoverCallSites(repoRoot).scanErrors).toEqual([]);
  });

  it('finds the purchases -> contacts call site the curated list used to miss', () => {
    const sites = discoverCallSites(repoRoot).sites;
    expect(sites).toContainEqual(
      expect.objectContaining({
        consumer: 'purchases',
        producer: 'contacts',
        file: 'pillars/purchases/src/api/contacts/merchant.ts',
      })
    );
  });

  it('every discovered call site is either pinned by a row or exempted', () => {
    const { sites } = discoverCallSites(repoRoot);
    expect(sites.length).toBeGreaterThan(0);
    expect(findCoverageGaps(sites, EXPECTATIONS, UNPINNABLE_CALL_SITES)).toEqual({
      unlisted: [],
      unresolved: [],
      staleExemptions: [],
      exempted: expect.any(Number),
    });
  });

  it('would report the seam if a row were removed', () => {
    const { sites } = discoverCallSites(repoRoot);
    const without = EXPECTATIONS.filter(
      (e: { consumer: string; producer: string }) =>
        !(e.consumer === 'purchases' && e.producer === 'contacts')
    );
    const report = findCoverageGaps(sites, without, UNPINNABLE_CALL_SITES);
    expect(report.unlisted.map((s) => s.file)).toContain(
      'pillars/purchases/src/api/contacts/merchant.ts'
    );
  });

  it('every exemption carries a reason', () => {
    for (const exemption of UNPINNABLE_CALL_SITES) {
      expect(exemption.reason.length).toBeGreaterThan(20);
    }
  });

  it('pins the two seams that used to hand-roll their HTTP', () => {
    const { sites } = discoverCallSites(repoRoot);
    const seams = sites.map((s) => `${s.consumer} -> ${String(s.producer)}`);
    expect(seams).toContain('food -> lists');
    expect(seams).toContain('cerebrum -> finance');
    expect(seams).toContain('cerebrum -> media');
    expect(seams).toContain('cerebrum -> inventory');
  });

  it('finds direct-fetch calls in the live tree, and every one is sanctioned', () => {
    const { directFetchSites } = discoverCallSites(repoRoot);
    expect(directFetchSites.length).toBeGreaterThan(0);
    expect(findDirectFetchGaps(directFetchSites, SANCTIONED_DIRECT_FETCH)).toEqual({
      unsanctioned: [],
      staleSanctions: [],
      sanctioned: expect.any(Number),
    });
  });

  it('would report a direct-fetch seam if its sanction were removed', () => {
    const { directFetchSites } = discoverCallSites(repoRoot);
    const target = 'pillars/registry/src/api/pillars/dispatcher.ts';
    const without = SANCTIONED_DIRECT_FETCH.filter((s: { file: string }) => s.file !== target);
    expect(
      findDirectFetchGaps(directFetchSites, without).unsanctioned.map((s) => s.file)
    ).toContain(target);
  });

  it('every direct-fetch sanction carries a reason', () => {
    for (const sanction of SANCTIONED_DIRECT_FETCH) {
      expect(sanction.reason.length).toBeGreaterThan(20);
    }
  });

  it('every registered wrapper still names a type declared where it says it is', () => {
    expect(PILLAR_CALL_WRAPPERS.length).toBeGreaterThan(0);
    expect(checkWrapperRegistrations(repoRoot, PILLAR_CALL_WRAPPERS)).toEqual([]);
  });

  it("discovers bfm's finance calls through PillarGateway.call, not a literal pillar() token", () => {
    const { sites } = discoverCallSites(repoRoot);
    const bfmFinanceSites = sites.filter(
      (s) => s.consumer === 'bfm' && s.file === 'pillars/bfm/src/api/finance/client.ts'
    );
    expect(bfmFinanceSites).toHaveLength(2);
    expect(bfmFinanceSites.every((s) => s.producer === 'finance')).toBe(true);
  });

  it('would report an unpinned seam reached only through the gateway wrapper', () => {
    const { sites } = discoverCallSites(repoRoot);
    const planted = {
      consumer: 'bfm',
      producer: 'cerebrum',
      argument: "'cerebrum'",
      file: 'pillars/bfm/src/api/finance/client.ts',
      line: 9999,
    };
    const report = findCoverageGaps([...sites, planted], EXPECTATIONS, UNPINNABLE_CALL_SITES);
    expect(report.unlisted).toContainEqual(planted);
  });
});
