/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. Once the media pillar's FK-unsafe rebuild in
 * `0032_comparisons_baseline.sql` is fixed to not rely on the pragma, the
 * real tree will carry no PRAGMA foreign_keys at all — a suite that only ran
 * the guard would then be green whether or not the matcher still works.
 * These drive the pure core over source it must flag, over source it must
 * not, and over the real migration tree — so a matcher that silently stops
 * matching, or a discovery walk that silently stops finding files, fails
 * here.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

describe('the real migration tree', () => {
  it('carries no PRAGMA foreign_keys once the media rebuild fix has landed', () => {
    const files = discoverMigrationFiles();
    const allViolations = files.flatMap((f) =>
      findViolations(f, readFileSync(join(repoRoot, f), 'utf8'))
    );
    if (allViolations.length > 0) {
      throw new Error(
        `Real tree carries PRAGMA foreign_keys — expected clean once the media fix has ` +
          `landed: ${allViolations.map((v) => `${v.file}:${v.line}`).join(', ')}`
      );
    }
  });
});

describe('the guard CLI', () => {
  it('its self-test passes', () => {
    expect(() => execFileSync('node', [guard, '--self-test'], { stdio: 'pipe' })).not.toThrow();
  });

  it('exits 0 on the real tree', () => {
    expect(() => execFileSync('node', [guard], { stdio: 'pipe' })).not.toThrow();
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
