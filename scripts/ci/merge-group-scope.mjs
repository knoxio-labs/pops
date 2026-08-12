#!/usr/bin/env node
/**
 * Does this workflow's own path filter select the merge group's diff?
 *
 * A merge-queue run cannot be path-filtered. `paths:` is accepted only on
 * `push`, `pull_request` and `pull_request_target`; under `merge_group` it is a
 * workflow syntax error, and `dorny/paths-filter` has no diff base on that
 * event. So every queue entry used to run what a push to `main` runs — a full
 * cold macOS compile in `ios-quality.yml` and sixteen image builds in
 * `docker-build.yml` — on docs-only merges included.
 *
 * This script is the missing filter, and it is ONE implementation rather than a
 * glob list hand-copied into each workflow. It reads the calling workflow's own
 * `on.pull_request.paths` off disk and answers it against
 * `git diff <base>..<head>`, so the queue lane and the pull-request lane are
 * scoped by the same declaration and cannot drift: widening a workflow's filter
 * widens its queue lane in the same edit.
 *
 * WHY EVERY FAILURE PATH EXITS NON-ZERO. The lane this gates is the one where a
 * wrong answer is invisible: "not selected" makes the expensive job skip, the
 * workflow still concludes `success`, `CI Gate` aggregates that success, and the
 * queue merges a commit nothing compiled. That is precisely the failure the
 * merge queue exists to prevent, reintroduced by its own optimisation. So this
 * script has no "assume it's fine" branch anywhere:
 *
 *   - a base it cannot resolve, or that is not an ancestor of the head, is an
 *     error — not a full run, and certainly not a skip;
 *   - an EMPTY diff is an error. A merge group always carries at least one
 *     pull request, so zero changed files is the signature of a wrong base,
 *     which is the exact input that would deselect every lane at once;
 *   - a workflow with no readable `on.pull_request.paths` is an error. There is
 *     nothing to mirror, and guessing either way is worse than saying so.
 *
 * A red gate costs one re-queue. A silent skip costs an unbuilt merge.
 *
 * The glob subset understood here — literal segments, `*` within a segment,
 * `**` spanning segments — is the same one `.github/workflows/ci-gate.yml`
 * implements inline for its `PATH_FILTERS` mirror. That copy exists because the
 * gate job has no checkout and so cannot import this file;
 * `scripts/ci/__tests__/ci-gate-path-filters.test.ts` holds the two
 * implementations to the same answers. Anything outside the subset (`?`,
 * `[...]`, a leading `!`) raises here rather than being matched literally.
 *
 * Usage:
 *   node scripts/ci/merge-group-scope.mjs \
 *     --workflow .github/workflows/ios-quality.yml \
 *     --base "$BASE_SHA" --head "$HEAD_SHA" [--head-ref "$HEAD_REF"]
 *   node scripts/ci/merge-group-scope.mjs --self-test
 *
 * Writes `selected=true|false` to `$GITHUB_OUTPUT` when that is set, and prints
 * the decision either way. Exit 0 = the question was answered. Exit 1 = it was
 * not, and the caller must not read an answer into that.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { isMapping, parseYaml, requireScalar } from './config-parse.mjs';

/** @typedef {import('./config-parse.mjs').ConfigParseError} ConfigParseError */

/**
 * The question could not be answered.
 *
 * Distinct from `ConfigParseError` only so a caller can tell "the
 * workflow is unreadable" from "the diff is unusable"; both are fatal here.
 */
export class ScopeError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ScopeError';
  }
}

/** Glob metacharacters this matcher deliberately does not model. */
const UNSUPPORTED_GLOB = /[?[\]]/u;

/**
 * @param {string} char
 * @returns {string}
 */
function escapeGlobLiteral(char) {
  return /[.*+?^${}()|[\]\\]/u.test(char) ? `\\${char}` : char;
}

