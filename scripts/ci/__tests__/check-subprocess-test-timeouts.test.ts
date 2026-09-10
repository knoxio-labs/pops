/**
 * The subprocess-timeout guard, checked against the tree it guards and against
 * every time this defect was found by hand.
 *
 * `scripts/ci/check-subprocess-test-timeouts.mjs` owns its degenerate cases in
 * `--self-test`, which the first case here runs for real. A self-test cannot
 * find the blind spot that produced it (POPS-2110), so the load-bearing part of
 * this file is the other half: the pre-fix version of every commit that fixed
 * this by hand is fed to the guard — read out of git where `main` still
 * reaches it, vendored under `__fixtures__/` where the squash ate it. If the
 * guard does not
 * turn those red, it does not catch what it claims to — and an earlier draft
 * did not. Its string scanner mistook the apostrophe in `` `${file}'s scope
 * job` `` for a quote, blanked the rest of the file, and reported zero
 * offenders on every fixture here while passing its own self-test.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  blankNoise,
  discoverTestFiles,
  scanRepo,
  spawningHelpers,
  unboundedSpawningTests,
} from '../check-subprocess-test-timeouts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guard = resolve(repoRoot, 'scripts', 'ci', 'check-subprocess-test-timeouts.mjs');

/** This file spawns `node` and `git` against the real repository. */
const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

/**
 * Every commit that bounded a real-subprocess test by hand, with the files it
 * touched.
 *
 * Named by the ticket that produced them, because the point of the check is
 * that the guard would have caught each one before the failure rather than
 * after. A file is listed once per commit that touched it; several were fixed
 * in stages, so a fixture is only asserted to have BEEN worse, not to be clean
 * at that commit.
 */
const HAND_FIXES = [
  {
    ticket: 'POPS-1550 / POPS-3017 — whole-tree scans that shell against the repo',
    commit: '1a03cd97d',
    file: 'scripts/ci/__tests__/check-openapi-drift.test.ts',
  },
  {
    ticket: 'POPS-2053 — the whole-tree mise resolution',
    commit: '410cf9004',
    file: 'scripts/ci/__tests__/check-mise-tool-overrides.test.ts',
  },
  {
    ticket: 'POPS-2053 (third bullet) — four `mise run run-all` tests, none bounded',
    commit: '410cf9004',
    file: 'scripts/__tests__/run-all-clients-discovery.test.ts',
  },
  {
    ticket: 'POPS-3003 / #4470 — every release.sh test that spawns git',
    commit: '759f3a387',
    file: 'scripts/__tests__/release.test.ts',
  },
] as const;

/**
 * POPS-2007's pre-fix source, vendored.
 *
 * Its commit was squashed away on the way to `main`, so no clone can reach the
 * content — and it is the case the ticket is named after, the one where a
 * generous `execFileSync` timeout sits next to an `it(...)` with none. The
 * fixture's own header records where it came from.
 */
const POPS_2007_FIXTURE = join(here, '__fixtures__', 'pops-2007-merge-group-scope.txt');

/**
 * The file's text at a revision.
 *
 * Throws rather than skipping when the history is not there. A shallow
 * checkout is the one way the git-read fixtures can silently stop proving
 * anything, so it has to be loud: `quality.yml`'s `scripts-tests` job carries
 * `fetch-depth: 0` for this, and the message says so.
 */
function sourceAt(rev: string, path: string): string {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: REAL_SUBPROCESS_TIMEOUT_MS,
    });
  } catch (cause) {
    throw new Error(
      `cannot read ${path} at ${rev}. This checkout has no history for it — the ` +
        'hand-fix fixtures need a full clone (`fetch-depth: 0`), and skipping ' +
        'them would leave the guard proving nothing.',
      { cause }
    );
  }
}

describe('the guard proves itself', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  it('passes its own --self-test', () => {
    const output = execFileSync(process.execPath, [guard, '--self-test'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: REAL_SUBPROCESS_TIMEOUT_MS,
    });
    expect(output).toMatch(/self-test mutations behave as stated/u);
  });
});

