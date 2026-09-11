#!/usr/bin/env node
/**
 * No commit in a pull request, and no pull request body, may credit an AI
 * assistant or carry a fixture identity.
 *
 * The standing rule is that no assistant reference reaches a git remote — not
 * in a commit message, a trailer, a co-author line or a PR body. It has been
 * broken three times with the rule in force, each time because an agent
 * session received a harness reminder to append a co-author trailer and a
 * "Generated with" footer, and complied. Instruction alone has not held; this
 * is the mechanical half.
 *
 * Why every commit and not only the head: the repository squash-merges with
 * `squash_merge_commit_message=COMMIT_MESSAGES`, so every commit message on a
 * branch — fixups nobody reads in the PR view included — is copied verbatim
 * into the squash commit on `main`. A trailer on the third of four commits
 * lands exactly as surely as one on the last.
 *
 * Why a fixture identity: a test that ran `git config user.email` against the
 * shared `.git/config` once left two commits authored `@example.invalid`
 * (POPS-3278), which squash would have added to `main` as a co-author too.
 *
 * ## What it reads
 *
 * - every commit in `<base>..HEAD`: the whole message, and the author and
 *   committer email;
 * - the pull request body, from `PR_BODY`, when the workflow provides one.
 *
 * On a merge group the range is the queued squash commit itself, so a
 * violation that reached the queue is caught again there, with its trailers
 * already copied into one message.
 *
 * ## Why the names below are spelled indirectly
 *
 * The rule this enforces also covers source files. A guard against a name has
 * to know the name, so it is assembled from character codes rather than
 * written out: the tree stays clean under a plain search for it, and this file
 * is not itself an instance of what it rejects.
 *
 * ## What it does not decide
 *
 * History already on `main` is out of scope — rewriting it needs a force-push
 * to the default branch, which has been declined. This only stops new ones.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitEnv } from './resolve-report-base.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** @param {number[]} codes */
const spell = (codes) => String.fromCharCode(...codes);

const ASSISTANT = spell([99, 108, 97, 117, 100, 101]);
const VENDOR = spell([97, 110, 116, 104, 114, 111, 112, 105, 99]);

/**
 * One line of a message or body that credits an assistant: the assistant or
 * vendor named as a word, or a "Generated with" line. Word-bounded, so a word
 * that merely contains the same letters is not a match.
 */
const ATTRIBUTION = new RegExp(`\\b(?:${ASSISTANT}|${VENDOR})\\b|\\bgenerated with\\b`, 'iu');

/** An identity a test fixture wrote into a real repository's config. */
const FIXTURE_EMAIL = /@example\.invalid$/iu;

/**
 * @typedef {object} CommitRecord
 * @property {string} sha
 * @property {string} authorEmail
 * @property {string} committerEmail
 * @property {string} message
 */

/** The lines of `text` that credit an assistant, trimmed. */
export function attributionLines(/** @type {string} */ text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && ATTRIBUTION.test(line));
}

/**
 * Every reason one commit may not land, each naming what was found.
 *
 * @param {CommitRecord} commit
 * @returns {string[]}
 */
export function commitViolations(commit) {
  const short = commit.sha.slice(0, 9);
  /** @type {string[]} */
  const found = attributionLines(commit.message).map(
    (line) => `${short}: message credits an assistant — "${line}"`
  );
  if (FIXTURE_EMAIL.test(commit.authorEmail)) {
    found.push(`${short}: authored by a fixture identity <${commit.authorEmail}>`);
  }
  if (FIXTURE_EMAIL.test(commit.committerEmail) && commit.committerEmail !== commit.authorEmail) {
    found.push(`${short}: committed by a fixture identity <${commit.committerEmail}>`);
  }
  return found;
}

const FIELD = '';
const RECORD = '';

/**
 * The commits in `<base>..<head>`, oldest first.
 *
 * Throws when git cannot answer — an unknown base, a shallow clone missing
 * the range — rather than returning none: an empty list is this guard's pass
 * value, so an unreadable range must never look like one.
 *
 * @param {{ base: string; head?: string; cwd?: string }} options
 * @returns {CommitRecord[]}
 */
