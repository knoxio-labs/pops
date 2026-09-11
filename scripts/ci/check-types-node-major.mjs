#!/usr/bin/env node
/**
 * `@types/node` major-pin guard — POPS-2092, alongside POPS-1926's
 * `check-node-pin.mjs` next door (which pins the Node *runtime*; this pins the
 * type declarations for it).
 *
 * POPS-1926 pinned every workspace package's `@types/node` to the major the
 * fleet actually runs — `^24.13.3` today, both in `pnpm-workspace.yaml`'s
 * `overrides` and in the root `package.json`'s own `devDependencies`. Nothing
 * enforced that a package added AFTERWARDS keeps it. `libs/contract-openapi`
 * (POPS-2057, PR #4088) was authored before that pin merged and declared
 * `"@types/node": "^25.9.3"`; it passed every check that existed at the time
 * and only surfaced when a later merge from `main` collided the lockfile
 * against a re-pinned manifest. Fixed by hand — see POPS-2092.
 *
 * WHAT THIS CHECKS
 *
 *   Every workspace package discovered off `pnpm-workspace.yaml`'s
 *   `packages:` globs, read for a `@types/node` entry under `dependencies`,
 *   `devDependencies` or `peerDependencies`. Its major is compared against
 *   the single canonical major: the root `package.json`'s own
 *   `devDependencies["@types/node"]`. A package that declares no
 *   `@types/node` at all is not a violation — there is nothing to compare. A
 *   package whose range's major disagrees, or whose range this guard cannot
 *   read a major out of, is.
 *
 * WHAT THIS DOES NOT SEE
 *
 *   - The lockfile's resolved version, or what a fresh `pnpm install` actually
 *     puts on disk. This reads manifest text only.
 *   - The transitive `@types/node: "*"` that a dozen DefinitelyTyped packages
 *     depend on and that never goes through a workspace `package.json` at
 *     all. That is `pnpm-workspace.yaml`'s own `overrides` entry's job (see
 *     the comment beside it there), not this guard's — this guard only reads
 *     what a workspace package itself declares.
 *   - Anything outside `pnpm-workspace.yaml`'s globs: `scripts/`,
 *     `clients/ios`, the repo root itself. Those are not pnpm workspace
 *     packages and carry no `@types/node` pin this guard's job is to police.
 *   - A workspace glob this guard's tiny reader cannot expand — only a single
 *     bare `*` per path segment is supported, matching what
 *     `pnpm-workspace.yaml` actually uses. See `expandWorkspaceGlob`, which
 *     throws on anything else rather than silently matching nothing.
 *
 * Deliberately no YAML parser: `pnpm-workspace.yaml`'s `packages:` list is a
 * flat, committed sequence of quoted globs, and this guard's job is meant to
 * be Tier A (install-free — see ADR-045). `scripts/pre-push-scope.mjs` and
 * `scripts/check-deps-materialised.mjs` give the same reasoning for their own
 * hand-rolled readers; each is kept local rather than shared because each
 * runs in a context that cannot assume the others' dependencies, or each
 * other, are on disk.
 *
 * Usage:
 *   node scripts/ci/check-types-node-major.mjs
 *   node scripts/ci/check-types-node-major.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = a violation. Exit 2 = usage error.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** The manifest sections a package might pin `@types/node` under. */
const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

/**
 * The `packages:` globs from a `pnpm-workspace.yaml`, without a YAML parser.
 *
 * Recognises the block-sequence form pnpm's own docs use and this repo
 * writes: a `packages:` key at column zero followed by `  - 'glob'` entries.
 * The sequence ends at the first line that is neither blank, nor a comment,
 * nor a deeper-indented `-` entry.
 *
 * @param {string} source Contents of pnpm-workspace.yaml.
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
    const unquoted = /^(['"])(.*?)\1/u.exec(value);
    const glob = unquoted?.[2] ?? value.replace(/\s+#.*$/u, '').trim();
    if (glob !== '') globs.push(glob);
  }
  return globs;
}

/**
 * Expand one `pnpm-workspace.yaml` glob against a tree. Only a bare `*` as a
 * whole path segment is supported, which is all this repo's workspace globs
 * ever use — anything else (`libs/foo-*`, `**`) throws rather than silently
 * expanding to nothing, so a glob shape this reader cannot handle is a loud
 * failure, not a quiet under-count.
 *
 * @param {string} root
 * @param {string} glob
 * @returns {string[]} absolute directory paths
 */
