/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. These drive the pure core over source it must flag and over source
 * it must not, so a matcher that silently stops matching fails here.
 *
 * Deliberately does NOT assert the real tree is clean. The media pillar's
 * `0032_comparisons_baseline.sql` still relies on the pragma today — its
 * FK-unsafe rebuild needs a separate, already-in-flight fix before this
 * guard's own CI step (which runs `check-migration-fk-pragma.mjs` directly
 * against the real tree, not through this suite) can pass. A test here
 * asserting a clean real tree would be red for a reason this suite cannot
 * fix, and would block every unrelated push through the pre-push hook in the
 * meantime. `discoverMigrationFiles` is still exercised against the real
 * repo below, to prove discovery finds real files rather than only
 * synthetic ones — just not that what it finds is violation-free.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { discoverMigrationFiles, findViolations } from '../check-migration-fk-pragma.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guard = join(repoRoot, 'scripts', 'ci', 'check-migration-fk-pragma.mjs');

describe('findViolations', () => {
  it.each(['OFF', 'ON', '0', '1'])('reports PRAGMA foreign_keys=%s', (value) => {
    const hits = findViolations('pillars/x/migrations/0001_x.sql', `PRAGMA foreign_keys=${value};`);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(1);
  });

  it('reports the bare form with no argument', () => {
    const hits = findViolations('pillars/x/migrations/0001_x.sql', 'PRAGMA foreign_keys;');
    expect(hits).toHaveLength(1);
  });

  it('reports case-insensitively', () => {
    const hits = findViolations('pillars/x/migrations/0001_x.sql', 'pragma FOREIGN_KEYS=off;');
    expect(hits).toHaveLength(1);
  });

  it('reports the ON form just as it reports OFF — both are equally a no-op mid-transaction', () => {
    const off = findViolations('a.sql', 'PRAGMA foreign_keys=OFF;');
    const on = findViolations('a.sql', 'PRAGMA foreign_keys=ON;');
    expect(off).toHaveLength(1);
    expect(on).toHaveLength(1);
  });

  it('reports the 1-based line the statement appears on', () => {
    const source = [
      'CREATE TABLE `__new_budgets` (',
      '\t`id` text PRIMARY KEY NOT NULL',
      ');',
      'PRAGMA foreign_keys=OFF;',
      'DROP TABLE `budgets`;',
    ].join('\n');
    expect(findViolations('a.sql', source)).toEqual([expect.objectContaining({ line: 4 })]);
  });

  it('does not flag a SQL comment merely discussing foreign keys', () => {
    const source = [
      '-- (otherwise an insert with `foreign_keys = ON` fails once `entities` is gone).',
      '-- even with `foreign_keys = ON`, then `entities` is dropped last.',
    ].join('\n');
    expect(findViolations('a.sql', source)).toHaveLength(0);
  });

  it('does not flag ordinary migration SQL with no pragma', () => {
    const source = [
      'CREATE TABLE `__new_budgets` (',
      '\t`id` text PRIMARY KEY NOT NULL',
      ');',
      'DROP TABLE `budgets`;',
      'ALTER TABLE `__new_budgets` RENAME TO `budgets`;',
    ].join('\n');
    expect(findViolations('a.sql', source)).toHaveLength(0);
  });

  it('reports every dirty line, not just the first', () => {
    const source = ['PRAGMA foreign_keys=OFF;', 'SELECT 1;', 'PRAGMA foreign_keys=ON;'].join('\n');
    const hits = findViolations('a.sql', source);
    expect(hits.map((v) => v.line)).toEqual([1, 3]);
  });

  it.each(['main', 'temp'])('reports a %s.-schema-qualified pragma', (schema) => {
    const hits = findViolations('a.sql', `PRAGMA ${schema}.foreign_keys=OFF;`);
    expect(hits).toHaveLength(1);
  });

  it('reports a pragma split across two lines', () => {
    const source = ['PRAGMA', '  foreign_keys=OFF;'].join('\n');
    const hits = findViolations('a.sql', source);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(1);
  });

  it('does not flag a trailing (non-leading) -- comment', () => {
    const hits = findViolations('a.sql', 'DROP TABLE x; -- never use PRAGMA foreign_keys=OFF');
    expect(hits).toHaveLength(0);
  });

  it('does not flag a pragma inside a /* */ block comment', () => {
    const source = ['/*', ' PRAGMA foreign_keys=OFF;', '*/', 'SELECT 1;'].join('\n');
    expect(findViolations('a.sql', source)).toHaveLength(0);
  });

  it('does not flag a pragma spelled out inside a string literal', () => {
    const hits = findViolations('a.sql', "INSERT INTO t VALUES ('PRAGMA foreign_keys=OFF');");
    expect(hits).toHaveLength(0);
  });

  it('still reports a real pragma on the line after a string literal that mentions one', () => {
    const source = [
      "INSERT INTO t VALUES ('PRAGMA foreign_keys=OFF');",
      'PRAGMA foreign_keys=OFF;',
    ].join('\n');
    const hits = findViolations('a.sql', source);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(2);
  });

  it('does not require SELECT * FROM pragma_foreign_keys detection (out of scope, documented)', () => {
    const hits = findViolations('a.sql', 'SELECT * FROM pragma_foreign_keys;');
    expect(hits).toHaveLength(0);
  });
});

describe('discoverMigrationFiles against the real repo', () => {
  it('finds every pillars/<id>/migrations/*.sql file, well above a believable floor', () => {
    const files = discoverMigrationFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files.every((f) => /^pillars\/[^/]+\/migrations\/.*\.sql$/.test(f))).toBe(true);
  });

  it('is not a hardcoded pillar list — finance and media are both present', () => {
    const files = discoverMigrationFiles();
    expect(files.some((f) => f.startsWith('pillars/finance/migrations/'))).toBe(true);
    expect(files.some((f) => f.startsWith('pillars/media/migrations/'))).toBe(true);
  });
});

describe('the guard CLI', () => {
  it('its self-test passes', () => {
    expect(() => execFileSync('node', [guard, '--self-test'], { stdio: 'pipe' })).not.toThrow();
  });

  it('exits 2 on --help', () => {
    try {
      execFileSync('node', [guard, '--help'], { stdio: 'pipe' });
      throw new Error('expected --help to exit non-zero');
    } catch (error) {
      expect((error as { status?: number }).status).toBe(2);
    }
  });
});