/**
 * Compile one GitHub Actions `paths:` glob.
 *
 * Restricted to what this repo's workflows actually declare. A pattern using
 * anything else raises: a matcher that treats `?` as a literal question mark
 * would quietly stop selecting the files that pattern was written to select,
 * and deselecting is the direction that merges unbuilt code.
 *
 * @param {string} glob
 * @returns {RegExp}
 * @throws {ScopeError}
 */
export function globToRegExp(glob) {
  if (glob.startsWith('!')) {
    throw new ScopeError(
      `path filter "${glob}" is a negation, which this matcher does not model. ` +
        'Rewrite the filter or teach both this file and ci-gate.yml the same semantics.'
    );
  }
  if (UNSUPPORTED_GLOB.test(glob)) {
    throw new ScopeError(
      `path filter "${glob}" uses a glob feature (? or [...]) this matcher does not model. ` +
        'Rewrite the filter or teach both this file and ci-gate.yml the same semantics.'
    );
  }
  let source = '';
  let i = 0;
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) {
      source += '(?:.*/)?';
      i += 3;
    } else if (glob.startsWith('**', i) && i + 2 === glob.length) {
      source += '.*';
      i += 2;
    } else if (glob[i] === '*') {
      source += '[^/]*';
      i += 1;
    } else {
      source += escapeGlobLiteral(glob[i] ?? '');
      i += 1;
    }
  }
  return new RegExp(`^${source}$`, 'u');
}

/**
 * Does any of `files` match any of `patterns`?
 *
 * @param {readonly string[]} patterns
 * @param {readonly string[]} files
 * @returns {boolean}
 * @throws {ScopeError}
 */
export function selectsAny(patterns, files) {
  const regexes = patterns.map((pattern) => globToRegExp(pattern));
  return files.some((file) => regexes.some((regex) => regex.test(file)));
}

/**
 * Read a workflow's `on.pull_request.paths`.
 *
 * Parsed, never scanned: `on: { pull_request: { paths: [x] } }`,
 * `paths: ["**"] # note` and the block form are the same declaration, and a
 * line matcher that models one of them reports "no filter" on the others.
 * `paths-ignore` is rejected outright rather than inverted — no workflow here
 * uses it, and a half-modelled inversion is how a filter starts selecting the
 * complement of what it says.
 *
 * @param {string} source  The workflow document.
 * @param {string} label   Path used in failure messages.
 * @returns {string[]}
 * @throws {ScopeError | ConfigParseError}
 */
export function pullRequestPaths(source, label) {
  const doc = parseYaml(source, label);
  if (!isMapping(doc)) throw new ScopeError(`${label}: top level is not a mapping`);
  // YAML 1.1 would resolve `on` to a boolean; `parseYaml` pins the core schema
  // so it stays a string key. See config-parse.mjs.
  const on = doc.on;
  if (!isMapping(on)) {
    throw new ScopeError(`${label}: has no \`on:\` mapping to read a path filter from`);
  }
  const pullRequest = on.pull_request;
  if (!isMapping(pullRequest)) {
    throw new ScopeError(
      `${label}: has no \`on.pull_request:\` mapping, so there is no pull-request path ` +
        'filter for the merge-group lane to mirror.'
    );
  }
  if (pullRequest['paths-ignore'] !== undefined) {
    throw new ScopeError(
      `${label}: declares \`pull_request.paths-ignore\`, which this helper does not model.`
    );
  }
  const paths = pullRequest.paths;
  if (paths === undefined) {
    throw new ScopeError(
      `${label}: \`on.pull_request\` declares no \`paths:\` filter. The merge-group lane ` +
        'mirrors that filter, so there is nothing to scope by — either restore the filter ' +
        "or remove this workflow's scope job."
    );
  }
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new ScopeError(`${label}: \`on.pull_request.paths\` is not a non-empty sequence`);
  }
  return paths.map((value, index) =>
    requireScalar(value, label, `on.pull_request.paths[${index}]`)
  );
}

