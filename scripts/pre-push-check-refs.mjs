#!/usr/bin/env node
/**
 * Decide which pushed commit(s) `.husky/pre-push`'s conflict check
 * (`git merge-tree`) and line-budget check
 * (`scripts/ci/check-line-budget-headroom.mjs`) must run against, and run
 * them.
 *
 * Git's pre-push protocol (githooks(5)): one line per ref being pushed,
 * `<local ref> <local sha> <remote ref> <remote sha>`, on stdin. A local sha
 * of all zeros is a delete.
 *
 * Two rules that are not obvious from the code alone:
 *   - A ref is skipped only when the REMOTE ref is `refs/heads/main` — not
 *     when the locally checked-out branch happens to be named main.
 *   - A pushed sha that is not HEAD is refused, never silently checked: the
 *     typecheck that already ran (in `.husky/pre-push`, before this script)
 *     only vouches for the working tree, i.e. HEAD.
 *
 * Usage: node scripts/pre-push-check-refs.mjs   (reads the pre-push stdin protocol)
 *        node scripts/pre-push-check-refs.mjs --self-test
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitEnv } from './ci/resolve-report-base.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * The line-budget check's own file, referenced by ITS location rather than a
 * path relative to the repo being checked — `--repo` (below) lets it analyse
 * a different repo's git history while this script's argv still points at
 * the real binary, which is what makes the throwaway-repo self-test possible
 * without a copy of `check-line-budget-headroom.mjs` inside the fixture.
 */
const budgetCheckScript = join(here, 'ci', 'check-line-budget-headroom.mjs');

/** A SHA of all zeros: git's way of saying "this ref does not exist". */
const NULL_SHA = /^0+$/u;

/** The one remote ref every check below is skipped for. */
const MAIN_REF = 'refs/heads/main';

/**
 * @typedef {object} RefUpdate
 * @property {string} localRef
 * @property {string} localSha
 * @property {string} remoteRef
 * @property {string} remoteSha
 */

/**
 * Parse git's pre-push stdin protocol: one
 * `<local ref> <local sha> <remote ref> <remote sha>` line per ref being
 * pushed. A line that does not have all four fields is ignored rather than
 * guessed at.
 *
 * @param {string} stdin
 * @returns {RefUpdate[]}
 */
export function parseRefUpdates(stdin) {
  /** @type {RefUpdate[]} */
  const updates = [];
  for (const line of stdin.split('\n')) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length < 4) continue;
    const [localRef, localSha, remoteRef, remoteSha] = fields;
    if (
      localRef === undefined ||
      localSha === undefined ||
      remoteRef === undefined ||
      remoteSha === undefined
    ) {
      continue;
    }
    updates.push({ localRef, localSha, remoteRef, remoteSha });
  }
  return updates;
}

/**
 * @typedef {object} PushTarget
 * @property {'check' | 'mismatch'} kind
 * @property {string} localRef
 * @property {string} sha
 */

/**
 * Decide, per pushed ref, whether the conflict/line-budget checks can run
 * (`'check'`), must be refused (`'mismatch'`), or need nothing at all (a
 * delete, or a push whose remote ref is `refs/heads/main`).
 *
 * A ref is `'check'` only when its local sha equals `headSha` — the one case
 * where `git merge-tree`/the line-budget projection (which read git objects
 * directly, not the working tree) are guaranteed to agree with the
 * `pnpm typecheck` that already ran against the checked-out files. Anything
 * else is `'mismatch'`: this hook refuses rather than silently validating a
 * commit it never checked out.
 *
 * @param {RefUpdate[]} updates
 * @param {string | undefined} headSha
 * @returns {PushTarget[]}
 */
export function planPushChecks(updates, headSha) {
  /** @type {PushTarget[]} */
  const plans = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const update of updates) {
    if (NULL_SHA.test(update.localSha)) continue;
    if (update.remoteRef === MAIN_REF) continue;
    if (seen.has(update.localSha)) continue; // same commit pushed under two ref names
    seen.add(update.localSha);
    plans.push({
      kind: headSha !== undefined && update.localSha === headSha ? 'check' : 'mismatch',
      localRef: update.localRef,
      sha: update.localSha,
    });
  }
  return plans;
}

