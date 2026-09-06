/**
 * The EX-1 per-PR driver's discovery, which had three ways to report ✔ over a
 * change set it never obtained.
 *
 * `mapfile -t changed < <(git diff … 2>/dev/null || true)` discarded git's
 * failure three times over — stderr to `/dev/null`, `|| true`, and a process
 * substitution whose exit status bash never propagates anyway. An empty
 * `changed` array reaches the "nothing to check" exit, which is the gate's
 * success value. The authors had already applied the right reasoning one axis
 * over: a shallow clone falls back to a full sweep rather than skipping,
 * "never skip the gate silently". The diff itself did not get that treatment.
 *
 * Every case drives the REAL script, copied into a fixture tree so
 * `repo_root` — which it derives from its own location — lands somewhere this
 * suite controls. A transcribed copy would keep passing after the script
 * changed. `depcheck.mjs` is stubbed there so the assertions are about what
 * the driver decided to check, not about phantom dependencies.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const realScript = join(repoRoot, 'scripts', 'extractability', 'check-changed-units.sh');

/** The gate reports through a stub, so a case asserts on the decision, not the deps. */
const DEPCHECK_STUB = `#!/usr/bin/env node
process.stdout.write('DEPCHECK ' + process.argv.slice(2).join(' ') + '\\n');
`;

let root: string;

function git(args: string[], cwd = root): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function write(relative: string, contents: string, mode?: number): void {
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
  if (mode !== undefined) chmodSync(file, mode);
}

function run(
  args: string[],
  extraPath?: string
): { status: number; stdout: string; stderr: string } {
  const env = { ...process.env };
  if (extraPath !== undefined) env.PATH = `${extraPath}${delimiter}${env.PATH ?? ''}`;
  const result = spawnSync(
    'bash',
    [join(root, 'scripts', 'extractability', 'check-changed-units.sh'), ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env,
    }
  );
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ex1-changed-'));
  mkdirSync(join(root, 'scripts', 'extractability'), { recursive: true });
  copyFileSync(realScript, join(root, 'scripts', 'extractability', 'check-changed-units.sh'));
  write('scripts/extractability/depcheck.mjs', DEPCHECK_STUB, 0o755);
  write('libs/.keep', '');
  write('pillars/.keep', '');
  write('libs/types/package.json', JSON.stringify({ name: '@fixture/types' }));
  write('libs/types/src/index.ts', 'export const a = 1;\n');

  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'user.name', 'fixture']);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'base']);
  git(['branch', 'base-point']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('check-changed-units.sh', () => {
  it('checks only the units the diff touched', () => {
    write('libs/types/src/index.ts', 'export const a = 2;\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'change types']);

    const { status, stdout } = run(['--base', 'base-point']);

    expect(status).toBe(0);
    expect(stdout).toContain('DEPCHECK libs/types');
    expect(stdout).not.toContain('--all');
  });

  it('reports nothing to check when the diff is genuinely empty', () => {
    const { status, stderr, stdout } = run(['--base', 'base-point']);

    expect(status).toBe(0);
    expect(stderr).toContain('nothing to check');
    expect(stdout).not.toContain('DEPCHECK');
  });

  it('sweeps everything when there is no merge-base, rather than skipping', () => {
    const { status, stdout, stderr } = run(['--base', 'no-such-ref']);

    expect(status).toBe(0);
    expect(stderr).toContain('no merge-base');
    expect(stdout).toContain('DEPCHECK --all');
  });

  it('sweeps everything when git itself fails, rather than reading the failure as no changes', () => {
    // A `git` earlier on PATH that fails only the diff. The point is the exit
    // status: the previous form sent it to /dev/null, `|| true`d it, and read
    // it through a process substitution that never propagates one — three
    // independent reasons an empty change set could not be told from a real
    // one.
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    write(
      'bin/git',
      ['#!/bin/sh', 'if [ "$1" = "diff" ]; then exit 128; fi', `exec ${realGit} "$@"`, ''].join(
        '\n'
      ),
      0o755
    );

    const { status, stdout, stderr } = run(['--base', 'base-point'], join(root, 'bin'));

    expect(status).toBe(0);
    expect(stderr).toContain('git diff');
    expect(stdout).toContain('DEPCHECK --all');
  });

  it('fails when a scoped pathspec is not a directory, rather than diffing against nothing', () => {
    rmSync(join(root, 'libs'), { recursive: true, force: true });

    const { status, stderr, stdout } = run(['--base', 'base-point']);

    expect(status).toBe(1);
    expect(stderr).toContain("'libs/' is not a directory");
    expect(stdout).not.toContain('DEPCHECK');
  });

  it('passes --all straight through without consulting git at all', () => {
    const { status, stdout } = run(['--all']);

    expect(status).toBe(0);
    expect(stdout).toContain('DEPCHECK --all');
  });
});