/**
 * The environment variables git uses to point itself at a repository OTHER than
 * the one in `cwd`.
 *
 * Every one of these is exported into the environment of a git hook. A
 * `.husky/pre-push` that runs this script's Vitest suite therefore hands it a
 * `GIT_INDEX_FILE`, a `GIT_DIR` and friends belonging to the repo being pushed,
 * and the self-test's throwaway fixture repos inherit them: `git init` in a
 * temp directory fails outright, or worse, succeeds against somebody else's
 * index. Found exactly that way — the suite passed standalone and failed in the
 * hook. Credential and transport variables (`GIT_ASKPASS`, `GIT_SSH_COMMAND`,
 * `GIT_TERMINAL_PROMPT`, …) are deliberately NOT in this list: the fetch
 * fallback needs them.
 */
const GIT_LOCATION_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
  'GIT_QUARANTINE_PATH',
  'GIT_NAMESPACE',
];

/**
 * `process.env` with the repository-location overrides removed, so every git
 * invocation here is about the directory it is run in and nothing else.
 *
 * @param {Record<string, string | undefined>} [extra]
 * @returns {Record<string, string | undefined>}
 */
function gitEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const name of GIT_LOCATION_VARS) delete env[name];
  return env;
}

/**
 * Run git, or raise with what it said.
 *
 * @param {readonly string[]} args
 * @param {string} cwd
 * @returns {string}
 * @throws {ScopeError}
 */
function git(args, cwd) {
  try {
    return execFileSync('git', [...args], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      env: gitEnv(),
    });
  } catch (error) {
    const stderr = (/** @type {{ stderr?: string }} */ (error).stderr ?? '').trim();
    throw new ScopeError(`git ${args.join(' ')} failed: ${stderr || String(error)}`);
  }
}

/**
 * Is this commit in the local object store?
 *
 * @param {string} sha
 * @param {string} cwd
 * @returns {boolean}
 */
function hasCommit(sha, cwd) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      cwd,
      stdio: 'ignore',
      env: gitEnv(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Make sure a commit is on disk, fetching it once if it is not.
 *
 * The fetch is a fallback for a shallow checkout, not the expected path — the
 * workflows that call this use `fetch-depth: 0`. It is attempted rather than
 * assumed to work, and a failure to produce the commit raises: diffing against
 * a commit that is not there is the empty-diff trap this whole file is about.
 *
 * @param {string} sha
 * @param {string} cwd
 * @param {string} role  `base` or `head`, for the failure message.
 * @throws {ScopeError}
 */
function requireCommit(sha, cwd, role) {
  if (hasCommit(sha, cwd)) return;
  try {
    execFileSync('git', ['fetch', '--no-tags', '--quiet', 'origin', sha], {
      cwd,
      stdio: 'pipe',
      env: gitEnv(),
    });
  } catch {
    // Reported below by the presence check, with the SHA that is missing.
  }
  if (hasCommit(sha, cwd)) return;
  throw new ScopeError(
    `${role} commit ${sha} is not in this checkout and could not be fetched. ` +
      'Without it there is no diff to scope by.'
  );
}

/**
 * The files a merge group would introduce.
 *
 * @param {object} args
 * @param {string} args.base
 * @param {string} args.head
 * @param {string} args.cwd
 * @returns {string[]}
 * @throws {ScopeError}
 */
export function changedFiles({ base, head, cwd }) {
  requireCommit(base, cwd, 'base');
  requireCommit(head, cwd, 'head');
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', base, head], {
      cwd,
      stdio: 'ignore',
      env: gitEnv(),
    });
  } catch {
    throw new ScopeError(
      `base ${base} is not an ancestor of head ${head}. A merge-queue head is built directly ` +
        'on its base, so this is a wrong base rather than a small diff, and the file list it ' +
        'would produce is arbitrary.'
    );
  }
  const files = git(['diff', '--name-only', `${base}..${head}`], cwd)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (files.length === 0) {
    throw new ScopeError(
      `\`git diff ${base}..${head}\` is empty. A merge group carries at least one pull ` +
        'request, so an empty diff means the base is wrong — and a wrong base deselects ' +
        'every lane at once, which is the one answer this must never give quietly.'
    );
  }
  return files;
}

