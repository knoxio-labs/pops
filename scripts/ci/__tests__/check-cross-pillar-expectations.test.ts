import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  checkExpectation,
  checkExpectations,
  declaredParams,
  discoverCallSites,
  EXPECTATIONS,
  findCoverageGaps,
  findPillarCalls,
  loadProducerDoc,
  resolveProducerId,
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

  it('refuses a function parameter', () => {
    expect(resolveProducerId('pillarId', 'export function f(pillarId: string) {}')).toBeNull();
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
      const { sites, scanErrors } = discoverCallSites(empty);
      expect(sites).toHaveLength(0);
      expect(scanErrors[0]).toContain('no pillars directory');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
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
});