describe('the times this was found by hand', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  it.each(HAND_FIXES.map((fix) => [fix.ticket, fix] as const))(
    'would have caught %s',
    (_label, fix) => {
      const before = unboundedSpawningTests(sourceAt(`${fix.commit}^`, fix.file));
      const after = unboundedSpawningTests(sourceAt(fix.commit, fix.file));

      expect(
        before.length,
        `${fix.file} before ${fix.commit} looked already bounded`
      ).toBeGreaterThan(0);
      expect(
        after.length,
        `${fix.file} did not get better at ${fix.commit} — the guard is not measuring what that commit fixed`
      ).toBeLessThan(before.length);
    }
  );

  it("would have caught POPS-2007 — a 120s execFileSync timeout that was not the test's bound", () => {
    const source = readFileSync(POPS_2007_FIXTURE, 'utf8');

    // The trap, still in the fixture: the bound that looks like the bound.
    expect(source).toContain('timeout: 120_000');
    expect(unboundedSpawningTests(source)).toHaveLength(1);
  });
});

describe('the tree it guards', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  const { fileCount, spawningFiles, failures } = scanRepo(repoRoot);

  it('found test files to scan, and files that spawn (discovery floor)', () => {
    // Both halves of the match are regexes over source. A rename, a reformat
    // or a broken scanner would leave this check passing hardest at the moment
    // it had stopped reading anything.
    expect(fileCount).toBeGreaterThan(500);
    expect(spawningFiles).toBeGreaterThan(20);
  });

  it('every test reachable from a spawn states its own timeout', () => {
    expect(failures).toEqual([]);
  });

  it('discovers test files outside scripts/, not only the ones next to it', () => {
    const found = discoverTestFiles(repoRoot);
    expect(found.some((path) => path.includes('/pillars/'))).toBe(true);
    expect(found.some((path) => path.includes('/libs/'))).toBe(true);
    expect(found.every((path) => !path.includes('node_modules'))).toBe(true);
  });
});

describe('blankNoise', () => {
  it('keeps every offset where it was', () => {
    const source = "const a = 'hello'; // note\nconst b = 1;\n";
    expect(blankNoise(source)).toHaveLength(source.length);
    expect(blankNoise(source).split('\n')).toHaveLength(source.split('\n').length);
  });

  it('does not let an apostrophe inside a template hole swallow the file', () => {
    // The exact shape that made an earlier draft report nothing on every
    // fixture: `${file}` closes the hole, then `'s` looked like a string open.
    const source = "const m = `${file}'s scope job`;\nconst kept = spawnSync('git');\n";
    expect(blankNoise(source)).toContain('spawnSync(');
  });

  it('blanks a string, a comment and a regex, and nothing else', () => {
    const clean = blankNoise("run('x'); // run('y')\nconst r = /run\\(/u;\nrun('z');");
    expect([...clean.matchAll(/run\(/gu)]).toHaveLength(2);
  });

  it('leaves the code inside a template hole readable', () => {
    expect(blankNoise('const s = `a${run()}b`;')).toContain('run()');
  });

  it('survives an unterminated template rather than looping', () => {
    expect(blankNoise('const s = `never closed')).toHaveLength('const s = `never closed'.length);
  });
});

describe('spawningHelpers', () => {
  const namesIn = (source: string): string[] => {
    const clean = blankNoise(source);
    const offsets = [...clean.matchAll(/(?<![.\w$])execFileSync\s*\(/gu)].map(
      (match) => match.index ?? 0
    );
    return [...spawningHelpers(clean, offsets)].toSorted();
  };

  it('names an arrow helper whose body spawns', () => {
    expect(namesIn('const run = () => execFileSync("mise");')).toEqual(['run']);
  });

  it('names a function declaration whose body spawns', () => {
    expect(namesIn('function run() {\n  return execFileSync("mise");\n}')).toEqual(['run']);
  });

  it('follows one helper into another, in either declaration order', () => {
    const forwards = 'const inner = () => execFileSync("mise");\nconst outer = () => inner();';
    const backwards = 'const outer = () => inner();\nconst inner = () => execFileSync("mise");';
    expect(namesIn(forwards)).toEqual(['inner', 'outer']);
    expect(namesIn(backwards)).toEqual(['inner', 'outer']);
  });

  it('leaves a neighbour that only mentions the helper alone', () => {
    // Called, not named: `runLabel` holds the name as data.
    expect(namesIn('const run = () => execFileSync("m");\nconst runLabel = "run";')).toEqual([
      'run',
    ]);
  });

  it('does not follow a function that spawns nothing', () => {
    expect(namesIn('const parse = (x) => JSON.parse(x);')).toEqual([]);
  });
});