export function expandWorkspaceGlob(root, glob) {
  let dirs = [root];
  for (const segment of glob.split('/')) {
    if (segment === '') continue;
    if (segment.includes('*') && segment !== '*') {
      throw new Error(`unsupported workspace glob segment '${segment}' in '${glob}'`);
    }
    dirs =
      segment === '*'
        ? dirs.flatMap((dir) =>
            existsSync(dir)
              ? readdirSync(dir, { withFileTypes: true })
                  .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
                  .map((entry) => join(dir, entry.name))
              : []
          )
        : dirs.map((dir) => join(dir, segment)).filter((dir) => existsSync(dir));
  }
  return dirs;
}

/**
 * Every workspace package directory (one holding a `package.json`) reachable
 * from `pnpm-workspace.yaml`'s globs — a new package under an existing glob
 * is covered the moment it lands, with nothing to update by hand.
 *
 * @param {string} root
 * @returns {string[]} absolute directory paths, sorted
 */
export function workspacePackageDirs(root) {
  const raw = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const globs = pnpmWorkspaceGlobs(raw);
  /** @type {Set<string>} */
  const dirs = new Set();
  for (const glob of globs) {
    for (const dir of expandWorkspaceGlob(root, glob)) {
      if (existsSync(join(dir, 'package.json'))) dirs.add(dir);
    }
  }
  return [...dirs].toSorted((a, b) => a.localeCompare(b));
}

/**
 * Reduce a `@types/node` range expression to its major version, as a string.
 *
 * Handles a bare major, an exact version, `^`/`~` ranges, an `x`-range
 * (`24.x`), and the two-sided form (`>=24 <25`) exactly when the upper bound
 * is the lower bound's major plus one — the only shape that unambiguously
 * names a single major rather than spanning several.
 *
 * A one-sided comparator (`>=24`, `>24.1`) is deliberately NOT resolved to a
 * major: it names a floor with no ceiling, so 25.x and every later major
 * satisfy it too, and reading it as "major 24" would silently agree with a
 * range that also allows drift.
 *
 * Returns `null` for anything else (`*`, `latest`, a one-sided comparator, a
 * two-sided range spanning more than one major, a workspace protocol).
 * Callers must report that as a violation, not a silent pass: a range this
 * guard cannot read agrees with nothing by default.
 *
 * @param {string} range
 * @returns {string | null}
 */
export function typesNodeMajor(range) {
  const trimmed = range.trim();

  const twoSided = /^>=\s*(\d+)(?:\.\d+){0,2}\s+<\s*(\d+)(?:\.\d+){0,2}$/u.exec(trimmed);
  if (twoSided) {
    const lower = twoSided[1];
    const upper = twoSided[2];
    if (lower === undefined || upper === undefined) return null;
    return Number(upper) === Number(lower) + 1 ? lower : null;
  }

  const caretTildeOrXRange = /^[\^~]?(\d+)(?:\.(?:\d+|x)){0,2}$/iu.exec(trimmed);
  return caretTildeOrXRange?.[1] ?? null;
}

/**
 * @typedef {object} TypesNodeReport
 * @property {string[]} violations
 * @property {string[]} packages Repo-relative `package.json` paths scanned.
 * @property {string | null} canon The canonical major, or `null` if unreadable.
 */

/**
 * Scan every workspace package's `@types/node` declarations against the
 * canonical major and report every disagreement.
 *
 * @param {string} root
 * @returns {TypesNodeReport}
 */
