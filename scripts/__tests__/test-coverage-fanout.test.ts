/**
 * The root `test:coverage` task must fan out to something.
 *
 * It fanned out to nothing for its whole life. `test:coverage` is a
 * package.json script in 32 units and a mise task in none; `mise run run-all
 * test:coverage` resolves mise tasks, found none, never entered the loop and
 * exited 0. Nothing in CI invokes it, so no workflow ever changed colour, and
 * anyone who ran it by hand got a fast, quiet, meaningless zero (POPS-3104).
 *
 * Every case drives the REAL task body, lifted out of the repo's own
 * `mise.toml` by `extractTaskField`, against a fixture tree of throwaway
 * units. A transcribed copy would keep passing after the body changed.
 *
 * `pnpm` is a recording stub on PATH: what is under test is which units the
 * body finds and whether it refuses an empty fan-out, not what a coverage run
 * reports.
 */

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractTaskField } from './mise-task-source.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

// Quoted, because the section header is `[tasks."test:coverage"]` — a bare
// `test:coverage` would read as a nested table to TOML.
const taskBody = extractTaskField(
  readFileSync(join(repoRoot, 'mise.toml'), 'utf8'),
  '"test:coverage"',
  'run'
);

/** Whether a unit directory's package.json declares a `test:coverage` script. */
function declaresCoverage(unitDir: string): boolean {
  const manifest = join(unitDir, 'package.json');
  if (!existsSync(manifest)) return false;
  const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) return false;
  const scripts = parsed.scripts;
  return typeof scripts === 'object' && scripts !== null && 'test:coverage' in scripts;
}

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
  /** Arguments the stubbed `pnpm` was invoked with, one line per invocation. */
  pnpmCalls: string[];
}

/**
 * @param units Unit path → whether its package.json declares the script.
 */
function runBodyAgainst(units: Readonly<Record<string, boolean>>): Outcome {
  const root = mkdtempSync(join(tmpdir(), 'coverage-fanout-'));
  try {
    const binDir = join(root, 'bin');
    const calls = join(root, 'pnpm-calls');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, 'pnpm'), `#!/bin/sh\necho "$@" >> ${calls}\n`, 'utf8');
    chmodSync(join(binDir, 'pnpm'), 0o755);

    for (const [unit, declares] of Object.entries(units)) {
      mkdirSync(join(root, unit), { recursive: true });
      const scripts = declares
        ? { 'test:coverage': 'vitest run --coverage' }
        : { test: 'vitest run' };
      writeFileSync(
        join(root, unit, 'package.json'),
        JSON.stringify({ name: unit, scripts }),
        'utf8'
      );
    }

    let status = 0;
    let stdout = '';
    let stderr = '';
    try {
      stdout = execFileSync('sh', ['-c', taskBody], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binDir}${delimiter}${process.env['PATH'] ?? ''}` },
      });
    } catch (error) {
      status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof error.status === 'number'
          ? error.status
          : -1;
      stdout =
        typeof error === 'object' &&
        error !== null &&
        'stdout' in error &&
        typeof error.stdout === 'string'
          ? error.stdout
          : '';
      stderr =
        typeof error === 'object' &&
        error !== null &&
        'stderr' in error &&
        typeof error.stderr === 'string'
          ? error.stderr
          : '';
    }

    let pnpmCalls: string[] = [];
    try {
      pnpmCalls = readFileSync(calls, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '');
    } catch {
      pnpmCalls = [];
    }
    return { status, stdout, stderr, pnpmCalls };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('the root test:coverage task', () => {
  it('refuses a fan-out over zero units instead of exiting 0 having done nothing', () => {
    const outcome = runBodyAgainst({ 'pillars/alpha': false, 'libs/beta': false });

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('nothing would run');
    expect(outcome.pnpmCalls).toEqual([]);
  });

  it('refuses an empty tree, which is the state the task shipped in', () => {
    const outcome = runBodyAgainst({});

    expect(outcome.status).toBe(1);
    expect(outcome.pnpmCalls).toEqual([]);
  });

  it('counts the units that declare the script and hands the run to pnpm', () => {
    const outcome = runBodyAgainst({
      'pillars/alpha': true,
      'pillars/alpha/app': true,
      'libs/beta': true,
      'libs/gamma': false,
    });

    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('3 unit(s) declare it');
    expect(outcome.pnpmCalls).toEqual(['-r --if-present run test:coverage']);
  });

  it('looks at package.json scripts, not at mise tasks, which is the confusion that caused this', () => {
    const outcome = runBodyAgainst({ 'pillars/alpha': false });

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('package.json script, not a mise task');
  });
});

describe('the real repo, which is what the task will actually be run against', () => {
  it('has units declaring the script, so the shipped task is no longer a no-op', () => {
    // Pinned against the tree rather than a fixture: a fixture cannot notice
    // the workspace drifting back to the state POPS-3104 describes, which is
    // the only state in which this task lies about what it did.
    const declaring = readdirSync(join(repoRoot, 'pillars'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => declaresCoverage(join(repoRoot, 'pillars', entry.name)));

    expect(declaring.length).toBeGreaterThan(0);
  });
});
