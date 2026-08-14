#!/usr/bin/env node
/**
 * Resolve the base commit `report-contract-consumers.mjs`'s CI step diffs
 * HEAD against, and print it — or print nothing when there is none.
 *
 * The job in `.github/workflows/quality.yml` runs on three event shapes, and
 * `--ref` carries the workflow's own resolution of which branch HEAD is
 * built on:
 *
 *   - `pull_request` — `--ref` is `github.base_ref` (e.g. `main`). HEAD is the
 *     PR branch tip, `origin/<ref>` is the target branch, and
 *     `git merge-base` returns the PR's fork point — the diff is exactly the
 *     PR's own changes.
 *   - `merge_group`   — `github.base_ref` is empty, so `--ref` falls back to
 *     `github.event.merge_group.base_ref`. A merge group is prospective
 *     `main`: HEAD is the queued commits built directly on top of
 *     `origin/<ref>`'s tip, so the merge-base IS that tip, and the diff is
 *     exactly the queued change — not empty, and not "everything". (The
 *     workflow step this replaces carried a comment claiming push and
 *     merge_group behave the same way; they do not — see the git history of
 *     that comment for why it was wrong.)
 *   - `push` (to `main`) — `github.base_ref` and `merge_group.base_ref` are
 *     both empty, so `--ref` falls back to the literal `main`. `origin/main`
 *     has already been refreshed by this same checkout, so it equals HEAD:
 *     the merge-base IS HEAD, the diff is empty, and the report is correctly
 *     silent on a push that already landed.
 *
 * A base that cannot be resolved (no `origin/<ref>`, or `<ref>` is not an
 * ancestor of HEAD) prints nothing and exits 0 — the caller's job is to fall
 * back to "report every leg", not to fail the build over a scoping miss. See
 * `docs/architecture/adr-045-guards-must-prove-they-report.md`.
 *
 * Usage:
 *   node scripts/ci/resolve-report-base.mjs --ref <branch> [--cwd <dir>]
 *   node scripts/ci/resolve-report-base.mjs --self-test
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `process.env` with git's repository-location overrides removed, so every
 * invocation here is about the directory it is run in and nothing else — the
 * same regression `merge-group-scope.mjs` documents on `GIT_LOCATION_VARS`:
 * a `.husky/pre-push` hook exports `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`
 * for the repo being pushed, and this script's self-test fixtures would
 * silently run against that repo instead of their own temp directory.
 *
 * @param {Record<string, string | undefined>} [extra]
 * @returns {Record<string, string | undefined>}
 */
function gitEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const name of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_PREFIX',
    'GIT_QUARANTINE_PATH',
    'GIT_NAMESPACE',
  ]) {
    delete env[name];
  }
  return env;
}

/**
 * @param {readonly string[]} args
 * @param {string} cwd
 * @returns {string | null} stdout, trimmed — or `null` when git failed.
 */
