/**
 * `run-all` must attempt every unit that defines the task, not stop at the
 * first red one.
 *
 * Units are iterated in `sort` order, and the fan-out used to end each
 * invocation with `|| exit 1`. A failure in `pillars/media` therefore ended
 * the run before `pillars/orchestrator`, `pillars/purchases`,
 * `pillars/registry` and `pillars/shell` had been touched, and nothing in the
 * output said so: the run ended with the failing unit's own report, which
 * reads exactly like a complete run that found one problem. That is how
 * POPS-1915 was found — a known `pillars/media` flake hid a real
 * `pillars/shell` regression, and the evidence that shell had not run was the
 * absence of the word "shell" from the log.
 *
 * Every case here drives the REAL task body, lifted out of the repo's own
 * `mise.toml` by `extractTaskField`, against a fixture tree of throwaway
 * units. A transcribed copy would keep passing after the body changed.
 *
 * To watch these fail: put `|| exit 1` back on the `mise run -C` line. The
 * first case then sees only the alphabetically-first unit's marker, and the
 * other two lose the summary they read.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { extractTaskField } from './mise-task-source.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Shells out to the real `mise`, which then fans the task out across the
 * fixture's units — several subprocesses per assertion, none of them bounded
 * by what is being asserted. Matches the budget the sibling real-mise suites
 * use for the same reason (POPS-2053).
 */
const REAL_MISE_TIMEOUT_MS = 120_000;

/**
 * The pieces of a failed `execFileSync` this suite reads, narrowed rather than
 * asserted — a thrown value is `unknown`, and casting it to the shape we hope
 * for is how a case that stopped producing a `stderr` at all would still read
 * as a pass on `''`.
 */
function spawnFailure(error: unknown): { status: number | null; stderr: string } {
  if (typeof error !== 'object' || error === null) return { status: null, stderr: '' };
  const status = 'status' in error && typeof error.status === 'number' ? error.status : null;
  const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
  return { status, stderr };
}

interface Outcome {
  /** Marker lines the fixture units appended, sorted. */
  ran: string[];
  status: number | null;
  stderr: string;
}

describe('run-all: a red unit does not hide the units after it (real mise binary)', () => {
  // Fails rather than skips: a silent no-op would report green while
  // exercising nothing, which is worse than having no suite at all. `mise` is
  // step 0 in AGENTS.md, so its absence is a broken environment.
  beforeAll(() => {
    execFileSync('mise', ['--version'], { stdio: 'ignore' });
  });

  let root: string;

  beforeAll(() => {
    const rootMiseToml = readFileSync(join(repoRoot, 'mise.toml'), 'utf8');
    const usage = extractTaskField(rootMiseToml, 'run-all', 'usage');
    const run = extractTaskField(rootMiseToml, 'run-all', 'run');

    root = mkdtempSync(join(tmpdir(), 'run-all-failures-'));

    const unit = (dir: string, body: string): void => {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'mise.toml'), body);
    };
    const marker = (name: string): string => `echo ${name} >> "$OUT_FILE"`;

    // Named so `sort` order is the interesting one: the two red units bracket
    // the green one, so a fail-fast loop stops before the green unit runs AND
    // before the second failure is ever seen.
    // Triple-quoted: a TOML single-quoted literal cannot span lines, and a
    // unit whose mise.toml does not parse is skipped by the source guard —
    // which would make this suite pass by never running the red units at all.
    unit('pillars/a-red', `[tasks.check]\nrun = '''\n${marker('ran-a-red')}\nexit 3\n'''\n`);
    unit('libs/m-red', `[tasks.check]\nrun = '''\n${marker('ran-m-red')}\nexit 4\n'''\n`);
    unit('pillars/z-green', `[tasks.check]\nrun = '''\n${marker('ran-z-green')}\n'''\n`);
    // A fourth unit defining something else entirely: skipped by the source
    // guard, and must not inflate the attempted count that tells the reader
    // nothing was left out.
    unit('libs/no-task', '[tasks.other]\nrun = "true"\n');

    writeFileSync(
      join(root, 'mise.toml'),
      `[tasks.run-all]\nusage = '${usage}'\nrun = '''\n${run}\n'''\n`
    );
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  /**
   * One `run-all check` against the fixture tree.
   *
   * mise refuses config it has not been told to trust, and its trust store is
   * keyed on absolute path — `root` is a fresh mkdtemp it has never seen.
   * Naming it explicitly beats relying on mise's "safe config" classification
   * or on its CI detection, neither of which is a property of this repo.
   *
   * A non-zero exit is the expected outcome here, so the throw is caught and
   * turned into a value rather than left to fail the case.
   */
  function runAllCheck(label: string): Outcome {
    return runAllTask('check', label);
  }

  function runAllTask(task: string, label: string): Outcome {
    const outFile = join(root, `out-${label}.txt`);
    writeFileSync(outFile, '');
    const inherited = process.env.MISE_TRUSTED_CONFIG_PATHS;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MISE_TRUSTED_CONFIG_PATHS: inherited === undefined ? root : `${root}${delimiter}${inherited}`,
      OUT_FILE: outFile,
    };
    let status: number | null = 0;
    let stderr = '';
    try {
      execFileSync('mise', ['run', '-C', root, 'run-all', task], {
        env,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      const failure = spawnFailure(error);
      status = failure.status;
      stderr = failure.stderr;
    }
    const ran = readFileSync(outFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .toSorted((a, b) => a.localeCompare(b));
    return { ran, status, stderr };
  }

  it(
    'runs every unit that defines the task, including the ones after the first failure',
    () => {
      expect(runAllCheck('markers').ran).toEqual(['ran-a-red', 'ran-m-red', 'ran-z-green']);
    },
    REAL_MISE_TIMEOUT_MS
  );

  it(
    'exits non-zero and names every failing unit, not just the first',
    () => {
      const outcome = runAllCheck('summary');

      expect(outcome.status).not.toBe(0);
      expect(outcome.stderr).toContain('FAILED');
      expect(outcome.stderr).toContain('pillars/a-red');
      expect(outcome.stderr).toContain('libs/m-red');
    },
    REAL_MISE_TIMEOUT_MS
  );

  it(
    'counts only the units that define the task as attempted',
    () => {
      // Three fixture units define `check`; the fourth defines a different
      // task and must not inflate the count.
      expect(runAllCheck('count').stderr).toContain('3 unit(s)');
    },
    REAL_MISE_TIMEOUT_MS
  );

  it(
    'fails rather than reporting success over a task no unit defines',
    () => {
      // The other way a fan-out reports success without doing anything, and
      // the one a summary line would otherwise dress up as "passed in all 0
      // unit(s)". No fixture unit defines this task, so the source guard
      // skips every one of them and nothing runs.
      const outcome = runAllTask('nothing-defines-this', 'absent');

      expect(outcome.status).not.toBe(0);
      expect(outcome.stderr).toContain('nothing ran');
      expect(outcome.ran).toEqual([]);
    },
    REAL_MISE_TIMEOUT_MS
  );
});