export function commitsInRange({ base, head = 'HEAD', cwd = repoRoot }) {
  const raw = execFileSync(
    'git',
    [
      'log',
      '--reverse',
      `--format=%H${FIELD}%ae${FIELD}%ce${FIELD}%B${RECORD}`,
      `${base}..${head}`,
    ],
    // stderr is captured, not inherited: a failing range carries git's message
    // in the thrown error, instead of printing `fatal:` into a log whose check
    // may still be about to pass.
    {
      cwd,
      encoding: 'utf8',
      env: gitEnv(),
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  return raw
    .split(RECORD)
    .map((chunk) => chunk.replace(/^\n+/u, ''))
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => {
      const [sha = '', authorEmail = '', committerEmail = '', message = ''] = chunk.split(FIELD);
      return { sha, authorEmail, committerEmail, message };
    });
}

/**
 * Every violation in a range and a PR body.
 *
 * @param {{ commits: CommitRecord[]; prBody?: string }} input
 * @returns {string[]}
 */
export function findViolations({ commits, prBody = '' }) {
  return [
    ...commits.flatMap(commitViolations),
    ...attributionLines(prBody).map((line) => `PR body credits an assistant — "${line}"`),
  ];
}

/**
 * A throwaway repository with one clean base commit, for the self-test.
 *
 * Identity is passed per command through the environment, never written with
 * `git config`: writing it is how a fixture identity once leaked into a real
 * repository's shared config (POPS-3278).
 */
function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'commit-attribution-'));
  const identity = {
    GIT_AUTHOR_NAME: 'Someone',
    GIT_AUTHOR_EMAIL: 'someone@knoxio.dev',
    GIT_COMMITTER_NAME: 'Someone',
    GIT_COMMITTER_EMAIL: 'someone@knoxio.dev',
  };
  /**
   * @param {string[]} args
   * @param {Record<string, string>} [extra]
   */
  const git = (args, extra = {}) =>
    execFileSync('git', args, { cwd: dir, env: gitEnv({ ...identity, ...extra }), stdio: 'pipe' });
  git(['init', '-q', '-b', 'main']);
  let n = 0;
  /**
   * @param {string} message
   * @param {Record<string, string>} [extra]
   */
  const commit = (message, extra = {}) => {
    n += 1;
    writeFileSync(join(dir, `f${n}.txt`), `${n}\n`);
    git(['add', '-A']);
    const file = join(dir, `.msg-${n}`);
    writeFileSync(file, message);
    git(['commit', '-q', '-F', file], extra);
    rmSync(file);
  };
  commit('chore: base');
  git(['branch', 'base-point']);
  return {
    dir,
    commit,
    range: () => commitsInRange({ base: 'base-point', cwd: dir }),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Prove the guard reports, one mutation at a time, against real commits. */
function selfTest() {
  const trailer = `Co-Authored-By: ${ASSISTANT[0]?.toUpperCase()}${ASSISTANT.slice(1)} Model <noreply@${VENDOR}.com>`;
  const footer = `Generated with an ${ASSISTANT} tool`;

  /** @type {[name: string, build: (repo: ReturnType<typeof fixtureRepo>) => void, prBody: string, expected: number][]} */
  const cases = [
    ['a clean range passes', (r) => r.commit('fix: one\n\nPlain body.'), '', 0],
    ['a trailer on the head commit is caught', (r) => r.commit(`fix: one\n\n${trailer}`), '', 1],
    [
      'a trailer on a fixup that is not the head is caught — squash copies it too',
      (r) => {
        r.commit('fix: one');
        r.commit(`fixup! fix: one\n\n${trailer}`);
        r.commit('fix: two');
      },
      '',
      1,
    ],
    ['a footer line in a message is caught', (r) => r.commit(`fix: one\n\n${footer}`), '', 1],
    [
      'the vendor address alone is caught',
      (r) => r.commit(`fix: one\n\nsee noreply@${VENDOR}.com`),
      '',
      1,
    ],
    [
      'a match is case-insensitive',
      (r) => r.commit(`fix: one\n\n${ASSISTANT.toUpperCase()} WROTE THIS`),
      '',
      1,
    ],
    [
      'a word that only contains the letters is not a match',
      (r) => r.commit(`fix: one\n\nthe ${ASSISTANT}tte widget`),
      '',
      0,
    ],
    [
      'a fixture author is caught',
      (r) =>
        r.commit('fix: one', {
          GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        }),
      '',
      1,
    ],
    [
      'a fixture committer is caught',
      (r) =>
        r.commit('fix: one', {
          GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
        }),
      '',
      1,
    ],
    ['a footer in the PR body is caught', (r) => r.commit('fix: one'), `Body.\n\n${footer}`, 1],
    ['a clean PR body passes', (r) => r.commit('fix: one'), 'Body.\n\nCloses POPS-1.', 0],
  ];

  let ok = true;
  for (const [name, build, prBody, expected] of cases) {
    const repo = fixtureRepo();
    try {
      build(repo);
      const actual = findViolations({ commits: repo.range(), prBody }).length;
      if (actual !== expected) {
        ok = false;
        console.error(`  self-test FAIL — ${name}: expected ${expected}, got ${actual}`);
      }
    } finally {
      repo.cleanup();
    }
  }

  const unreadable = fixtureRepo();
  try {
    commitsInRange({ base: 'no-such-ref', cwd: unreadable.dir });
    ok = false;
    console.error('  self-test FAIL — an unreadable range returned instead of throwing');
  } catch {
    // The throw is the behaviour under test: an empty list is the pass value.
  } finally {
    unreadable.cleanup();
  }

  console.log(
    ok
      ? `OK — ${cases.length + 1} self-test mutations behave as stated.`
      : 'FAIL — the guard does not report what its header claims.'
  );
  return ok;
}

/** @param {string[]} argv */
function parseBase(argv) {
  const i = argv.indexOf('--base');
  const next = i >= 0 ? argv[i + 1] : undefined;
  return next !== undefined && next !== '' ? next : undefined;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-commit-attribution.mjs --base <ref> [--self-test]\n' +
        'Fails when a commit in <ref>..HEAD, or PR_BODY, credits an AI assistant, or a commit ' +
        'carries a fixture identity.'
    );
    process.exit(2);
  }
  if (argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);

  const base = parseBase(argv);
  if (base === undefined) {
    console.error('FAIL — no --base given; there is no range to check.');
    process.exit(2);
  }

  const commits = commitsInRange({ base });
  const violations = findViolations({ commits, prBody: process.env.PR_BODY ?? '' });
  console.log(`Checked ${commits.length} commit(s) in ${base}..HEAD and the PR body.`);
  if (violations.length === 0) {
    console.log('OK — nothing in this change credits an AI assistant or a fixture identity.');
    process.exit(0);
  }
  console.error(
    'FAIL — this change would put an assistant credit or a fixture identity on main. The ' +
      'repository squash-merges with every commit message copied into the squash commit, so ' +
      'this includes fixup commits:'
  );
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    'Reword the commits (git rebase -i, then push) and edit the PR body. No assistant reference ' +
      'may reach the remote — not a trailer, a co-author line, a footer, or a body line.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