function tryGit(args, cwd) {
  try {
    return execFileSync('git', [...args], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      env: gitEnv(),
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The base commit to diff HEAD against, or `null` when none is usable.
 *
 * @param {object} args
 * @param {string} args.ref  A branch name, e.g. `main` — not a full ref, not a SHA.
 * @param {string} args.cwd
 * @returns {string | null}
 */
export function resolveBase({ ref, cwd }) {
  const trimmed = ref.trim();
  if (trimmed.length === 0) return null;
  return tryGit(['merge-base', `origin/${trimmed}`, 'HEAD'], cwd);
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

/**
 * @param {string} dir
 * @param {readonly string[]} args
 * @returns {string}
 */
function gitIn(dir, args) {
  return execFileSync('git', [...args], {
    cwd: dir,
    encoding: 'utf8',
    stdio: 'pipe',
    env: gitEnv({
      GIT_AUTHOR_NAME: 'resolve-report-base',
      GIT_AUTHOR_EMAIL: 'resolve-report-base@example.invalid',
      GIT_COMMITTER_NAME: 'resolve-report-base',
      GIT_COMMITTER_EMAIL: 'resolve-report-base@example.invalid',
    }),
  }).trim();
}

/**
 * @param {string} dir
 * @param {string} relative
 * @param {string} content
 */
function writeIn(dir, relative, content) {
  writeFileSync(join(dir, relative), content);
}

/**
 * A throwaway repo with a `main` branch, an `origin/main` remote-tracking
 * ref pinned to a known commit, and a working tree on `HEAD`. Every case
 * below builds `HEAD` differently relative to that pinned `origin/main`, to
 * exercise the three shapes `resolveBase` is actually called for.
 *
 * @returns {{ dir: string, mainTip: string }}
 */
function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'resolve-report-base-'));
  gitIn(dir, ['init', '--quiet', '-b', 'main']);
  writeIn(dir, 'seed.txt', 'seed\n');
  gitIn(dir, ['add', '-A']);
  gitIn(dir, ['commit', '--quiet', '-m', 'root']);
  const mainTip = gitIn(dir, ['rev-parse', 'HEAD']);
  // A real remote-tracking ref, not a second local branch — `origin/main` is
  // what the workflow's `origin/${ref}` expression actually resolves, and a
  // plain branch named `origin/main` would pass this test while a checkout
  // with no `origin` remote configured would not.
  gitIn(dir, ['update-ref', 'refs/remotes/origin/main', mainTip]);
  return { dir, mainTip };
}

/**
 * @param {boolean} condition
 * @param {string} message
 * @throws {Error}
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * @typedef {object} SelfTestCase
 * @property {string} name
 * @property {() => void} run
 */

/** @returns {boolean} */
function selfTest() {
  /** @type {SelfTestCase[]} */
  const cases = [];
  /** @type {string[]} */
  const scratch = [];

  cases.push({
    name: 'pull_request shape: HEAD is a PR branch ahead of origin/main — base is the fork point',
    run: () => {
      const { dir, mainTip } = fixtureRepo();
      scratch.push(dir);
      gitIn(dir, ['checkout', '--quiet', '-b', 'pr-branch']);
      writeIn(dir, 'feature.txt', 'feature\n');
      gitIn(dir, ['add', '-A']);
      gitIn(dir, ['commit', '--quiet', '-m', 'pr commit']);
      const base = resolveBase({ ref: 'main', cwd: dir });
      // Pinned against `mainTip`, captured before the PR commit existed — not
      // re-derived by calling `resolveBase` a second way, so a `resolveBase`
      // that always answered "HEAD" would fail this the same as a correct one
      // that answered the wrong commit.
      assert(base === mainTip, `expected the fork point ${mainTip}, got ${String(base)}`);
    },
  });

  cases.push({
    name:
      'merge_group shape: HEAD is queued commits already built on origin/main — base is main’s ' +
      'tip, and the diff is the queued change, not empty and not everything',
    run: () => {
      const { dir, mainTip } = fixtureRepo();
      scratch.push(dir);
      // No new branch: a merge group's HEAD is directly on top of the base it
      // will land on, so this stays on `main` and commits straight onto it —
      // exactly what `origin/main` was pinned to before this commit existed.
      writeIn(dir, 'queued.txt', 'queued change\n');
      gitIn(dir, ['add', '-A']);
      gitIn(dir, ['commit', '--quiet', '-m', 'queued pr, squashed onto its base']);
      const head = gitIn(dir, ['rev-parse', 'HEAD']);
      const base = resolveBase({ ref: 'main', cwd: dir });
      assert(base === mainTip, `expected main's tip ${mainTip}, got ${String(base)}`);
      assert(base !== head, 'base must not equal HEAD — that would report an empty diff');
      const diff = gitIn(dir, ['diff', '--name-only', String(base), head]);
      assert(
        diff === 'queued.txt',
        `expected the diff to be exactly the queued change, got ${JSON.stringify(diff)}`
      );
    },
  });

  cases.push({
    name: 'push shape: origin/main already equals HEAD — base IS head, diff is empty, silence is correct',
    run: () => {
      const { dir, mainTip } = fixtureRepo();
      scratch.push(dir);
      const base = resolveBase({ ref: 'main', cwd: dir });
      assert(base === mainTip, `expected HEAD itself (${mainTip}), got ${String(base)}`);
      const diff = gitIn(dir, ['diff', '--name-only', String(base), 'HEAD']);
      assert(diff === '', `expected an empty diff, got ${JSON.stringify(diff)}`);
    },
  });

  cases.push({
    name: 'refuses rather than guesses when origin/<ref> does not exist',
    run: () => {
      const { dir } = fixtureRepo();
      scratch.push(dir);
      const base = resolveBase({ ref: 'a-branch-with-no-remote-tracking-ref', cwd: dir });
      assert(base === null, `expected null, got ${JSON.stringify(base)}`);
    },
  });

  cases.push({
    name: 'refuses rather than guesses when --ref is blank',
    run: () => {
      const { dir } = fixtureRepo();
      scratch.push(dir);
      assert(resolveBase({ ref: '', cwd: dir }) === null, 'a blank ref must resolve to null');
      assert(
        resolveBase({ ref: '   ', cwd: dir }) === null,
        'a whitespace ref must resolve to null'
      );
    },
  });

  /** @type {string[]} */
  const failures = [];
  try {
    for (const testCase of cases) {
      try {
        testCase.run();
      } catch (error) {
        failures.push(
          `${testCase.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } finally {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(
      `self-test FAILED — ${String(failures.length)} of ${String(cases.length)} case(s):`
    );
    for (const failure of failures) console.error(`  ${failure}`);
    return false;
  }
  console.log(
    `self-test OK — resolves the pull_request fork point, the merge_group base (queued diff, ` +
      `neither empty nor everything), the push no-op, and refuses rather than guessing when ` +
      `origin/<ref> is missing (${String(cases.length)} cases).`
  );
  return true;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @param {readonly string[]} argv
 * @param {string} name
 * @returns {string | undefined}
 */
function flag(argv, name) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const ref = flag(argv, 'ref');
  if (ref === undefined) {
    console.error('::error::resolve-report-base: --ref <branch> is required');
    process.exit(1);
  }
  const cwd = flag(argv, 'cwd') ?? process.cwd();
  const base = resolveBase({ ref, cwd });
  if (base !== null) console.log(base);
  process.exit(0);
}

if (import.meta.main) {
  main();
}
