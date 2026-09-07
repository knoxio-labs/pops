/**
 * The pillar schema-coverage guard's analysability decision and the import
 * forms it has to read to make it.
 *
 * `--inject-fake-table`, the guard's own CI self-test, plants its expectation
 * *after* the point where a pillar the analyser could not read already returned
 * the guard's success value, so no amount of self-testing downstream could see
 * that branch (POPS-1626). The import forms are the other half of the same
 * blindness: a form the parser did not model produced an empty reference set,
 * and an empty reference set used to score as full coverage. The parser was a
 * regex over three alternation branches until POPS-1628; `import db, { users }`
 * and `export { users } from` matched none of them.
 *
 * Measured, not asserted — turning each knob and counting what breaks: making
 * `analysabilityFailure` return `null` unconditionally (the old `return true`)
 * fails 3. The one analysability case that keeps passing under that mutation is
 * the one asserting a healthy pillar is not reported, which is correct — a
 * guard that fails everything is not a guard either.
 *
 * Discovery moved to `list-pillars.test.ts` with the code it covers.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  analysabilityFailure,
  buildSymbolToTableMap,
  collectUsedTableSymbols,
  parseImports,
} from '../check-pillar-schema-coverage.mjs';

let root: string;

function write(relative: string, contents: string): void {
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

/** A pillar shaped the way this guard expects: barrel, schema module, service. */
function drizzlePillar(name: string): void {
  write(join(name, 'package.json'), JSON.stringify({ name: `@pops/${name}` }));
  write(join(name, 'src', 'db', 'schema.ts'), "export { widgets } from './schema/widgets.js';\n");
  write(
    join(name, 'src', 'db', 'schema', 'widgets.ts'),
    [
      "import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';",
      '',
      "export const widgets = sqliteTable('widgets', {",
      "  id: text('id').primaryKey(),",
      "  kind: text('kind').default('plain'),",
      "}, (table) => [index('idx_widgets_kind').on(table.kind)]);",
      '',
    ].join('\n')
  );
  write(
    join(name, 'src', 'db', 'services', 'widgets.ts'),
    [
      "import { widgets } from '../schema/widgets.js';",
      '',
      'export const table = widgets;',
      '',
    ].join('\n')
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pillar-schema-coverage-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('analysabilityFailure', () => {
  it('passes a pillar with both symbols and references', () => {
    expect(analysabilityFailure({ pillar: 'finance', symbolCount: 12, usedCount: 9 })).toBeNull();
  });

  it('fails, and blames the schema directory, when no table symbol was found', () => {
    const message = analysabilityFailure({ pillar: 'finance', symbolCount: 0, usedCount: 0 });

    expect(message).toContain('could not analyse');
    expect(message).toContain('src/db/schema/');
    expect(message).not.toContain('src/db/services/');
  });

  it('fails, and blames the reference side, when symbols exist but nothing uses them', () => {
    const message = analysabilityFailure({ pillar: 'finance', symbolCount: 12, usedCount: 0 });

    expect(message).toContain('could not analyse');
    expect(message).toContain('src/db/services/');
    expect(message).toContain('12 table symbol(s)');
  });
});

describe('the chain a renamed services directory breaks', () => {
  it('scores a readable pillar as analysable, and the same pillar as broken once services move', () => {
    drizzlePillar('finance');
    const pillar = { name: 'finance', pkgDir: 'finance' };
    const pkgRoot = join(root, 'finance');

    const symbolToTable = buildSymbolToTableMap(pillar, root);
    expect([...symbolToTable.keys()]).toEqual(['widgets']);

    const used = collectUsedTableSymbols(pkgRoot, symbolToTable);
    expect([...used]).toEqual(['widgets']);
    expect(
      analysabilityFailure({
        pillar: pillar.name,
        symbolCount: symbolToTable.size,
        usedCount: used.size,
      })
    ).toBeNull();

    // The barrel goes with it: a rename this thorough is the case the old
    // early return scored as full coverage, and leaving the barrel behind
    // would let its re-exports carry the reference set on their own.
    renameSync(join(pkgRoot, 'src', 'db', 'services'), join(pkgRoot, 'src', 'db', 'queries'));
    rmSync(join(pkgRoot, 'src', 'db', 'schema.ts'));

    const afterRename = collectUsedTableSymbols(pkgRoot, symbolToTable);
    expect(afterRename.size).toBe(0);
    expect(
      analysabilityFailure({
        pillar: pillar.name,
        symbolCount: symbolToTable.size,
        usedCount: afterRename.size,
      })
    ).toContain('could not analyse');
  });
});

describe('parseImports', () => {
  const namesFrom = (src: string): string[] =>
    parseImports(src)
      .flatMap((ref) => ref.symbols)
      .toSorted();

  it('reads a plain named import', () => {
    expect(namesFrom("import { widgets } from './schema.js';")).toEqual(['widgets']);
  });

  it('reads a renamed specifier by the name the source module exports', () => {
    expect(namesFrom("import { widgets as w } from './schema.js';")).toEqual(['widgets']);
  });

  it('reads the named half of a default-and-named import', () => {
    // The form the old regex dropped whole: none of its three alternation
    // branches matched `db, { widgets }`, so the statement vanished and every
    // table it brought in went uncounted.
    expect(namesFrom("import db, { widgets, gadgets } from './schema.js';")).toEqual([
      'db',
      'gadgets',
      'widgets',
    ]);
  });

  it('reads a re-export with a module specifier', () => {
    expect(namesFrom("export { widgets } from '../schema.js';")).toEqual(['widgets']);
  });

  it('reads a renamed re-export by the name the source module exports', () => {
    expect(namesFrom("export { widgets as public_widgets } from '../schema.js';")).toEqual([
      'widgets',
    ]);
  });

  it('marks a namespace import as covering the whole module', () => {
    expect(parseImports("import * as schema from './schema.js';")).toEqual([
      { kind: 'import', from: './schema.js', symbols: [], isNamespace: true },
    ]);
  });

  it('marks a star re-export as covering the whole module', () => {
    expect(parseImports("export * from './schema.js';")).toEqual([
      { kind: 'export', from: './schema.js', symbols: [], isNamespace: true },
    ]);
  });

  it('marks a renamed namespace re-export as covering the whole module', () => {
    expect(parseImports("export * as schema from './schema.js';")).toEqual([
      { kind: 'export', from: './schema.js', symbols: [], isNamespace: true },
    ]);
  });

  it('distinguishes an import from a re-export', () => {
    expect(
      parseImports(["import { a } from './x.js';", "export { b } from './y.js';"].join('\n')).map(
        (ref) => ref.kind
      )
    ).toEqual(['import', 'export']);
  });

  it('skips a type-only import', () => {
    expect(parseImports("import type { widgets } from './schema.js';")).toEqual([]);
  });

  it('skips a type-only specifier inside a value import', () => {
    expect(namesFrom("import { type widgets, gadgets } from './schema.js';")).toEqual(['gadgets']);
  });

  it('skips a type-only re-export', () => {
    expect(parseImports("export type { Widget } from './schema.js';")).toEqual([]);
  });

  it('binds nothing for a side-effect import', () => {
    expect(parseImports("import './register.js';")).toEqual([]);
  });

  it('ignores an export that re-exports a local binding, with no source module', () => {
    expect(parseImports('const widgets = 1;\nexport { widgets };')).toEqual([]);
  });

  it('reads a multi-line import the way it reads a single-line one', () => {
    expect(
      namesFrom(['import {', '  widgets,', '  gadgets,', "} from './schema.js';"].join('\n'))
    ).toEqual(['gadgets', 'widgets']);
  });

  it('does not read a specifier out of a string or a comment', () => {
    expect(
      parseImports(
        [
          "// import { ghost } from './schema.js';",
          'const sql = "import { phantom } from \'./schema.js\'";',
        ].join('\n')
      )
    ).toEqual([]);
  });
});

describe('the reference set a service contributes', () => {
  /**
   * Replace the fixture pillar's one service with `body` and re-read the
   * references, with `src/db/schema.ts` deleted. The barrel's own re-exports
   * seed the reference set unconditionally, so a case that keeps it passes
   * whether or not the service's import was read at all.
   */
  function usedWithService(body: string): string[] {
    drizzlePillar('finance');
    write(join('finance', 'src', 'db', 'services', 'widgets.ts'), body);
    rmSync(join(root, 'finance', 'src', 'db', 'schema.ts'));
    const symbolToTable = buildSymbolToTableMap({ name: 'finance', pkgDir: 'finance' }, root);
    return [...collectUsedTableSymbols(join(root, 'finance'), symbolToTable)].toSorted();
  }

  it('credits a table a service imports plainly', () => {
    expect(usedWithService("import { widgets } from '../schema/widgets.js';\n")).toEqual([
      'widgets',
    ]);
  });

  it('credits the named half of a default-and-named import', () => {
    expect(usedWithService("import db, { widgets } from '../schema/widgets.js';\n")).toEqual([
      'widgets',
    ]);
  });

  it('credits a table a service re-exports', () => {
    expect(usedWithService("export { widgets } from '../schema/widgets.js';\n")).toEqual([
      'widgets',
    ]);
  });

  it('counts a table reached twice once', () => {
    expect(
      usedWithService(
        [
          "import { widgets } from '../schema/widgets.js';",
          "export { widgets as alias } from '../schema/widgets.js';",
          '',
        ].join('\n')
      )
    ).toEqual(['widgets']);
  });

  it('credits nothing for a type-only import', () => {
    expect(usedWithService("import type { widgets } from '../schema/widgets.js';\n")).toEqual([]);
  });

  it('credits nothing for an import of a non-table symbol', () => {
    expect(usedWithService("import { helper } from '../schema/widgets.js';\n")).toEqual([]);
  });

  it('credits nothing for a table imported from outside the pillar schema', () => {
    expect(usedWithService("import { widgets } from '@pops/elsewhere';\n")).toEqual([]);
  });
});

describe('index names inside a sqliteTable block', () => {
  function indexesOf(tableModule: string): string[] {
    drizzlePillar('finance');
    write(join('finance', 'src', 'db', 'schema', 'widgets.ts'), tableModule);
    const map = buildSymbolToTableMap({ name: 'finance', pkgDir: 'finance' }, root);
    return map.get('widgets')?.indexNames ?? [];
  }

  const table = (indexExpr: string): string =>
    [
      "import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';",
      '',
      "export const widgets = sqliteTable('widgets', {",
      "  id: text('id').primaryKey(),",
      "  kind: text('kind'),",
      `}, (t) => [${indexExpr}]);`,
      '',
    ].join('\n');

  it('collects a single-quoted name', () => {
    expect(indexesOf(table("index('idx_kind').on(t.kind)"))).toEqual(['idx_kind']);
  });

  it('collects a uniqueIndex alongside an index', () => {
    expect(indexesOf(table("index('idx_kind').on(t.kind), uniqueIndex('uq_id').on(t.id)"))).toEqual(
      ['idx_kind', 'uq_id']
    );
  });

  it('collects a template literal with no substitutions, which the regex could not see', () => {
    expect(indexesOf(table('index(`idx_kind`).on(t.kind)'))).toEqual(['idx_kind']);
  });

  it('refuses a name it cannot read rather than dropping the index', () => {
    // Silently collecting nothing is the failure this replaced: an index the
    // guard never collects is one whose absence it can never report.
    expect(() => indexesOf(table('index(`idx_${prefix}_kind`).on(t.kind)'))).toThrow(
      /cannot read/u
    );
  });

  it('names the offending expression when it refuses', () => {
    expect(() => indexesOf(table('index(INDEX_NAME).on(t.kind)'))).toThrow(/INDEX_NAME/u);
  });
});