/** A merge-queue ref: `gh-readonly-queue/<target>/pr-<number>-<base sha>`. */
const QUEUE_REF = /^(?:refs\/heads\/)?gh-readonly-queue\/.+\/pr-\d+-([0-9a-f]{40})$/u;

/**
 * Resolve the base commit, and say where it came from.
 *
 * `github.event.merge_group.base_sha` is the documented field and the one the
 * workflows pass. The ref-name fallback is not redundancy for its own sake: an
 * expression naming a payload field that does not exist evaluates to the empty
 * string rather than failing, so a renamed field would arrive here as "no
 * base". The queue ref carries the same SHA in its name, which makes that
 * survivable and — because the provenance is printed — visible.
 *
 * @param {object} args
 * @param {string} [args.base]
 * @param {string} [args.headRef]
 * @returns {{ sha: string, provenance: string }}
 * @throws {ScopeError}
 */
export function resolveBase({ base, headRef }) {
  const explicit = (base ?? '').trim();
  if (explicit.length > 0) return { sha: explicit, provenance: '--base (merge_group.base_sha)' };
  const fromRef = QUEUE_REF.exec((headRef ?? '').trim());
  if (fromRef?.[1] !== undefined) {
    return { sha: fromRef[1], provenance: `--head-ref (${(headRef ?? '').trim()})` };
  }
  throw new ScopeError(
    'no base commit: --base was empty and --head-ref is not a gh-readonly-queue ref ' +
      `(got ${JSON.stringify(headRef ?? '')}). Check that the caller still passes ` +
      'github.event.merge_group.base_sha.'
  );
}

/**
 * @typedef {object} ScopeDecision
 * @property {boolean} selected     Must the expensive lane run?
 * @property {string[]} patterns    The workflow's own `pull_request.paths`.
 * @property {string[]} files       The merge group's changed files.
 * @property {string} baseSha
 * @property {string} baseProvenance
 */

/**
 * Answer one workflow's filter against one merge group's diff.
 *
 * @param {object} args
 * @param {string} args.workflowPath  Path to the workflow, relative to `cwd` or absolute.
 * @param {string} [args.base]
 * @param {string} args.head
 * @param {string} [args.headRef]
 * @param {string} args.cwd
 * @returns {ScopeDecision}
 * @throws {ScopeError | ConfigParseError}
 */