/**
 * @param {string[]} args
 * @param {string} cwd The repo being pushed — `process.cwd()` in production
 *   (husky always runs from the repo root), or a fixture directory under
 *   test. Never this script's own location.
 * @returns {string}
 */
function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: gitEnv(),
  });
}

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string | undefined}
 */
function tryGit(args, cwd) {
  try {
    return git(args, cwd).trim();
  } catch {
    return undefined;
  }
}

/**
 * @returns {string}
 */
function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/**
 * @param {object} params
 * @param {RefUpdate[]} params.updates
 * @param {string | undefined} params.headSha
 * @param {string} params.repoDir The repo being pushed, passed to the
 *   line-budget check as `--repo` so it analyses this tree's git history
 *   rather than defaulting to its own module location.
 * @param {(cmd: string, args: string[]) => { status: number | null }} params.run
 * @param {(line: string) => void} params.out
 * @param {(line: string) => void} params.err
 * @returns {number} exit code
 */
export function orchestrate({ updates, headSha, repoDir, run, out, err }) {
  const plans = planPushChecks(updates, headSha);

  const mismatches = plans.filter((p) => p.kind === 'mismatch');
  if (mismatches.length > 0) {
    for (const m of mismatches) {
      err(
        `pre-push: pushing ${m.localRef} at ${m.sha}, which is not the checked-out HEAD ` +
          `(${headSha ?? 'unknown'}).`
      );
      err(
        '          The typecheck that already ran above checked HEAD’s working tree, which ' +
          'does not match this commit — the conflict/line-budget checks cannot answer for it ' +
          'without checking out a tree this hook did not typecheck.'
      );
      err(`          Check out or detach onto ${m.sha} and push again, e.g.:`);
      err(`            git checkout ${m.sha}`);
    }
    return 1;
  }

  const toCheck = plans.filter((p) => p.kind === 'check');
  if (toCheck.length === 0) {
    out('pre-push: nothing pushed needs the conflict/line-budget checks.');
    return 0;
  }

  const fetch = run('git', ['fetch', 'origin', 'main', '--quiet']);
  if (fetch.status !== 0) {
    err('pre-push: git fetch origin main failed.');
    return 1;
  }

  for (const plan of toCheck) {
    const mergeTree = run('git', ['merge-tree', '--write-tree', 'origin/main', plan.sha]);
    if (mergeTree.status !== 0) {
      err(
        `pre-push: ${plan.localRef} (${plan.sha}) conflicts with origin/main — rebase before pushing.`
      );
      return 1;
    }

    const budget = run('node', [
      budgetCheckScript,
      '--base',
      'main',
      '--head',
      plan.sha,
      '--repo',
      repoDir,
    ]);
    if (budget.status !== 0) return budget.status ?? 1;
  }

  return 0;
}

/**
 * @param {string} cwd
 * @returns {(cmd: string, args: string[]) => { status: number | null }}
 */
function makeRealRun(cwd) {
  return (cmd, args) => {
    const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: gitEnv() });
    return { status: result.status };
  };
}

function main() {
  // The repo being pushed. Husky always invokes hooks with the repo root as
  // the working directory, so this is that root in production; a test can
  // point it elsewhere by spawning this file with a different `cwd`.
  const repoDir = process.cwd();

  const stdinText = readStdin();
  let updates = parseRefUpdates(stdinText);

  if (updates.length === 0) {
    // No ref updates on stdin means this was not invoked by git — a developer
    // running it by hand. Fall back to "the checked-out branch, pushed to
    // itself", matching scripts/pre-push-scope.mjs's own manual-run fallback.
    const head = tryGit(['rev-parse', 'HEAD'], repoDir);
    const branch = tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir);
    if (head !== undefined && branch !== undefined && branch !== 'HEAD') {
      updates = [
        {
          localRef: `refs/heads/${branch}`,
          localSha: head,
          remoteRef: `refs/heads/${branch}`,
          remoteSha: '0'.repeat(40),
        },
      ];
    }
  }

  const headSha = tryGit(['rev-parse', 'HEAD'], repoDir);
  const code = orchestrate({
    updates,
    headSha,
    repoDir,
    run: makeRealRun(repoDir),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
  process.exit(code);
}

/**
 * @returns {string}
 */
function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'pre-push-check-refs-'));
  execFileSync('git', ['init', '--initial-branch=main', '-q'], { cwd: dir, env: gitEnv() });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, env: gitEnv() });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, env: gitEnv() });
  return dir;
}

