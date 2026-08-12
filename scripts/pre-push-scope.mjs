#!/usr/bin/env node
/**
 * Does this push contain anything `mise run typecheck` could have an opinion
 * about?
 *
 * The pre-push hook's typecheck is `tsc -b tsconfig.build.json` followed by a
 * fan-out to every unit that defines the task — 24 units today, one of which
 * (`pillars/contacts`) runs `cargo check --all-targets`. Warm that is ~90
 * seconds; on a fresh worktree it is minutes. It was paid on every push
 * regardless of what the push contained, and `clients/ios` is in neither the
 * pnpm workspace nor the cargo workspace (ADR-043), so a Swift-only branch paid
 * all of it to check TypeScript the change could not reach — and could be
 * failed by a stale `node_modules` in a package it never opened.
 *
 * This decides, from the diff alone, whether that is worth running. It prints
 * two `run`/`skip` tokens on stdout, one per line — the compiled-graph verdict
 * above, then a second verdict for whether `mise run test:scripts` and
 * `mise run typecheck:scripts` are worth running (see `decideScripts` below) —
 * and explains both on stderr.
 *
 * THE ANSWER IS DELIBERATELY LOPSIDED. `run` is not a verdict, it is the
 * absence of one: anything this cannot confidently place outside the workspace
 * — an unreadable manifest, a git command that failed, a path shape it does not
 * recognise — comes back `run`. A wrong `skip` pushes a type error to the
 * remote and the whole point of the hook is gone; a wrong `run` costs ninety
 * seconds. Those are not comparable mistakes and the code should not treat them
 * as if they were.
 *
 * WHAT COUNTS AS INSIDE. Not a list of paths kept by hand — that is the thing
 * that rots the moment a directory is added. The workspace roots are read off
 * `pnpm-workspace.yaml`'s `packages:` globs and the root `Cargo.toml`'s
 * `[workspace] members`, which are the files pnpm and cargo themselves obey. A
 * path is inside if it is under one of those roots, or is a root-level file
 * (lockfile, tsconfig, package.json — any of which changes what the typecheck
 * does), or is under `scripts/`. Everything else is outside.
 *
 * Reading those two manifests by hand rather than through `js-yaml` /
 * `smol-toml` is not squeamishness about parsers: this runs in a git hook, and
 * the failure it exists to make cheap — a broken or stale `node_modules` — is
 * exactly when an import of a third-party parser would throw. A guard that
 * needs the workspace healthy cannot be the guard that tells you the workspace
 * is not. Node builtins only, for that reason.
 *
 * Usage:
 *   node scripts/pre-push-scope.mjs              read git's pre-push refs on stdin
 *   node scripts/pre-push-scope.mjs --self-test  prove the decision logic still decides
 *
 * In DECISION MODE the exit code is always 0: the verdicts are the stdout
 * tokens, not the status, so a crash (non-zero, no output) is indistinguishable
 * from `run`/`run` to the caller rather than being mistaken for `skip`.
 * `--self-test` is not decision mode and does exit non-zero when it fails — it
 * is a check, and a check that cannot fail is not one.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * `scripts/`'s root name, shared between the always-inside set below and
 * {@link decideScripts}'s own, narrower question — whether THIS push touches
 * `scripts/` at all, regardless of what else it touches.
 */
const SCRIPTS_ROOT = 'scripts';

/**
 * Roots that are always inside, whatever the manifests say.
 *
 * `scripts/` is root-owned tooling in no workspace — it has no `package.json`
 * and no `mise.toml`, so neither the pnpm globs nor the cargo members name it —
 * and its own tsconfig projects reach into `tsconfig.base.json`. Treating it as
 * outside would make this hook silent about the one tree whose type errors
 * already have a habit of reaching `main`. Note this only forces the
 * COMPILED-GRAPH verdict below to `run`; it does not by itself run
 * `mise run typecheck:scripts` / `test:scripts` — that is `decideScripts`'s job
 * (see the blind-spot note on those two tasks in mise.toml).
 */
const ALWAYS_INSIDE = [SCRIPTS_ROOT];

/** A SHA of all zeros: git's way of saying "this ref does not exist yet". */
const NULL_SHA = /^0+$/u;

/**
 * The leading path segment of a workspace glob — the shallowest directory the
 * glob can ever match inside.
 *
 * `pillars/*` and `pillars/*\/*` both reduce to `pillars`, which is coarser than
 * the glob and deliberately so: over-approximating the workspace can only cause
 * an unnecessary `run`, while under-approximating it causes a wrong `skip`. A
 * member added at `pillars/<new>` is therefore inside from the moment it exists,
 * with no change here.
 *
 * @param {string} pattern  A workspace glob or member path, e.g. `pillars/*`.
 * @returns {string | undefined} The root segment, or undefined if there is none.
 */
