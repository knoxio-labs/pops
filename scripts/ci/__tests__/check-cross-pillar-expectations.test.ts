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
  firstTypeArgName,
  KNOWN_BROKEN_OPERATIONS,
  loadProducerDoc,
  PILLAR_CALL_WRAPPERS,
  resolveProducerId,
  resolveRouterOperations,
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
    expect(findPillarCalls(scanned)).toEqual([{ argument: "'lists'", typeArg: 'R', line: 2 }]);
  });

  it('does not lose its place on a contraction in JSX text', () => {
    // POPS-2850: `points aren't counted` in pillars/design/src/screens/
    // finance/accounts.tsx read the apostrophe as a string opener, found no
    // close, and failed the whole gate for that file. Worked around at the
    // time by rewording the prose.
    const scanned = scanSource(
      "const A = () => <p>points aren't counted</p>;\nconst h = pillar<R>('lists');"
    );
    expect(scanned.unterminated).toBeNull();
    expect(findPillarCalls(scanned)).toEqual([{ argument: "'lists'", typeArg: 'R', line: 2 }]);
  });

  it.each([
    ["the user's balance", 'a possessive'],
    ["it's not counted", 'a contraction of "is"'],
    ['the "best" option', 'double quotes around a word'],
  ])('treats %j in JSX text as prose (%s)', (text) => {
    expect(scanSource(`const A = () => <p>${text}</p>;`).unterminated).toBeNull();
  });

  it.each([
    "someone else's account",
    "the import's mapping step",
    "an opt-in's default",
    "the new's feed",
  ])('treats %j as prose even though it ends in a keyword', (text) => {
    // The first version of this fix kept a keyword allowlist so `return'x'`
    // would still open a literal. English possessives end in those same
    // words, so every one of these reopened POPS-2850 for a different word.
    expect(scanSource(`const A = () => <p>${text}</p>;`).unterminated).toBeNull();
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
      { argument: "'finance'", typeArg: 'FinanceRouter', line: 1 },
    ]);
  });

  it('finds the bare form, which carries the same seam', () => {
    expect(findPillarCalls(scanSource('const h: PillarHandle<X> = pillar(ID);'))).toEqual([
      { argument: 'ID', typeArg: null, line: 1 },
    ]);
  });

  it('does not swallow the call when the type argument holds an arrow', () => {
    expect(findPillarCalls(scanSource("pillar<() => void>('lists')"))).toEqual([
      { argument: "'lists'", typeArg: '() => void', line: 1 },
    ]);
  });

  it('handles a nested type argument', () => {
    expect(findPillarCalls(scanSource("pillar<Record<string, unknown>>('lists')"))).toEqual([
      { argument: "'lists'", typeArg: 'Record<string, unknown>', line: 1 },
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
      [{ argument: "'lists'", typeArg: 'R', line: 1 }]
    );
  });
});