export function checkTypesNodeMajor(root) {
  /** @type {string[]} */
  const violations = [];

  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const canonRange = manifest.devDependencies?.['@types/node'];
  const canon = typeof canonRange === 'string' ? typesNodeMajor(canonRange) : null;
  if (canon === null) {
    violations.push(
      canonRange === undefined
        ? 'root package.json declares no devDependencies["@types/node"] — there is no ' +
            'canonical major to enforce against.'
        : `root package.json devDependencies["@types/node"] = "${canonRange}" has no ` +
            'readable major — there is no canonical major to enforce against.'
    );
  }

  const dirs = workspacePackageDirs(root);
  if (dirs.length === 0) {
    violations.push(
      "Discovered zero workspace packages off pnpm-workspace.yaml's `packages:` globs. " +
        'A healthy tree has dozens — this means the collector stopped finding them, not ' +
        'that the workspace emptied out, and every check below it is running over nothing.'
    );
  }

  /** @type {string[]} */
  const packages = [];
  for (const dir of dirs) {
    const pkgPath = join(dir, 'package.json');
    const label = relative(root, pkgPath);
    /** @type {Record<string, Record<string, string>>} */
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch (error) {
      violations.push(
        `${label} could not be parsed: ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }
    packages.push(label);

    for (const field of FIELDS) {
      const range = pkg[field]?.['@types/node'];
      if (range === undefined) continue;
      const major = typesNodeMajor(range);
      if (major === null) {
        violations.push(`${label} ${field}["@types/node"] = "${range}" has no readable major.`);
      } else if (canon !== null && major !== canon) {
        violations.push(
          `${label} ${field}["@types/node"] = "${range}" pins major ${major}, but the ` +
            `canonical major is ${canon} (root package.json devDependencies["@types/node"] ` +
            `= "${canonRange}").`
        );
      }
    }
  }

  return { violations, packages, canon };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-types-node-major.mjs [--self-test]\n' +
        "Fails if any workspace package's @types/node range names a major other than the " +
        "root package.json's, or a range this guard cannot read a major out of."
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { violations, packages, canon } = checkTypesNodeMajor(repoRoot);
  if (violations.length === 0) {
    console.log(
      `OK — all ${packages.length} workspace packages agree with @types/node major ${canon} ` +
        '(or declare none).'
    );
    process.exit(0);
  }
  for (const violation of violations) console.error(`FAIL — ${violation}`);
  process.exit(1);
}

/**
 * Write a minimal, otherwise-coherent fixture workspace so a self-test case's
 * only violation is the one it plants.
 *
 * @param {string} dir
 * @param {{ canonRange?: string, globs?: string[] }} [options]
 */
function writeCoherentFixture(dir, options = {}) {
  const canonRange = options.canonRange ?? '^24.13.3';
  const globs = options.globs ?? ['libs/*'];
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ devDependencies: { '@types/node': canonRange } }),
    'utf8'
  );
  writeFileSync(
    join(dir, 'pnpm-workspace.yaml'),
    `packages:\n${globs.map((glob) => `  - '${glob}'`).join('\n')}\n`,
    'utf8'
  );
}

/**
 * @param {string} dir
 * @param {string} pkgDir Repo-relative, e.g. 'libs/foo'.
 * @param {Record<string, Record<string, string>>} fields
 */
function writePackage(dir, pkgDir, fields) {
  const full = join(dir, pkgDir);
  mkdirSync(full, { recursive: true });
  writeFileSync(join(full, 'package.json'), JSON.stringify({ name: pkgDir, ...fields }), 'utf8');
}

/** @returns {boolean} */
function selfTest() {
  const checks = [
    // Plain range parsing.
    typesNodeMajor('24') === '24',
    typesNodeMajor('24.13.3') === '24',
    typesNodeMajor('^24.13.3') === '24',
    typesNodeMajor('~24') === '24',
    typesNodeMajor('24.x') === '24',
    typesNodeMajor('>=24 <25') === '24',
    // Exotic-but-ambiguous or unreadable ranges must be rejected loudly, not
    // silently agree with the canonical major.
    typesNodeMajor('*') === null,
    typesNodeMajor('latest') === null,
    typesNodeMajor('>=24 <26') === null,
    typesNodeMajor('>=24.1') === null,
    differentMajorIsReported(),
    missingTypesNodePasses(),
    matchingRangePasses(),
    exoticRangeIsReadCorrectly(),
    unparseableRangeIsRejectedLoudly(),
    newPackageDirectoryIsDiscovered(),
    zeroPackagesIsAFailure(),
    peerDependenciesAreCheckedToo(),
  ];
  const ok = checks.every(Boolean);
  if (!ok) console.error(`self-test FAILED: ${JSON.stringify(checks)}`);
  else console.log('self-test OK — the guard reports a drifted major, and reports nothing else.');
  return ok;
}

/** @returns {boolean} */
function differentMajorIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'types-node-different-major-'));
  try {
    writeCoherentFixture(dir);
    writePackage(dir, 'libs/foo', { devDependencies: { '@types/node': '^22.0.0' } });
    const { violations } = checkTypesNodeMajor(dir);
    return violations.some(
      (v) => v.includes('libs/foo') && v.includes('major 22') && v.includes('is 24')
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function missingTypesNodePasses() {
  const dir = mkdtempSync(join(tmpdir(), 'types-node-missing-'));
  try {
    writeCoherentFixture(dir);
    writePackage(dir, 'libs/bar', {});
    const { violations, packages } = checkTypesNodeMajor(dir);
    return packages.includes('libs/bar/package.json') && violations.length === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function matchingRangePasses() {
  const dir = mkdtempSync(join(tmpdir(), 'types-node-matching-'));
  try {
    writeCoherentFixture(dir);
    writePackage(dir, 'libs/baz', { devDependencies: { '@types/node': '^24.5.0' } });
    const { violations } = checkTypesNodeMajor(dir);
    return violations.length === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function exoticRangeIsReadCorrectly() {
  const dir = mkdtempSync(join(tmpdir(), 'types-node-exotic-'));
  try {
    writeCoherentFixture(dir);
    writePackage(dir, 'libs/tilde', { devDependencies: { '@types/node': '~24' } });
    writePackage(dir, 'libs/xrange', { devDependencies: { '@types/node': '24.x' } });
    writePackage(dir, 'libs/twosided', { peerDependencies: { '@types/node': '>=24 <25' } });
    const { violations } = checkTypesNodeMajor(dir);
    return violations.length === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function unparseableRangeIsRejectedLoudly() {
  const dir = mkdtempSync(join(tmpdir(), 'types-node-unparseable-'));
  try {
    writeCoherentFixture(dir);
    writePackage(dir, 'libs/wild', { devDependencies: { '@types/node': '*' } });
    const { violations } = checkTypesNodeMajor(dir);
    return violations.some((v) => v.includes('libs/wild') && v.includes('no readable major'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function newPackageDirectoryIsDiscovered() {
  const dir = mkdtempSync(join(tmpdir(), 'types-node-new-package-'));
  try {
    writeCoherentFixture(dir);
    writePackage(dir, 'libs/existing', { devDependencies: { '@types/node': '^24.0.0' } });
    // A directory added AFTER the fixture's initial write, matching the same
    // 'libs/*' glob — the shape of a brand-new package landing on a branch.
    writePackage(dir, 'libs/brand-new', { devDependencies: { '@types/node': '^24.0.0' } });
    const { packages } = checkTypesNodeMajor(dir);
    return packages.includes('libs/brand-new/package.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function zeroPackagesIsAFailure() {
  const dir = mkdtempSync(join(tmpdir(), 'types-node-vacuity-'));
  try {
    // A glob that matches nothing: 'libs/*' with no libs/ directory at all.
    writeCoherentFixture(dir);
    const { violations, packages } = checkTypesNodeMajor(dir);
    return packages.length === 0 && violations.some((v) => v.includes('Discovered zero'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function peerDependenciesAreCheckedToo() {
  const dir = mkdtempSync(join(tmpdir(), 'types-node-peer-'));
  try {
    writeCoherentFixture(dir);
    writePackage(dir, 'libs/peer', { peerDependencies: { '@types/node': '^22.4.0' } });
    const { violations } = checkTypesNodeMajor(dir);
    return violations.some((v) => v.includes('libs/peer') && v.includes('peerDependencies'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main();
}
