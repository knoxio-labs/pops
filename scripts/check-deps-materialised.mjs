#!/usr/bin/env node
/**
 * Refuse to run a gate whose toolchain is not installed yet.
 *
 * A fresh `git worktree` has the source but not `node_modules`. Run `mise
 * lint` there and `oxlint --type-aware` reports a tsconfig error pointing at
 * `libs/ui`, plus scattered warnings — which reads exactly like workspace-wide
 * TypeScript lint debt sitting on `main`. It is not: `mise lint` exits 0 on
 * `main` in a properly installed checkout.
 *
 * That false negative is worse than a plain failure because it is
 * self-confirming. The correct-looking response to "pre-existing debt" is to
 * ignore it, which means a real regression the branch introduced is ignored
 * with it. It has cost real time twice: once landing POPS-2159/POPS-2162
 * (#4197), where `git stash` was used to "confirm" the failure was pre-existing
 * — stashing source changes says nothing about a missing `node_modules` — and
 * once on 2026-09-06, when a reconciliation pass filed POPS-3018 reporting 21
 * failing tests on `main` that a properly installed worktree runs green.
 *
 * `pnpm format:check` has the same root cause and the same shape: `oxfmt` is
 * not in `node_modules/.bin` yet.
 *
 * So: check before the gate runs, and say the real thing. Partial
 * materialisation is the case that matters — a workspace package whose own
 * `node_modules` is missing is what produces the misleading tsconfig error,
 * and the root `node_modules` being present is not evidence that the packages
 * under it are.
 *
 * Stdlib only and no dependency of its own, necessarily: it runs precisely
 * when dependencies may not be there.
 *
 * Exit 0 = installed. Exit 1 = not installed, with the fix named.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Workspace package directories, read from `pnpm-workspace.yaml` rather than
 * hardcoded, so a new pillar or lib is covered the day it lands.
 *
 * Deliberately a tiny glob reader rather than a YAML parser: the file is
 * committed, the `packages:` list is a flat sequence of quoted globs, and
 * importing `js-yaml` here would be a dependency in the one script that cannot
 * assume dependencies exist.
 *
 * @param {string} root
 * @returns {string[]} absolute directory paths that contain a package.json
 */
function workspacePackageDirs(root) {
  const raw = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  /** @type {string[]} */
  const globs = [];
  let inPackages = false;
  for (const line of raw.split('\n')) {
    if (/^packages:\s*$/u.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const entry = /^\s+-\s*['"]?([^'"#]+?)['"]?\s*$/u.exec(line);
      if (entry?.[1] === undefined) break;
      globs.push(entry[1]);
    }
  }

  /** @type {Set<string>} */
  const dirs = new Set();
  for (const glob of globs) {
    for (const dir of expand(root, glob)) {
      if (existsSync(join(dir, 'package.json'))) dirs.add(dir);
    }
  }
  return [...dirs].sort();
}

/**
 * Expand a `a/*` or `a/*​/*` glob against the tree. Only `*` as a whole path
 * segment is supported, which is all `pnpm-workspace.yaml` uses here; anything
 * else would silently expand to nothing, so it throws instead.
 *
 * @param {string} root
 * @param {string} glob
 * @returns {string[]} absolute directory paths
 */
function expand(root, glob) {
  let dirs = [root];
  for (const segment of glob.split('/')) {
    if (segment === '') continue;
    if (segment.includes('*') && segment !== '*') {
      throw new Error(`unsupported workspace glob segment '${segment}' in '${glob}'`);
    }
    dirs =
      segment === '*'
        ? dirs.flatMap((dir) =>
            readdirSync(dir, { withFileTypes: true })
              .filter((e) => e.isDirectory() && e.name !== 'node_modules')
              .map((e) => join(dir, e.name))
          )
        : dirs.map((dir) => join(dir, segment)).filter((dir) => existsSync(dir));
  }
  return dirs;
}

/**
 * Does this package declare anything to install?
 *
 * A package with no dependencies legitimately has no `node_modules`, so
 * requiring one would fail a correctly installed workspace.
 *
 * @param {string} dir
 * @returns {boolean}
 */
function hasDependencies(dir) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch {
    return false;
  }
  return ['dependencies', 'devDependencies', 'peerDependencies'].some(
    (field) => Object.keys(manifest?.[field] ?? {}).length > 0
  );
}

/**
 * Every workspace package that declares dependencies but has no
 * `node_modules`, plus the root when the root itself is not installed.
 *
 * `root` is a parameter so this is testable against a fixture tree. A guard
 * that can only be run against the repository it guards is a guard whose
 * failing path nobody has ever seen (ADR-045), and the failing path is the
 * entire point here — the passing path is what already happens today.
 *
 * @param {string} [root]
 * @returns {string[]} repo-relative paths, root as `.`
 */
export function unmaterialisedPackages(root = REPO_ROOT) {
  /** @type {string[]} */
  const missing = [];
  if (!existsSync(join(root, 'node_modules', '.modules.yaml'))) missing.push('.');
  for (const dir of workspacePackageDirs(root)) {
    if (!hasDependencies(dir)) continue;
    if (existsSync(join(dir, 'node_modules'))) continue;
    missing.push(relative(root, dir));
  }
  return missing;
}

function main() {
  const missing = unmaterialisedPackages();
  if (missing.length === 0) return;

  console.error('Dependencies are not installed in this checkout.');
  console.error('');
  console.error(`  ${missing.length} workspace package(s) have no node_modules:`);
  for (const path of missing.slice(0, 8)) console.error(`    ${path}`);
  if (missing.length > 8) console.error(`    … and ${missing.length - 8} more`);
  console.error('');
  console.error('  Run `pnpm install` first.');
  console.error('');
  console.error('  Running a lint, format or type gate before this passes produces');
  console.error('  errors that look like pre-existing repo debt — an oxlint tsconfig');
  console.error('  error in libs/ui is the usual one — and are not. See POPS-2400.');
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