export function scopeLane({ workflowPath, base, head, headRef, cwd }) {
  const absolute = workflowPath.startsWith('/') ? workflowPath : join(cwd, workflowPath);
  let source;
  try {
    source = readFileSync(absolute, 'utf8');
  } catch (error) {
    throw new ScopeError(
      `cannot read ${workflowPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const patterns = pullRequestPaths(source, workflowPath);
  const resolved = resolveBase({ base, headRef });
  const headSha = (head ?? '').trim();
  if (headSha.length === 0) {
    throw new ScopeError('no head commit: --head was empty.');
  }
  const files = changedFiles({ base: resolved.sha, head: headSha, cwd });
  return {
    selected: selectsAny(patterns, files),
    patterns,
    files,
    baseSha: resolved.sha,
    baseProvenance: resolved.provenance,
  };
}

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
    // Identity is supplied rather than read from the machine's git config, so
    // the fixtures commit on a runner that has none. The location vars are
    // stripped by `gitEnv` — see the comment on `GIT_LOCATION_VARS`.
    env: gitEnv({
      GIT_AUTHOR_NAME: 'scope',
      GIT_AUTHOR_EMAIL: 'scope@example.invalid',
      GIT_COMMITTER_NAME: 'scope',
      GIT_COMMITTER_EMAIL: 'scope@example.invalid',
    }),
  });
}

/**
 * Write a file, creating its parents.
 *
 * @param {string} dir
 * @param {string} relative
 * @param {string} content
 */
function writeIn(dir, relative, content) {
  const target = join(dir, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/**
 * A throwaway repo with a workflow and two commits.
 *
 * @param {object} args
 * @param {string} args.workflow  The workflow document to write.
 * @param {readonly string[]} args.touched  Files the second commit changes.
 * @returns {{ dir: string, base: string, head: string }}
 */
function fixtureRepo({ workflow, touched }) {
  const dir = mkdtempSync(join(tmpdir(), 'merge-group-scope-'));
  gitIn(dir, ['init', '--quiet', '-b', 'main']);
  writeIn(dir, '.github/workflows/subject.yml', workflow);
  writeIn(dir, 'seed.txt', 'seed\n');
  gitIn(dir, ['add', '-A']);
  gitIn(dir, ['commit', '--quiet', '-m', 'base']);
  const base = gitIn(dir, ['rev-parse', 'HEAD']).trim();
  for (const [index, file] of touched.entries()) {
    writeIn(dir, file, `change ${String(index)}\n`);
  }
  if (touched.length > 0) {
    gitIn(dir, ['add', '-A']);
    gitIn(dir, ['commit', '--quiet', '-m', 'head']);
  }
  const head = gitIn(dir, ['rev-parse', 'HEAD']).trim();
  return { dir, base, head };
}

const IOS_SHAPED_WORKFLOW = `name: Subject
on:
  pull_request:
    paths:
      - "clients/ios/**"
      - "pillars/bfm/openapi/**"
      - ".github/workflows/subject.yml"
  merge_group:
jobs:
  quality:
    runs-on: macos-latest
    steps:
      - run: echo expensive
`;

/**
 * @typedef {object} SelfTestCase
 * @property {string} name
 * @property {() => void} run  Throws on failure.
 */

/**
 * @param {boolean} condition
 * @param {string} message
 * @throws {Error}
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * @param {() => unknown} body
 * @param {RegExp} expected
 * @throws {Error}
 */
function assertRaises(body, expected) {
  let raised;
  try {
    body();
  } catch (error) {
    raised = error;
  }
  assert(raised !== undefined, `expected a failure matching ${String(expected)}, got none`);
  const message = raised instanceof Error ? raised.message : String(raised);
  assert(
    expected.test(message),
    `expected a failure matching ${String(expected)}, got: ${message}`
  );
}

/**
 * Prove the helper both selects and DESELECTS, and that every input it cannot
 * read is a failure rather than a quiet "not relevant".
 *
 * The positive case alone would pass for a helper that answered `true` to
 * everything (the tax, unchanged) and the negative case alone would pass for
 * one that answered `false` to everything (an unbuilt merge). Neither is
 * evidence without the other, and neither is evidence at all without the
 * degenerate cases below them — a helper is only trustworthy here if it refuses
 * to answer when it cannot see.
 *
 * @returns {boolean}
 */
export function selfTest() {
  /** @type {SelfTestCase[]} */
  const cases = [];
  /** @type {string[]} */
  const scratch = [];

  /**
   * @param {object} args
   * @param {string} [args.workflow]
   * @param {readonly string[]} args.touched
   */
  const repo = ({ workflow = IOS_SHAPED_WORKFLOW, touched }) => {
    const made = fixtureRepo({ workflow, touched });
    scratch.push(made.dir);
    return made;
  };

  cases.push({
    name: 'selects the lane for a diff that touches the filter',
    run: () => {
      const { dir, base, head } = repo({ touched: ['clients/ios/Packages/Auth/Sources/A.swift'] });
      const decision = scopeLane({
        workflowPath: '.github/workflows/subject.yml',
        base,
        head,
        cwd: dir,
      });
      assert(decision.selected, 'a Swift change must select the iOS lane');
      assert(
        decision.files.length === 1,
        `expected one changed file, got ${String(decision.files.length)}`
      );
      assert(
        decision.baseProvenance.startsWith('--base'),
        `expected the explicit base, got ${decision.baseProvenance}`
      );
    },
  });

  cases.push({
    name: 'answers the same inside a git hook’s environment',
    run: () => {
      // The regression that put `GIT_LOCATION_VARS` in this file. A hook
      // exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE, and every git call
      // here inherited them: the suite passed standalone and failed under
      // `.husky/pre-push`, which is the worst possible place to learn it. The
      // values below are deliberately unusable, so anything that stopped
      // stripping them fails rather than quietly using the ambient repo.
      const saved = { ...process.env };
      process.env.GIT_DIR = join(tmpdir(), 'merge-group-scope-not-a-repo', '.git');
      process.env.GIT_WORK_TREE = join(tmpdir(), 'merge-group-scope-not-a-repo');
      process.env.GIT_INDEX_FILE = join(tmpdir(), 'merge-group-scope-not-an-index');
      try {
        const { dir, base, head } = repo({ touched: ['clients/ios/App/Main.swift'] });
        const decision = scopeLane({
          workflowPath: '.github/workflows/subject.yml',
          base,
          head,
          cwd: dir,
        });
        assert(decision.selected, 'an ambient GIT_DIR must not change the answer');
      } finally {
        for (const name of GIT_LOCATION_VARS) delete process.env[name];
        Object.assign(process.env, saved);
      }
    },
  });

  cases.push({
    name: 'deselects the lane for a diff that touches none of it',
    run: () => {
      const { dir, base, head } = repo({ touched: ['docs/architecture/adr-999.md', 'README.md'] });
      const decision = scopeLane({
        workflowPath: '.github/workflows/subject.yml',
        base,
        head,
        cwd: dir,
      });
      assert(!decision.selected, 'a docs-only change must not select the iOS lane');
      assert(decision.files.length === 2, 'both changed files should be seen');
    },
  });

  cases.push({
    name: 'selects when only one file of many hits the filter',
    run: () => {
      const { dir, base, head } = repo({
        touched: ['README.md', 'pillars/bfm/openapi/bfm.json', 'libs/ui/src/index.ts'],
      });
      const decision = scopeLane({
        workflowPath: '.github/workflows/subject.yml',
        base,
        head,
        cwd: dir,
      });
      assert(
        decision.selected,
        'a contract change must select the lane even beside unrelated files'
      );
    },
  });

  cases.push({
    name: 'reads the filter through a parser, not a line matcher',
    run: () => {
      const inline =
        'name: S\n"on": {pull_request: {paths: ["clients/ios/**"]}, merge_group: null}\njobs: {q: {runs-on: x, steps: [{run: echo}]}}\n';
      const { dir, base, head } = repo({
        workflow: inline,
        touched: ['clients/ios/App/Main.swift'],
      });
      const decision = scopeLane({
        workflowPath: '.github/workflows/subject.yml',
        base,
        head,
        cwd: dir,
      });
      assert(
        decision.selected,
        'a flow-mapping `paths:` is the same declaration as the block form'
      );
    },
  });

  cases.push({
    name: 'falls back to the queue ref name when the base field is empty',
    run: () => {
      const { dir, base, head } = repo({ touched: ['clients/ios/App/Main.swift'] });
      const decision = scopeLane({
        workflowPath: '.github/workflows/subject.yml',
        base: '',
        head,
        headRef: `refs/heads/gh-readonly-queue/main/pr-4242-${base}`,
        cwd: dir,
      });
      assert(decision.selected, 'the ref-name fallback must still reach the right answer');
      assert(
        decision.baseProvenance.startsWith('--head-ref'),
        `expected the fallback provenance, got ${decision.baseProvenance}`
      );
    },
  });

  cases.push({
    name: 'refuses an empty diff instead of deselecting every lane',
    run: () => {
      const { dir, base, head } = repo({ touched: [] });
      assert(base === head, 'the fixture should have produced no second commit');
      assertRaises(
        () => scopeLane({ workflowPath: '.github/workflows/subject.yml', base, head, cwd: dir }),
        /is empty/u
      );
    },
  });

  cases.push({
    name: 'refuses a base that is not an ancestor of the head',
    run: () => {
      const { dir, head } = repo({ touched: ['clients/ios/App/Main.swift'] });
      gitIn(dir, ['checkout', '--quiet', '--orphan', 'unrelated']);
      writeIn(dir, 'other.txt', 'other\n');
      gitIn(dir, ['add', '-A']);
      gitIn(dir, ['commit', '--quiet', '-m', 'unrelated root']);
      const unrelated = gitIn(dir, ['rev-parse', 'HEAD']).trim();
      assertRaises(
        () =>
          scopeLane({
            workflowPath: '.github/workflows/subject.yml',
            base: unrelated,
            head,
            cwd: dir,
          }),
        /not an ancestor/u
      );
    },
  });

  cases.push({
    name: 'refuses a base commit that does not exist',
    run: () => {
      const { dir, head } = repo({ touched: ['clients/ios/App/Main.swift'] });
      assertRaises(
        () =>
          scopeLane({
            workflowPath: '.github/workflows/subject.yml',
            base: '0123456789012345678901234567890123456789',
            head,
            cwd: dir,
          }),
        /is not in this checkout/u
      );
    },
  });

  cases.push({
    name: 'refuses when no base can be resolved at all',
    run: () => {
      const { dir, head } = repo({ touched: ['clients/ios/App/Main.swift'] });
      assertRaises(
        () =>
          scopeLane({
            workflowPath: '.github/workflows/subject.yml',
            base: '',
            head,
            headRef: 'refs/heads/main',
            cwd: dir,
          }),
        /no base commit/u
      );
    },
  });

  cases.push({
    name: 'refuses a workflow file that is not there',
    run: () => {
      const { dir, base, head } = repo({ touched: ['clients/ios/App/Main.swift'] });
      assertRaises(
        () => scopeLane({ workflowPath: '.github/workflows/gone.yml', base, head, cwd: dir }),
        /cannot read/u
      );
    },
  });

  cases.push({
    name: 'refuses a workflow that does not parse',
    run: () => {
      const { dir, base, head } = repo({
        workflow: 'name: S\non:\n  pull_request:\n    paths: [unclosed\n',
        touched: ['clients/ios/App/Main.swift'],
      });
      assertRaises(
        () => scopeLane({ workflowPath: '.github/workflows/subject.yml', base, head, cwd: dir }),
        /could not be parsed/u
      );
    },
  });

  cases.push({
    name: 'refuses a workflow whose pull_request trigger declares no paths',
    run: () => {
      const { dir, base, head } = repo({
        workflow:
          'name: S\non:\n  pull_request:\n    types: [opened]\n  merge_group:\njobs:\n  q:\n    runs-on: x\n    steps:\n      - run: echo\n',
        touched: ['clients/ios/App/Main.swift'],
      });
      assertRaises(
        () => scopeLane({ workflowPath: '.github/workflows/subject.yml', base, head, cwd: dir }),
        /declares no `paths:` filter/u
      );
    },
  });

  cases.push({
    name: 'refuses a workflow with no pull_request trigger',
    run: () => {
      const { dir, base, head } = repo({
        workflow:
          'name: S\non:\n  merge_group:\njobs:\n  q:\n    runs-on: x\n    steps:\n      - run: echo\n',
        touched: ['clients/ios/App/Main.swift'],
      });
      assertRaises(
        () => scopeLane({ workflowPath: '.github/workflows/subject.yml', base, head, cwd: dir }),
        /no `on\.pull_request:` mapping/u
      );
    },
  });

  cases.push({
    name: 'refuses paths-ignore rather than inverting half of it',
    run: () => {
      const { dir, base, head } = repo({
        workflow:
          'name: S\non:\n  pull_request:\n    paths-ignore:\n      - "docs/**"\njobs:\n  q:\n    runs-on: x\n    steps:\n      - run: echo\n',
        touched: ['clients/ios/App/Main.swift'],
      });
      assertRaises(
        () => scopeLane({ workflowPath: '.github/workflows/subject.yml', base, head, cwd: dir }),
        /paths-ignore/u
      );
    },
  });

  cases.push({
    name: 'refuses a paths entry that is not a single value',
    run: () => {
      const { dir, base, head } = repo({
        workflow:
          'name: S\non:\n  pull_request:\n    paths:\n      - clients/ios/**\n      - {nested: mapping}\njobs:\n  q:\n    runs-on: x\n    steps:\n      - run: echo\n',
        touched: ['clients/ios/App/Main.swift'],
      });
      assertRaises(
        () => scopeLane({ workflowPath: '.github/workflows/subject.yml', base, head, cwd: dir }),
        /not a single value/u
      );
    },
  });

  cases.push({
    name: 'refuses a glob shape it cannot model',
    run: () => {
      assertRaises(() => globToRegExp('clients/ios/*.??'), /does not model/u);
      assertRaises(() => globToRegExp('!clients/ios/**'), /negation/u);
    },
  });

  cases.push({
    name: 'matches the glob subset the way GitHub does',
    run: () => {
      /** @type {ReadonlyArray<readonly [string, string, boolean]>} */
      const corpus = [
        ['clients/ios/**', 'clients/ios/App/Main.swift', true],
        ['clients/ios/**', 'clients/iosx/App.swift', false],
        ['**/Dockerfile', 'Dockerfile', true],
        ['**/Dockerfile', 'pillars/finance/Dockerfile', true],
        ['**/Dockerfile', 'pillars/finance/Dockerfile.dev', false],
        ['pillars/*/app/**', 'pillars/finance/app/src/main.tsx', true],
        ['pillars/*/app/**', 'pillars/finance/src/main.tsx', false],
        ['infra/docker-compose*.yml', 'infra/docker-compose.dev.yml', true],
        ['pnpm-lock.yaml', 'pnpm-lock.yaml', true],
        ['pnpm-lock.yaml', 'pillars/finance/pnpm-lock.yaml', false],
      ];
      for (const [pattern, file, expected] of corpus) {
        const actual = globToRegExp(pattern).test(file);
        assert(actual === expected, `"${pattern}" vs "${file}": expected ${String(expected)}`);
      }
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
    `self-test OK — ${String(cases.length)} cases: selects a touching diff, deselects a ` +
      'non-touching one, and refuses every unreadable input rather than answering "skip".'
  );
  return true;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const workflowPath = flag(argv, 'workflow');
  if (workflowPath === undefined) {
    console.error('::error::merge-group-scope: --workflow <path> is required');
    process.exit(1);
  }

  /** @type {ScopeDecision} */
  let decision;
  try {
    decision = scopeLane({
      workflowPath,
      base: flag(argv, 'base'),
      head: flag(argv, 'head') ?? '',
      headRef: flag(argv, 'head-ref'),
      cwd: process.cwd(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::merge-group-scope could not scope ${workflowPath}: ${message}`);
    console.error(
      'Refusing to answer. This gate never reports "not relevant" on an error, because a ' +
        'wrong "skip" merges a commit nothing built.'
    );
    process.exit(1);
  }

  console.log(`workflow:   ${workflowPath}`);
  console.log(`base:       ${decision.baseSha} (via ${decision.baseProvenance})`);
  console.log(`filter:     ${decision.patterns.join(', ')}`);
  console.log(`changed:    ${String(decision.files.length)} file(s)`);
  for (const file of decision.files.slice(0, 50)) console.log(`  ${file}`);
  if (decision.files.length > 50) {
    console.log(`  … and ${String(decision.files.length - 50)} more`);
  }

  const output = process.env.GITHUB_OUTPUT;
  if (output !== undefined && output.length > 0) {
    appendFileSync(output, `selected=${String(decision.selected)}\n`);
  }

  console.log(
    decision.selected
      ? `::notice::${workflowPath} is SELECTED — this merge group touches its path filter.`
      : `::notice::${workflowPath} is NOT selected — this merge group touches none of its path filter.`
  );
  process.exit(0);
}

if (import.meta.main) {
  main();
}