describe('findWrapperCalls', () => {
  const wrapper = { typeName: 'PillarGateway', method: 'call', definedIn: 'gateway.ts' };

  it('finds a call through an identifier bound by a parameter type annotation', () => {
    const scanned = scanSource(
      "function f(gateway: PillarGateway) { return gateway.call<R, unknown>('finance', cb); }"
    );
    expect(findWrapperCalls(scanned, [wrapper])).toEqual([
      { argument: "'finance'", typeArg: 'R, unknown', line: 1 },
    ]);
  });

  it('reads whatever the bound identifier is named, not a fixed name', () => {
    const scanned = scanSource(
      "function f(cerebrumGateway: PillarGateway) { return cerebrumGateway.call('cerebrum', cb); }"
    );
    expect(findWrapperCalls(scanned, [wrapper])).toEqual([
      { argument: "'cerebrum'", typeArg: null, line: 1 },
    ]);
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
      { argument: 'url', typeArg: null, line: 1 },
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

describe('firstTypeArgName', () => {
  it('reads a single bare identifier', () => {
    expect(firstTypeArgName('ContactsRouter')).toBe('ContactsRouter');
  });

  it("reads a wrapper's router type, not its second (return) type argument", () => {
    expect(firstTypeArgName('FinanceTransactionsRouter, unknown')).toBe(
      'FinanceTransactionsRouter'
    );
  });

  it('refuses a type argument that is not a bare identifier', () => {
    expect(firstTypeArgName('() => void')).toBeNull();
    expect(firstTypeArgName('Record<string, unknown>')).toBeNull();
  });

  it('refuses no type argument at all', () => {
    expect(firstTypeArgName(null)).toBeNull();
  });
});

describe('resolveRouterOperations', () => {
  it('resolves every method under every domain of a multi-domain router', () => {
    const source =
      'export type ListsRouter = { ' +
      'list: { get: (i: unknown) => unknown; create: (i: unknown) => unknown; }; ' +
      'items: { add: (i: unknown) => unknown; search: (i: unknown) => unknown; }; ' +
      '};';
    expect(resolveRouterOperations(source, 'ListsRouter')?.toSorted()).toEqual([
      'items.add',
      'items.search',
      'list.create',
      'list.get',
    ]);
  });

  it('resolves a method whose value is a named type alias, not an inline arrow', () => {
    const source = 'type CerebrumNudgesHandle = { nudges: { create: NudgeSink }; };';
    expect(resolveRouterOperations(source, 'CerebrumNudgesHandle')).toEqual(['nudges.create']);
  });

  it('accepts an interface declaration, not only a type alias', () => {
    const source = 'interface ContactsRouter { entities: { get: (i: unknown) => unknown }; }';
    expect(resolveRouterOperations(source, 'ContactsRouter')).toEqual(['entities.get']);
  });

  it('is unbothered by nested object types inside a method signature', () => {
    const source =
      'type R = { items: { get: (i: { id: string }) => Promise<{ data: { id: string } }> }; };';
    expect(resolveRouterOperations(source, 'R')).toEqual(['items.get']);
  });

  it('does not mistake a comma inside a multi-arg generic return type for a member separator', () => {
    const source = 'type R = { items: { get: (i: unknown) => Promise<Result<A, B>>; }; };';
    expect(resolveRouterOperations(source, 'R')).toEqual(['items.get']);
  });

  it('resolves every method when several use multi-arg generic return types', () => {
    const source =
      'type R = { ' +
      'items: { get: (i: unknown) => Promise<Result<A, B>>; }; ' +
      'entities: { list: (i: unknown) => Promise<Map<string, number>>; }; ' +
      '};';
    expect(resolveRouterOperations(source, 'R')?.toSorted()).toEqual([
      'entities.list',
      'items.get',
    ]);
  });

  it('does not mistake the arrow token’s `>` for a generic closer', () => {
    // A curried arrow return type — `(y) => Promise<Record<string, unknown>>` — has
    // TWO `<` opens (Promise, Record) and the arrow's own `>` sitting between
    // them; only the arrow-guard keeps that `>` from being read as a closer.
    const source =
      'type R = { items: { get: (i: unknown) => (y: unknown) => Promise<Record<string, unknown>>; }; };';
    expect(resolveRouterOperations(source, 'R')).toEqual(['items.get']);
  });

  it('resolves to an empty list for a declared-but-empty router type, not an error', () => {
    expect(resolveRouterOperations('type Empty = {};', 'Empty')).toEqual([]);
  });

  it('resolves to null when the type is not declared in this source at all', () => {
    expect(resolveRouterOperations('const x = 1;', 'GhostRouter')).toBeNull();
  });

  it('resolves to null when the type is declared but is not an object literal', () => {
    expect(resolveRouterOperations('type Alias = string;', 'Alias')).toBeNull();
  });

  it('resolves to null when no type name is given', () => {
    expect(resolveRouterOperations('type R = { a: { b: () => void } };', null)).toBeNull();
  });

  it('does not resolve a type mentioned only in a comment or a string', () => {
    const scanned = scanSource(
      '// type GhostRouter = { a: { b: () => void } };\nconst note = "type GhostRouter";'
    );
    expect(resolveRouterOperations(scanned.scannable, 'GhostRouter')).toBeNull();
  });

  it(
    'resolves to null on method-shorthand syntax rather than a garbage operation manufactured ' +
      'from the parameter name',
    () => {
      const source = 'type X = { entities: { get(): Y; set(v: Z): void; }; };';
      expect(resolveRouterOperations(source, 'X')).toBeNull();
    }
  );

  it('resolves to null for multiple consecutive method-shorthand members, not a partial list', () => {
    const source = 'type X = { a: { m1(): A; m2(): B; m3(): C; }; };';
    expect(resolveRouterOperations(source, 'X')).toBeNull();
  });

  it('terminates rather than looping on a body that never satisfies the key: value shape', () => {
    // Regression: the member scanner used to `continue` without fully skipping
    // an unmodelled member, which a reviewer flagged as a potential infinite
    // loop. It provably terminates (this test itself would hang and fail on
    // Vitest's default timeout if it did not), but must ALSO resolve to null
    // rather than a partial parse — both properties matter, not just the one
    // that was flagged.
    const pathological = `type X = { ${'get(): Y; '.repeat(500)} };`;
    expect(resolveRouterOperations(pathological, 'X')).toBeNull();
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
    write('pillars/gamma/scripts/migrate.ts', "pillar<R>('alpha');");
    write('pillars/gamma/scripts/__tests__/migrate.test.ts', "pillar<R>('ghost');");
    write(
      'pillars/alpha/src/api/resolvable.ts',
      [
        "export const DELTA_PILLAR_ID = 'delta';",
        'type DeltaRouter = { widgets: { get: (i: unknown) => unknown; list: (i: unknown) => unknown; }; };',
        'const h = pillar<DeltaRouter>(DELTA_PILLAR_ID);',
      ].join('\n')
    );
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('finds a call in a pillar src file', () => {
    expect(discoverCallSites(root).sites).toContainEqual({
      consumer: 'alpha',
      producer: 'beta',
      argument: "'beta'",
      routerType: 'R',
      operationIds: null,
      file: 'pillars/alpha/src/api/client.ts',
      line: 1,
    });
  });

  it("resolves a call site's router type into its declared operations", () => {
    expect(discoverCallSites(root).sites).toContainEqual({
      consumer: 'alpha',
      producer: 'delta',
      argument: 'DELTA_PILLAR_ID',
      routerType: 'DeltaRouter',
      operationIds: ['widgets.get', 'widgets.list'],
      file: 'pillars/alpha/src/api/resolvable.ts',
      line: 3,
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
      routerType: 'R',
      operationIds: null,
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
      routerType: 'R',
      operationIds: null,
      file: 'pillars/beta/src/api/wrapper.ts',
      line: 3,
    });
  });

  it('finds a call under pillars/*/scripts, not just under src', () => {
    expect(discoverCallSites(root).sites).toContainEqual({
      consumer: 'gamma',
      producer: 'alpha',
      argument: "'alpha'",
      routerType: 'R',
      operationIds: null,
      file: 'pillars/gamma/scripts/migrate.ts',
      line: 1,
    });
  });

  it('ignores a __tests__ directory under scripts the same way it does under src', () => {
    expect(discoverCallSites(root).sites.map((s) => s.file)).not.toContain(
      'pillars/gamma/scripts/__tests__/migrate.test.ts'
    );
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
    routerType: 'ContactsRouter' as string | null,
    operationIds: ['entities.list'] as string[] | null,
    file: 'pillars/purchases/src/api/contacts/merchant.ts',
    line: 143,
    ...over,
  });
  const row = { consumer: 'purchases', producer: 'contacts', operationId: 'entities.list' };

  it('passes a call site whose one resolved operation has a matching row', () => {
    expect(findCoverageGaps([site()], [row], []).unlisted).toEqual([]);
  });

  it('fails a call site whose seam has no row at all', () => {
    const report = findCoverageGaps([site({ producer: 'lists' })], [row], []);
    expect(report.unlisted.map((s) => s.producer)).toEqual(['lists']);
    expect(report.unlisted[0]).toMatchObject({ operationId: 'entities.list' });
  });

  it('fails a call site whose consumer differs from every row, same producer', () => {
    expect(findCoverageGaps([site({ consumer: 'media' })], [row], []).unlisted).toHaveLength(1);
  });

  it(
    'fails ONLY the unpinned operation when a call site resolves to two operations and only ' +
      'one has a row — a second operation on an already-pinned seam must not ride on the ' +
      'first operation’s row',
    () => {
      const report = findCoverageGaps(
        [site({ operationIds: ['entities.list', 'entities.create'] })],
        [row],
        []
      );
      expect(report.unlisted).toHaveLength(1);
      expect(report.unlisted[0]).toMatchObject({
        consumer: 'purchases',
        producer: 'contacts',
        operationId: 'entities.create',
      });
    }
  );

  it('passes both operations a call site resolves to when both have their own row', () => {
    const rows = [
      row,
      { consumer: 'purchases', producer: 'contacts', operationId: 'entities.create' },
    ];
    const report = findCoverageGaps(
      [site({ operationIds: ['entities.list', 'entities.create'] })],
      rows,
      []
    );
    expect(report.unlisted).toEqual([]);
  });

  it('fails an unresolved target that nothing exempts', () => {
    const report = findCoverageGaps(
      [site({ producer: null, argument: 'pillarId', operationIds: null })],
      [row],
      []
    );
    expect(report.unresolved).toHaveLength(1);
  });

  it('accepts an unresolved target in an exempted file', () => {
    const exempt = [{ file: 'pillars/mcp/src/pillar-client.ts', reason: 'runtime dispatch' }];
    const report = findCoverageGaps(
      [
        site({
          producer: null,
          argument: 'pillarId',
          operationIds: null,
          file: 'pillars/mcp/src/pillar-client.ts',
        }),
      ],
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
        site({
          producer: null,
          argument: 'id',
          operationIds: null,
          file: 'pillars/mcp/src/pillar-client.ts',
        }),
        site({ producer: 'lists', file: 'pillars/purchases/src/other.ts' }),
      ],
      [row],
      exempt
    );
    expect(report.unlisted).toHaveLength(1);
  });

  it('reports, rather than passes, a call site whose router type could not be resolved', () => {
    const report = findCoverageGaps([site({ operationIds: null })], [row], []);
    expect(report.unresolvedOperations).toHaveLength(1);
    expect(report.unlisted).toEqual([]);
  });

  it('reports a router type that resolved to zero operations the same way', () => {
    const report = findCoverageGaps([site({ operationIds: [] })], [row], []);
    expect(report.unresolvedOperations).toHaveLength(1);
  });

  it('lets a KNOWN_BROKEN_OPERATIONS entry satisfy coverage without a row', () => {
    const broken = {
      consumer: 'finance',
      producer: 'registry',
      operationId: 'entities.list',
      reason: 'test fixture',
    };
    const brokenSite = site({
      consumer: 'finance',
      producer: 'registry',
      routerType: 'CoreRouter',
      operationIds: ['entities.list'],
    });
    const report = findCoverageGaps([brokenSite], [], [], [broken]);
    expect(report.unlisted).toEqual([]);
    expect(report.staleKnownBrokenOperations).toEqual([]);
  });

  it('fails a KNOWN_BROKEN_OPERATIONS entry no discovered call site resolves to anymore', () => {
    const broken = {
      consumer: 'finance',
      producer: 'registry',
      operationId: 'entities.list',
      reason: 'test fixture',
    };
    const report = findCoverageGaps([site()], [row], [], [broken]);
    expect(report.staleKnownBrokenOperations).toEqual(['finance -> registry :: entities.list']);
  });

  it('does not let a KNOWN_BROKEN_OPERATIONS entry excuse a DIFFERENT operation on the same seam', () => {
    const broken = {
      consumer: 'purchases',
      producer: 'contacts',
      operationId: 'entities.get',
      reason: 'test fixture',
    };
    const report = findCoverageGaps(
      [site({ operationIds: ['entities.list', 'entities.create'] })],
      [row],
      [],
      [broken]
    );
    expect(report.unlisted.map((s) => s.operationId)).toEqual(['entities.create']);
    expect(report.staleKnownBrokenOperations).toEqual(['purchases -> contacts :: entities.get']);
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
  // One scan, shared. Every assertion below used to call `discoverCallSites`
  // itself, so the whole repository was walked thirteen times over to produce
  // thirteen identical results — the bulk of this file's runtime, and enough
  // wall clock per `it` that what the assertions were really measured against
  // was how busy the machine happened to be.
  let liveTree: ReturnType<typeof discoverCallSites>;

  beforeAll(() => {
    liveTree = discoverCallSites(repoRoot);
  });

  it('EXPECTATIONS is not empty', () => {
    expect(EXPECTATIONS.length).toBeGreaterThan(0);
  });

  it('every expectation holds against the producer OpenAPI on disk', () => {
    expect(checkExpectations(repoRoot, EXPECTATIONS)).toEqual([]);
  });

  it('scans every pillar source without losing its place', () => {
    expect(liveTree.scanErrors).toEqual([]);
  });

  it('finds the purchases -> contacts call site the curated list used to miss', () => {
    const sites = liveTree.sites;
    expect(sites).toContainEqual(
      expect.objectContaining({
        consumer: 'purchases',
        producer: 'contacts',
        file: 'pillars/purchases/src/api/contacts/merchant.ts',
      })
    );
  });

  it('every discovered operation is either pinned by a row, exempted, or known-broken', () => {
    const { sites } = liveTree;
    expect(sites.length).toBeGreaterThan(0);
    expect(
      findCoverageGaps(sites, EXPECTATIONS, UNPINNABLE_CALL_SITES, KNOWN_BROKEN_OPERATIONS)
    ).toEqual({
      unlisted: [],
      unresolved: [],
      unresolvedOperations: [],
      staleExemptions: [],
      staleKnownBrokenOperations: [],
      exempted: expect.any(Number),
    });
  });

  it('every call site with a known producer resolves its router type to at least one operation', () => {
    const { sites } = liveTree;
    const unresolvable = sites.filter((s) => s.producer !== null && s.operationIds === null);
    expect(unresolvable).toEqual([]);
  });

  it('would report the seam if a row were removed', () => {
    const { sites } = liveTree;
    const without = EXPECTATIONS.filter(
      (e: { consumer: string; producer: string }) =>
        !(e.consumer === 'purchases' && e.producer === 'contacts')
    );
    const report = findCoverageGaps(sites, without, UNPINNABLE_CALL_SITES, KNOWN_BROKEN_OPERATIONS);
    expect(report.unlisted.map((s) => s.file)).toContain(
      'pillars/purchases/src/api/contacts/merchant.ts'
    );
  });

  it(
    'catches a second, unpinned operation on an already-pinned seam, proven against the real ' +
      'tree rather than a synthetic fixture',
    () => {
      // finance -> registry is pinned by pillars/finance/src/api/cron/pillar-lookup.ts's
      // `users.get` row. migrate-core-entities.ts resolves a DIFFERENT operation
      // (`entities.list`) on that same seam. Its only cover is the documented
      // KNOWN_BROKEN_OPERATIONS entry; drop that and the operation must surface as
      // unlisted rather than ride on the unrelated users.get row.
      const { sites } = liveTree;
      const report = findCoverageGaps(sites, EXPECTATIONS, UNPINNABLE_CALL_SITES, []);
      expect(report.unlisted).toContainEqual(
        expect.objectContaining({
          consumer: 'finance',
          producer: 'registry',
          operationId: 'entities.list',
        })
      );
    }
  );

  it('KNOWN_BROKEN_OPERATIONS is not empty and every entry carries a reason', () => {
    expect(KNOWN_BROKEN_OPERATIONS.length).toBeGreaterThan(0);
    for (const op of KNOWN_BROKEN_OPERATIONS) {
      expect(op.reason.length).toBeGreaterThan(20);
    }
  });

  it('every exemption carries a reason', () => {
    for (const exemption of UNPINNABLE_CALL_SITES) {
      expect(exemption.reason.length).toBeGreaterThan(20);
    }
  });

  it('pins the two seams that used to hand-roll their HTTP', () => {
    const { sites } = liveTree;
    const seams = sites.map((s) => `${s.consumer} -> ${String(s.producer)}`);
    expect(seams).toContain('food -> lists');
    expect(seams).toContain('cerebrum -> finance');
    expect(seams).toContain('cerebrum -> media');
    expect(seams).toContain('cerebrum -> inventory');
  });

  it('finds direct-fetch calls in the live tree, and every one is sanctioned', () => {
    const { directFetchSites } = liveTree;
    expect(directFetchSites.length).toBeGreaterThan(0);
    expect(findDirectFetchGaps(directFetchSites, SANCTIONED_DIRECT_FETCH)).toEqual({
      unsanctioned: [],
      staleSanctions: [],
      sanctioned: expect.any(Number),
    });
  });

  it('would report a direct-fetch seam if its sanction were removed', () => {
    const { directFetchSites } = liveTree;
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

  // Counted across bfm's whole finance leg rather than per file: pinning one
  // path made this fail the day that leg was split in two, which says nothing
  // about whether discovery still follows the wrapper.
  it("discovers bfm's finance calls through PillarGateway.call, not a literal pillar() token", () => {
    const { sites } = liveTree;
    const bfmFinanceSites = sites.filter((s) => s.consumer === 'bfm' && s.producer === 'finance');
    expect(bfmFinanceSites).toHaveLength(6);
    expect(new Set(bfmFinanceSites.map((s) => s.file)).size).toBe(2);
  });

  it('would report an unpinned seam reached only through the gateway wrapper', () => {
    const { sites } = liveTree;
    const planted = {
      consumer: 'bfm',
      producer: 'cerebrum',
      argument: "'cerebrum'",
      routerType: 'NudgesRouter',
      operationIds: ['nudges.create'],
      file: 'pillars/bfm/src/api/finance/client.ts',
      line: 9999,
    };
    const report = findCoverageGaps(
      [...sites, planted],
      EXPECTATIONS,
      UNPINNABLE_CALL_SITES,
      KNOWN_BROKEN_OPERATIONS
    );
    expect(report.unlisted).toContainEqual(
      expect.objectContaining({
        consumer: 'bfm',
        producer: 'cerebrum',
        operationId: 'nudges.create',
      })
    );
  });

  it('finds both call sites in the finance core-entities migration script', () => {
    const { sites } = liveTree;
    const migrationSites = sites.filter(
      (s) => s.file === 'pillars/finance/scripts/migrate-core-entities.ts'
    );
    expect(migrationSites).toContainEqual(
      expect.objectContaining({
        consumer: 'finance',
        producer: 'registry',
        operationIds: ['entities.list'],
      })
    );
    expect(migrationSites).toContainEqual(
      expect.objectContaining({
        consumer: 'finance',
        producer: 'contacts',
        operationIds: ['entities.create'],
      })
    );
  });

  it('would report an unpinned seam reached only through a pillars/*/scripts call site', () => {
    const { sites } = liveTree;
    const planted = {
      consumer: 'finance',
      producer: 'lists',
      argument: "'lists'",
      routerType: 'ListsRouter',
      operationIds: ['list.get'],
      file: 'pillars/finance/scripts/migrate-core-entities.ts',
      line: 9999,
    };
    const report = findCoverageGaps(
      [...sites, planted],
      EXPECTATIONS,
      UNPINNABLE_CALL_SITES,
      KNOWN_BROKEN_OPERATIONS
    );
    expect(report.unlisted).toContainEqual(
      expect.objectContaining({ consumer: 'finance', producer: 'lists', operationId: 'list.get' })
    );
  });
});