export function globRoot(pattern) {
  const first = pattern.replace(/^\.\//u, '').split('/')[0];
  if (first === undefined || first === '' || first === '.' || first === '..') return undefined;
  // A glob in the FIRST segment (`*/foo`) could match any top-level directory,
  // so there is no root to narrow to and the caller must treat everything as
  // inside. Signalled by returning undefined rather than a bogus root.
  if (/[*?[\]{}]/u.test(first)) return undefined;
  return first;
}

/**
 * The `packages:` globs from a `pnpm-workspace.yaml`, without a YAML parser.
 *
 * Recognises the block-sequence form pnpm's own docs use and this repo writes:
 * a `packages:` key at column zero followed by `  - 'glob'` entries. The
 * sequence ends at the first line that is neither blank, nor a comment, nor a
 * deeper-indented `-` entry.
 *
 * @param {string} source  Contents of pnpm-workspace.yaml.
 * @returns {string[]} The globs, in file order.
 */
export function pnpmWorkspaceGlobs(source) {
  /** @type {string[]} */
  const globs = [];
  let inPackages = false;
  for (const raw of source.split('\n')) {
    const line = raw.replace(/\r$/u, '');
    if (/^packages:\s*(#.*)?$/u.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (line.trim() === '' || /^\s*#/u.test(line)) continue;
    const entry = /^\s+-\s*(.+?)\s*$/u.exec(line);
    if (entry === null) break;
    const value = entry[1];
    if (value === undefined) break;
    // Strip an inline comment before the quotes come off, so a quoted `#` is
    // kept and an unquoted trailing comment is not read as part of the glob.
    const unquoted = /^(['"])(.*?)\1/u.exec(value);
    const glob = unquoted?.[2] ?? value.replace(/\s+#.*$/u, '').trim();
    if (glob !== '') globs.push(glob);
  }
  return globs;
}

/**
 * The `[workspace] members` from a root `Cargo.toml`, without a TOML parser.
 *
 * Handles the single-line and multi-line array forms. Only the `[workspace]`
 * table's own `members` counts — a `members` key under any other table is a
 * different key, and reading it would widen the workspace by accident.
 *
 * @param {string} source  Contents of the root Cargo.toml.
 * @returns {string[]} The member paths, in file order.
 */
export function cargoWorkspaceMembers(source) {
  const lines = source.split('\n').map((line) => line.replace(/\r$/u, ''));
  let table = '';
  /** @type {string[]} */
  const members = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const header = /^\s*\[([^\]]+)\]\s*(#.*)?$/u.exec(line);
    if (header !== null) {
      table = header[1]?.trim() ?? '';
      continue;
    }
    if (table !== 'workspace') continue;
    if (!/^\s*members\s*=/u.test(line)) continue;

    // Accumulate until the array closes, so the multi-line form is read whole.
    let body = line.slice(line.indexOf('=') + 1);
    while (!body.includes(']') && index + 1 < lines.length) {
      index += 1;
      body += `\n${lines[index] ?? ''}`;
    }
    for (const [, value] of body.matchAll(/["']([^"']+)["']/gu)) {
      if (value !== undefined) members.push(value);
    }
    break;
  }
  return members;
}

/**
 * @typedef {object} WorkspaceRoots
 * @property {Set<string>} roots     Top-level directories that are inside the workspace.
 * @property {boolean}     everything  True when a manifest could not be narrowed to roots,
 *                                     in which case every path must be treated as inside.
 * @property {string[]}    sources   Human-readable notes on where the roots came from.
 */

/**
 * Reduce the two manifests to the set of top-level directories that are inside
 * the workspace.
 *
 * A manifest that is missing, empty, or shaped in a way this cannot narrow sets
 * `everything`, which collapses the decision to `run`. That is the lopsidedness
 * this file's header describes, expressed as a value rather than as a comment.
 *
 * @param {string | undefined} pnpmWorkspace  Contents of pnpm-workspace.yaml, if readable.
 * @param {string | undefined} cargoToml      Contents of the root Cargo.toml, if readable.
 * @returns {WorkspaceRoots}
 */
export function workspaceRoots(pnpmWorkspace, cargoToml) {
  /** @type {Set<string>} */
  const roots = new Set(ALWAYS_INSIDE);
  /** @type {string[]} */
  const sources = [];
  let everything = false;

  if (pnpmWorkspace === undefined) {
    everything = true;
    sources.push('pnpm-workspace.yaml unreadable — treating every path as inside');
  } else {
    const globs = pnpmWorkspaceGlobs(pnpmWorkspace);
    if (globs.length === 0) {
      everything = true;
      sources.push('pnpm-workspace.yaml declared no packages — treating every path as inside');
    } else {
      for (const glob of globs) {
        const root = globRoot(glob);
        if (root === undefined) {
          everything = true;
          sources.push(`pnpm glob "${glob}" has no fixed root — treating every path as inside`);
        } else {
          roots.add(root);
        }
      }
      sources.push(`pnpm-workspace.yaml: ${globs.length} glob(s)`);
    }
  }

  // Cargo's absence is not suspicious the way pnpm's is — a repo may have no
  // Rust at all, and `cargo check` then has nothing to fan out to. Only a
  // present-but-unreadable shape widens the answer.
  if (cargoToml !== undefined) {
    const members = cargoWorkspaceMembers(cargoToml);
    for (const member of members) {
      const root = globRoot(member);
      if (root === undefined) {
        everything = true;
        sources.push(`cargo member "${member}" has no fixed root — treating every path as inside`);
      } else {
        roots.add(root);
      }
    }
    sources.push(`Cargo.toml: ${members.length} member(s)`);
  }

  return { roots, everything, sources };
}

/**
 * Is one changed path something the typecheck could reach?
 *
 * @param {string} path             Repo-relative path, forward slashes, as git reports it.
 * @param {WorkspaceRoots} scope    Roots from {@link workspaceRoots}.
 * @returns {boolean}
 */
export function isInsideWorkspace(path, scope) {
  if (scope.everything) return true;
  const normalised = path.replace(/^\.\//u, '');
  if (normalised === '') return true;
  // A root-level file is config: the lockfile, a tsconfig, package.json,
  // mise.toml. Any of them changes what the typecheck does, so none of them is
  // ever skippable.
  if (!normalised.includes('/')) return true;
  const first = normalised.split('/')[0];
  return first !== undefined && scope.roots.has(first);
}

/**
 * @typedef {object} Decision
 * @property {'run' | 'skip'} verdict
 * @property {string} reason        One line, for the developer watching the push.
 * @property {string[]} examples    Up to three changed paths that led to the verdict.
 */

/**
 * The whole decision, as a pure function of the diff and the manifests.
 *
 * @param {string[] | undefined} paths  Changed paths, or undefined if git could not be asked.
 * @param {WorkspaceRoots} scope
 * @returns {Decision}
 */
export function decide(paths, scope) {
  if (paths === undefined) {
    return {
      verdict: 'run',
      reason: 'could not read the diff, so nothing is being assumed',
      examples: [],
    };
  }
  // No changed paths at all means nothing new is being pushed (a re-push of an
  // already-remote commit, a tag, a branch delete). Running the typecheck over
  // an empty diff checks a tree the remote already accepted.
  if (paths.length === 0) {
    return { verdict: 'skip', reason: 'this push adds no commits', examples: [] };
  }
  const inside = paths.filter((path) => isInsideWorkspace(path, scope));
  if (inside.length > 0) {
    return {
      verdict: 'run',
      reason: `${inside.length} of ${paths.length} changed path(s) are inside the pnpm/cargo workspace`,
      examples: inside.slice(0, 3),
    };
  }
  return {
    verdict: 'skip',
    reason: `all ${paths.length} changed path(s) are outside the pnpm/cargo workspace`,
    examples: paths.slice(0, 3),
  };
}

/**
 * Whether this push is worth `mise run test:scripts` + `mise run
 * typecheck:scripts` — the two CI-required tasks (`quality.yml`'s
 * `scripts-tests` job) that close the blind spot documented above
 * `[tasks."typecheck:scripts"]` in mise.toml: `tsc -b tsconfig.build.json`
 * only references `libs/*` and `pillars/*`, and `run-all` never reaches
 * `scripts/` because it has no `mise.toml`, so nothing `decide` triggers
 * type-checks or runs the `scripts/**` test suite.
 *
 * Deliberately independent of {@link decide}: that decision's "inside" set
 * folds `scripts/` in via `ALWAYS_INSIDE` for a different reason (so a
 * scripts-only push still pays for the compiled-graph typecheck), and mixing
 * the two questions into one verdict would make it impossible to run the
 * scripts checks ONLY when scripts/ is actually touched.
 *
 * @param {string[] | undefined} paths  Changed paths, or undefined if git could not be asked.
 * @returns {Decision}
 */
export function decideScripts(paths) {
  if (paths === undefined) {
    return {
      verdict: 'run',
      reason: 'could not read the diff, so nothing is being assumed',
      examples: [],
    };
  }
  if (paths.length === 0) {
    return { verdict: 'skip', reason: 'this push adds no commits', examples: [] };
  }
  const touched = paths.filter(
    (path) => path === SCRIPTS_ROOT || path.startsWith(`${SCRIPTS_ROOT}/`)
  );
  if (touched.length > 0) {
    return {
      verdict: 'run',
      reason: `${touched.length} of ${paths.length} changed path(s) are under ${SCRIPTS_ROOT}/`,
      examples: touched.slice(0, 3),
    };
  }
  return {
    verdict: 'skip',
    reason: `no changed path is under ${SCRIPTS_ROOT}/`,
    examples: [],
  };
}

/**
 * Run a git command, or return undefined if it fails for any reason.
 *
 * @param {string[]} args
 * @returns {string | undefined}
 */
function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return undefined;
  }
}

/**
 * @typedef {object} RefUpdate
 * @property {string} localSha
 * @property {string} remoteSha
 */

/**
 * Parse git's pre-push stdin protocol: one
 * `<local ref> <local sha> <remote ref> <remote sha>` line per ref being pushed.
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
    const localSha = fields[1];
    const remoteSha = fields[3];
    if (localSha === undefined || remoteSha === undefined) continue;
    updates.push({ localSha, remoteSha });
  }
  return updates;
}

/**
 * The paths this push would add to the remote.
 *
 * For a branch the remote already has, that is `remote..local`. For a new
 * branch the remote has no side of, git sends an all-zero remote SHA and the
 * honest comparison is against `origin/main` — the commits this branch adds on
 * top of what the remote already accepted, not its entire history.
 *
 * @param {RefUpdate[]} updates
 * @returns {string[] | undefined} Changed paths, or undefined if git could not be asked.
 */
function changedPaths(updates) {
  /** @type {Set<string>} */
  const paths = new Set();
  for (const { localSha, remoteSha } of updates) {
    // A delete: nothing is being added, so there is nothing to type-check.
    if (NULL_SHA.test(localSha)) continue;

    let range;
    if (NULL_SHA.test(remoteSha)) {
      const base = git(['merge-base', 'origin/main', localSha])?.trim();
      // No merge base means no `origin/main` to compare against — an unknown
      // shape, which is a `run`.
      if (base === undefined || base === '') return undefined;
      range = `${base}..${localSha}`;
    } else {
      range = `${remoteSha}..${localSha}`;
    }

    const diff = git(['diff', '--name-only', range]);
    if (diff === undefined) return undefined;
    for (const path of diff.split('\n')) {
      if (path.trim() !== '') paths.add(path.trim());
    }
  }
  return [...paths].toSorted((a, b) => a.localeCompare(b));
}

/**
 * Read stdin to the end, synchronously, tolerating its absence.
 *
 * Invoked by hand rather than by git there is no stdin at all, and on some
 * platforms reading fd 0 in that state throws rather than returning empty.
 *
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
 * Read a repo-root file, or undefined if it is not there / not readable.
 *
 * @param {string} name
 * @returns {string | undefined}
 */
function readRepoFile(name) {
  const path = join(repoRoot, name);
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * @typedef {object} Decisions
 * @property {Decision} decision         The compiled-graph verdict (`decide`).
 * @property {Decision} scriptsDecision  The scripts/-suite verdict (`decideScripts`).
 */

/**
 * Decide for the real repo and the real push, and print both verdicts — one
 * per line, compiled-graph first, then scripts/.
 *
 * @returns {Decisions}
 */
function run() {
  const scope = workspaceRoots(readRepoFile('pnpm-workspace.yaml'), readRepoFile('Cargo.toml'));

  const updates = parseRefUpdates(readStdin());
  // No ref updates on stdin means this was not invoked by git. Fall back to the
  // branch's own diff against `origin/main`, which is what a developer running
  // it by hand means.
  const paths =
    updates.length > 0
      ? changedPaths(updates)
      : git(['diff', '--name-only', 'origin/main...HEAD'])
          ?.split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '');

  const decision = decide(paths, scope);
  const scriptsDecision = decideScripts(paths);
  console.log(decision.verdict);
  console.log(scriptsDecision.verdict);

  const inside = [...scope.roots].toSorted((a, b) => a.localeCompare(b)).join(', ');
  console.error(`pre-push scope: ${decision.reason}.`);
  if (decision.examples.length > 0) {
    console.error(`                e.g. ${decision.examples.join(', ')}`);
  }
  if (decision.verdict === 'skip') {
    console.error(
      `                inside = root files + ${inside} (from ${scope.sources.join('; ')})`
    );
  }
  console.error(`pre-push scripts scope: ${scriptsDecision.reason}.`);
  if (scriptsDecision.examples.length > 0) {
    console.error(`                        e.g. ${scriptsDecision.examples.join(', ')}`);
  }
  return { decision, scriptsDecision };
}

/**
 * Fixtures proving the decision still decides. The risk this guards against is
 * not that the logic is wrong today — it is that a later edit collapses it to a
 * constant `run` (harmless, invisible, and the hook is slow forever) or a
 * constant `skip` (silent, and the hook stops existing).
 *
 * @returns {boolean}
 */
function selfTest() {
  const pnpmYaml = [
    'packages:',
    "  - 'pillars/*'",
    "  - 'pillars/*/*'",
    "  - 'libs/*'",
    '',
    'engineStrict: true',
  ].join('\n');
  const cargo = [
    '[workspace]',
    'resolver = "2"',
    'members = ["pillars/contacts", "libs/pops-ai"]',
    '',
    '[workspace.package]',
    'edition = "2021"',
  ].join('\n');
  const scope = workspaceRoots(pnpmYaml, cargo);
  const widened = workspaceRoots(undefined, undefined);

  const swiftOnly = ['clients/ios/App/PopsApp.swift', 'clients/ios/mise.toml'];
  const mixed = [...swiftOnly, 'libs/ui/src/components/QrCode.tsx'];

  const checks = {
    'pnpm globs parsed': pnpmWorkspaceGlobs(pnpmYaml).length === 3,
    'a quoted glob keeps its value': pnpmWorkspaceGlobs(pnpmYaml)[0] === 'pillars/*',
    'a key after the sequence ends it':
      !pnpmWorkspaceGlobs(pnpmYaml).includes('engineStrict: true'),
    'cargo members parsed': cargoWorkspaceMembers(cargo).length === 2,
    'members outside [workspace] are ignored':
      cargoWorkspaceMembers('[other]\nmembers = ["nope"]').length === 0,
    'multi-line members array is read whole':
      cargoWorkspaceMembers('[workspace]\nmembers = [\n  "a",\n  "b",\n]').length === 2,
    'globs reduce to roots': scope.roots.has('pillars') && scope.roots.has('libs'),
    'scripts/ is always inside': scope.roots.has('scripts'),
    'clients/ is not a root': !scope.roots.has('clients'),
    'a Swift-only push skips': decide(swiftOnly, scope).verdict === 'skip',
    'one workspace path forces a run': decide(mixed, scope).verdict === 'run',
    'a root-level file forces a run': decide(['pnpm-lock.yaml'], scope).verdict === 'run',
    'a docs-only push skips': decide(['docs/architecture/adr-043.md'], scope).verdict === 'skip',
    'an unreadable diff runs': decide(undefined, scope).verdict === 'run',
    'unreadable manifests widen to everything': widened.everything,
    'a widened scope runs on a Swift-only push': decide(swiftOnly, widened).verdict === 'run',
    'a first-segment glob widens to everything': workspaceRoots("packages:\n  - '*/app'", undefined)
      .everything,
    'git ref lines parse': parseRefUpdates('refs/heads/x aaa refs/heads/x bbb').length === 1,
    'a short ref line is ignored': parseRefUpdates('garbage').length === 0,
    'a scripts/ push runs the scripts checks':
      decideScripts(['scripts/pre-push-scope.mjs']).verdict === 'run',
    'a non-scripts push skips the scripts checks': decideScripts(swiftOnly).verdict === 'skip',
    'a directory merely starting with "scripts" does not run the scripts checks':
      decideScripts(['scripts-old/x.mjs']).verdict === 'skip',
    'an unreadable diff runs the scripts checks too': decideScripts(undefined).verdict === 'run',
    'an empty push skips the scripts checks': decideScripts([]).verdict === 'skip',
    'the scripts decision is independent of the compiled-graph one':
      decide(swiftOnly, scope).verdict === 'skip' &&
      decideScripts([...swiftOnly, 'scripts/huly-partition.mjs']).verdict === 'run',
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log('self-test OK — the scope decision still distinguishes inside from outside.');
  } else {
    console.error('SELF-TEST FAILED — pre-push scoping did not behave as expected:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/pre-push-scope.mjs [--self-test]\n' +
        'Prints `run` or `skip` on stdout for the push described on stdin, and\n' +
        'exits 0 doing so — a crash must read as `run`, never as `skip`.\n' +
        '--self-test exits non-zero when the decision logic no longer decides.'
    );
    process.exit(0);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  run();
  process.exit(0);
}

if (import.meta.main) {
  main();
}