/**
 * @returns {boolean}
 */
function selfTest() {
  const checks = {};

  checks['parses a well-formed pre-push line'] =
    JSON.stringify(parseRefUpdates('refs/heads/x aaa refs/heads/x bbb')) ===
    JSON.stringify([
      { localRef: 'refs/heads/x', localSha: 'aaa', remoteRef: 'refs/heads/x', remoteSha: 'bbb' },
    ]);
  checks['ignores a short/garbage line'] = parseRefUpdates('garbage').length === 0;
  checks['ignores blank lines'] = parseRefUpdates('\n\n').length === 0;

  const headSha = 'a'.repeat(40);
  const otherSha = 'b'.repeat(40);

  checks['a matching local sha is a check'] =
    planPushChecks(
      [
        {
          localRef: 'refs/heads/x',
          localSha: headSha,
          remoteRef: 'refs/heads/x',
          remoteSha: '0'.repeat(40),
        },
      ],
      headSha
    )[0]?.kind === 'check';

  checks['a non-matching local sha is a mismatch, never silently checked or skipped'] =
    planPushChecks(
      [
        {
          localRef: 'refs/heads/x',
          localSha: otherSha,
          remoteRef: 'refs/heads/x',
          remoteSha: '0'.repeat(40),
        },
      ],
      headSha
    )[0]?.kind === 'mismatch';

  checks['a delete (all-zero local sha) needs no plan at all'] =
    planPushChecks(
      [
        {
          localRef: 'refs/heads/x',
          localSha: '0'.repeat(40),
          remoteRef: 'refs/heads/x',
          remoteSha: otherSha,
        },
      ],
      headSha
    ).length === 0;

  checks['pushing to refs/heads/main is exempt regardless of the local branch name'] =
    planPushChecks(
      [
        {
          localRef: 'refs/heads/topic',
          localSha: headSha,
          remoteRef: MAIN_REF,
          remoteSha: otherSha,
        },
      ],
      headSha
    ).length === 0;

  checks['a mismatch is exempt too when its destination is main'] =
    planPushChecks(
      [
        {
          localRef: 'refs/heads/topic',
          localSha: otherSha,
          remoteRef: MAIN_REF,
          remoteSha: '0'.repeat(40),
        },
      ],
      headSha
    ).length === 0;

  checks['the same sha pushed under two ref names is planned once'] =
    planPushChecks(
      [
        {
          localRef: 'refs/heads/a',
          localSha: headSha,
          remoteRef: 'refs/heads/a',
          remoteSha: '0'.repeat(40),
        },
        {
          localRef: 'refs/heads/b',
          localSha: headSha,
          remoteRef: 'refs/heads/b',
          remoteSha: '0'.repeat(40),
        },
      ],
      headSha
    ).length === 1;

  {
    /** @type {string[]} */
    const errLines = [];
    /** @type {{ cmd: string, args: string[] }[]} */
    const ran = [];
    const code = orchestrate({
      updates: [
        {
          localRef: 'refs/heads/x',
          localSha: otherSha,
          remoteRef: 'refs/heads/x',
          remoteSha: '0'.repeat(40),
        },
      ],
      headSha,
      repoDir: repoRoot,
      run: (cmd, args) => {
        ran.push({ cmd, args });
        return { status: 0 };
      },
      out: () => {},
      err: (line) => errLines.push(line),
    });
    checks['orchestrate() refuses (exit 1) on a mismatch'] = code === 1;
    checks['orchestrate() runs no command at all on a mismatch'] = ran.length === 0;
    checks['orchestrate() names the sha and tells the user to check it out'] = errLines.some((l) =>
      l.includes(`git checkout ${otherSha}`)
    );
  }

  {
    /** @type {{ cmd: string, args: string[] }[]} */
    const ran = [];
    const code = orchestrate({
      updates: [
        {
          localRef: 'refs/heads/x',
          localSha: headSha,
          remoteRef: 'refs/heads/x',
          remoteSha: '0'.repeat(40),
        },
      ],
      headSha,
      repoDir: repoRoot,
      run: (cmd, args) => {
        ran.push({ cmd, args });
        return { status: 0 };
      },
      out: () => {},
      err: () => {},
    });
    checks['orchestrate() succeeds when every step reports zero'] = code === 0;
    checks['orchestrate() fetches origin main first'] =
      ran[0]?.cmd === 'git' && ran[0]?.args.join(' ') === 'fetch origin main --quiet';
    checks['orchestrate() runs merge-tree against the pushed sha'] =
      ran[1]?.cmd === 'git' && ran[1]?.args.includes(headSha);
    checks['orchestrate() runs the line-budget check with --head set to the pushed sha'] =
      ran[2]?.cmd === 'node' &&
      ran[2]?.args.includes('--head') &&
      ran[2]?.args[ran[2].args.indexOf('--head') + 1] === headSha;
  }

  {
    /** @type {{ cmd: string, args: string[] }[]} */
    const ran = [];
    /** @type {string[]} */
    const errLines = [];
    const code = orchestrate({
      updates: [
        {
          localRef: 'refs/heads/x',
          localSha: headSha,
          remoteRef: 'refs/heads/x',
          remoteSha: '0'.repeat(40),
        },
      ],
      headSha,
      repoDir: repoRoot,
      run: (cmd, args) => {
        ran.push({ cmd, args });
        return { status: cmd === 'git' && args[0] === 'merge-tree' ? 1 : 0 };
      },
      out: () => {},
      err: (line) => errLines.push(line),
    });
    checks['orchestrate() fails when merge-tree conflicts'] = code === 1;
    checks['orchestrate() never runs the budget check after a conflict'] = ran.every(
      (r) => r.cmd !== 'node'
    );
    checks['orchestrate() names the conflicting ref'] = errLines.some((l) =>
      l.includes('conflicts with origin/main')
    );
  }

  const dir = tmpRepo();
  try {
    writeFileSync(join(dir, 'a.ts'), 'const a = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir, env: gitEnv() });
    execFileSync('git', ['commit', '-q', '-m', 'root'], { cwd: dir, env: gitEnv() });
    const root = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();

    execFileSync('git', ['checkout', '-q', '-b', 'topic'], { cwd: dir, env: gitEnv() });
    writeFileSync(join(dir, 'b.ts'), 'const b = 2;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir, env: gitEnv() });
    execFileSync('git', ['commit', '-q', '-m', 'topic commit'], { cwd: dir, env: gitEnv() });
    const topicSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();

    const stdin = `refs/heads/other ${root} refs/heads/other 0000000000000000000000000000000000000000\n`;
    const result = spawnSync('node', [join(repoRoot, 'scripts', 'pre-push-check-refs.mjs')], {
      cwd: dir,
      input: stdin,
      encoding: 'utf8',
      env: gitEnv(),
    });
    checks['end-to-end: a ref pushed at a sha other than HEAD is refused, not silently checked'] =
      result.status === 1 && result.stderr.includes(`git checkout ${root}`);

    const stdinMatching = `refs/heads/topic ${topicSha} refs/heads/topic 0000000000000000000000000000000000000000\n`;
    const resultMatching = spawnSync(
      'node',
      [join(repoRoot, 'scripts', 'pre-push-check-refs.mjs')],
      {
        cwd: dir,
        input: stdinMatching,
        encoding: 'utf8',
        env: gitEnv(),
      }
    );
    // `origin` does not exist in this throwaway repo, so `git fetch origin
    // main` itself fails — proving this reached the real git plumbing rather
    // than refusing, without needing a real remote.
    checks['end-to-end: a ref pushed at HEAD proceeds to the real checks (fetch is attempted)'] =
      resultMatching.status === 1 && !resultMatching.stderr.includes('git checkout');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      `self-test OK (${Object.keys(checks).length} checks) — a pushed ref whose local sha ` +
        'differs from HEAD is refused rather than silently checked against the wrong tree, ' +
        'refs/heads/main is exempted by the REMOTE ref rather than the local branch name, and a ' +
        'clean push runs fetch, merge-tree, then the line-budget check against the pushed sha.'
    );
  } else {
    console.error('SELF-TEST FAILED:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
  }
  return ok;
}

if (import.meta.main) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  } else {
    main();
  }
}
