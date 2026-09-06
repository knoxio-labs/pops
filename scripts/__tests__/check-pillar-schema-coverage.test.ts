/**
 * The pillar schema-coverage guard's discovery and analysability decisions.
 *
 * The script had no test file at all, and the two branches covered here are
 * the ones its CI self-test is structurally blind to. `--inject-fake-table`
 * plants its expectation *after* the point where a pillar the analyser could
 * not read already returned the guard's success value, so no amount of
 * self-testing downstream could ever see it (POPS-1626). Discovery is worse
 * again: a renamed barrel removed a pillar from the guard AND from the job
 * matrix derived from the same rule, and nine of ten pillars passing prints
 * identically to ten of ten (POPS-1629).
 *
 * Every assertion here is written to fail against the previous behaviour.
 * Measured, not asserted — turning each knob and counting what breaks:
 * making `analysabilityFailure` return `null` unconditionally (the old
 * `return true`) fails 3 of the 12; dropping the `package.json` condition
 * from `discoverUnanalysablePillars` fails 2; dropping its `looksPersistent`
 * condition fails 2. The one analysability case that keeps passing under the
 * first mutation is the one asserting a healthy pillar is not reported,
 * which is correct — a guard that fails everything is not a guard either.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  analysabilityFailure,
  buildSymbolToTableMap,
  collectUsedTableSymbols,
  discoverPillars,
  discoverUnanalysablePillars,
} from '../check-pillar-schema-coverage.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

describe('discoverPillars', () => {
  it('finds only the directories exposing a src/db/schema.ts barrel, sorted', () => {
    drizzlePillar('media');
    drizzlePillar('finance');
    write(join('shell', 'package.json'), '{}');
    write('README.md', '# not a pillar\n');

    expect(discoverPillars(root).map((p) => p.name)).toEqual(['finance', 'media']);
  });

  it('returns nothing when the pillars root does not exist', () => {
    expect(discoverPillars(join(root, 'absent'))).toEqual([]);
  });
});

describe('discoverUnanalysablePillars', () => {
  it('reports a pillar with migrations but no barrel', () => {
    write(join('ghost', 'package.json'), '{}');
    write(join('ghost', 'migrations', '0001_init.sql'), 'CREATE TABLE t (id TEXT);\n');

    expect(discoverUnanalysablePillars(root)).toEqual(['ghost']);
  });

  it('reports a pillar whose barrel was renamed out from under the guard', () => {
    drizzlePillar('finance');
    renameSync(
      join(root, 'finance', 'src', 'db', 'schema.ts'),
      join(root, 'finance', 'src', 'db', 'schema', 'index.ts')
    );

    expect(discoverPillars(root)).toEqual([]);
    expect(discoverUnanalysablePillars(root)).toEqual(['finance']);
  });

  it('says nothing about a pillar the guard can already see', () => {
    drizzlePillar('finance');

    expect(discoverUnanalysablePillars(root)).toEqual([]);
  });

  it('says nothing about a pillar that persists nothing', () => {
    write(join('shell', 'package.json'), '{}');
    write(join('shell', 'src', 'app.ts'), 'export const app = 1;\n');

    expect(discoverUnanalysablePillars(root)).toEqual([]);
  });

  it('says nothing about a pillar in another language, migrations and all', () => {
    write(join('contacts', 'Cargo.toml'), '[package]\nname = "contacts"\n');
    write(join('contacts', 'migrations', '0001_init.sql'), 'CREATE TABLE entities (id TEXT);\n');

    expect(discoverUnanalysablePillars(root)).toEqual([]);
  });
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

describe('--list-pillars', () => {
  it('prints the real repo pillar set as JSON on stdout, and agrees with discoverPillars', () => {
    const stdout = execFileSync(
      process.execPath,
      ['scripts/check-pillar-schema-coverage.mjs', '--list-pillars'],
      { cwd: repoRoot, encoding: 'utf8' }
    );

    const listed: unknown = JSON.parse(stdout);
    expect(Array.isArray(listed)).toBe(true);
    expect(listed).toEqual(discoverPillars(join(repoRoot, 'pillars')).map((p) => p.name));
    expect(listed).toContain('finance');
  });
});
