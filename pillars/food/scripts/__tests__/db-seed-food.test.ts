import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const SCRIPT_PATH = fileURLToPath(new URL('../db-seed-food.ts', import.meta.url));

/**
 * `db-seed-food.ts` falls back to a default DB path when `SQLITE_PATH` is
 * unset. That default must resolve against the food package root, not
 * whatever directory the script happens to be invoked from — otherwise
 * running it from the repo root (or anywhere but `pillars/food`) computes a
 * path outside the food package and the dev-seed guard refuses it.
 */
describe('db-seed-food.ts default DB path', () => {
  it('resolves the default against the food package root, not the caller cwd', () => {
    expect(existsSync(REPO_ROOT)).toBe(true);
    expect(REPO_ROOT).not.toBe(PACKAGE_ROOT);

    let output: string;
    try {
      execFileSync('pnpm', ['exec', 'tsx', SCRIPT_PATH], {
        cwd: REPO_ROOT,
        env: { ...process.env, SQLITE_PATH: undefined, NODE_ENV: 'test' },
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      throw new Error('expected db-seed-food.ts to exit non-zero (no database file present)');
    } catch (error) {
      const stderr =
        error !== null && typeof error === 'object' && 'stderr' in error
          ? String((error as { stderr: unknown }).stderr)
          : '';
      output = stderr;
    }

    expect(output).not.toMatch(/refusing to seed/u);
    expect(output).toContain('Database not found at');
    expect(output).toContain(PACKAGE_ROOT.replace(/\/$/u, ''));
  });
});
