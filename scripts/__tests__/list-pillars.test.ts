/**
 * The pillar discovery the schema-coverage job matrix is built from.
 *
 * These cases lived in `check-pillar-schema-coverage.test.ts` until the
 * discovery moved into its own module: the matrix job runs install-free and
 * the guard reads TypeScript with the compiler's AST, so the two cannot share
 * a file without putting a `typescript` import in front of a job that has no
 * `node_modules` (ADR-045 Tier A).
 *
 * A renamed barrel removes a pillar from the guard AND from the matrix derived
 * from the same rule, and nine of ten pillars passing prints identically to ten
 * of ten (POPS-1629) — which is why discovery is asserted at all rather than
 * left to the guard's own self-test.
 *
 * Measured, not asserted: dropping the `package.json` condition from
 * `discoverUnanalysablePillars` fails 2 of these; dropping its
 * `looksPersistent` condition fails 2.
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
  discoverPillars,
  discoverUnanalysablePillars,
  reportUnanalysablePillars,
} from '../list-pillars.mjs';

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

describe('reportUnanalysablePillars', () => {
  it('says nothing and reports whole discovery when nothing fell out', () => {
    const lines: string[] = [];
    expect(reportUnanalysablePillars([], (line) => lines.push(line))).toBe(true);
    expect(lines).toEqual([]);
  });

  it('names every pillar that fell out, and says what it costs', () => {
    const lines: string[] = [];
    expect(reportUnanalysablePillars(['finance', 'ghost'], (line) => lines.push(line))).toBe(false);
    const printed = lines.join('\n');
    expect(printed).toContain('pillars/finance');
    expect(printed).toContain('pillars/ghost');
    expect(printed).toContain('job matrix');
  });
});

describe('the CLI the matrix job runs', () => {
  it('prints the real repo pillar set as JSON on stdout, and agrees with discoverPillars', () => {
    const stdout = execFileSync(process.execPath, ['scripts/list-pillars.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    const listed: unknown = JSON.parse(stdout);
    expect(Array.isArray(listed)).toBe(true);
    expect(listed).toEqual(discoverPillars(join(repoRoot, 'pillars')).map((p) => p.name));
    expect(listed).toContain('finance');
  });
});
