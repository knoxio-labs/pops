/**
 * Which `@pops/*` packages a unit can only type-check against once they are
 * built.
 *
 * Shared by the two halves of POPS-3080: `scripts/require-built-graph.mjs`
 * asks it at typecheck time so the refusal names the right packages, and
 * `scripts/ci/check-cold-graph-typecheck.mjs` asks it in CI so a unit cannot
 * acquire such a dependency without saying so. One module rather than two
 * implementations, because a guard that models the question differently from
 * the thing it guards will eventually disagree with it, and the disagreement
 * will read as a false alarm.
 *
 * Discovery is disk-derived — every directory under `libs/` and `pillars/`
 * with a `package.json` — so a new unit is covered the moment it appears.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The repository root, from this file's own location. */
export const repoRoot = resolve(here, '..', '..');

/**
 * The workspace a directory belongs to: the nearest ancestor holding
 * `pnpm-workspace.yaml`.
 *
 * Derived rather than assumed, so the helper answers for the checkout it is
 * actually run in — a linked worktree, or a planted fixture tree in a test —
 * instead of for wherever this file happens to live.
 */
export function workspaceRootFor(/** @type {string} */ dir) {
  let current = resolve(dir);
  for (;;) {
    try {
      statSync(join(current, 'pnpm-workspace.yaml'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return repoRoot;
      current = parent;
    }
  }
}

/** The roots a workspace unit lives under. */
const UNIT_ROOTS = ['libs', 'pillars'];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'target', '.git']);

const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;

/**
 * @typedef {object} Unit
 * @property {string} dir Absolute path to the unit.
 * @property {string} name The package name.
 * @property {Record<string, unknown>} pkg The parsed `package.json`.
 */

/** Parse a `package.json`, or `null` when it is absent or unreadable. */
function readPackage(/** @type {string} */ dir) {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? /** @type {Record<string, unknown>} */ (parsed)
      : null;
  } catch {
    return null;
  }
}

/**
 * Every workspace unit under `libs/` and `pillars/`, by package name.
 *
 * @param {string} [root] The repository root; defaults to this file's own.
 * @returns {Map<string, Unit>}
 */
export function readUnits(root = repoRoot) {
  /** @type {Map<string, Unit>} */
  const units = new Map();
  const walk = (/** @type {string} */ dir, /** @type {number} */ depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      const pkg = readPackage(full);
      if (pkg !== null && typeof pkg.name === 'string') {
        units.set(pkg.name, { dir: full, name: pkg.name, pkg });
      }
      walk(full, depth + 1);
    }
  };
  for (const name of UNIT_ROOTS) {
    const dir = join(root, name);
    try {
      if (statSync(dir).isDirectory()) walk(dir, 0);
    } catch {
      continue;
    }
  }
  return units;
}

/**
 * The `types` entry a package publishes for one subpath, or `undefined` when
 * it publishes none.
 *
 * @param {Record<string, unknown>} pkg
 * @param {string} subpath `''` for the bare specifier.
 */
export function typesEntryFor(pkg, subpath) {
  const exports = pkg.exports;
  if (typeof exports !== 'object' || exports === null) {
    return typeof pkg.types === 'string' ? pkg.types : undefined;
  }
  const key = subpath === '' ? '.' : `./${subpath}`;
  const entry = /** @type {Record<string, unknown>} */ (exports)[key];
  if (typeof entry === 'string') return entry;
  if (typeof entry !== 'object' || entry === null) return undefined;
  const types = /** @type {Record<string, unknown>} */ (entry).types;
  return typeof types === 'string' ? types : undefined;
}

/** Whether a published `types` path is emitted output rather than source. */
export function resolvesIntoDist(/** @type {string} */ typesPath) {
  return /(?:^|\/)dist\//u.test(typesPath.replace(/^\.\//u, ''));
}

/** Every source file belonging to a unit, excluding nested units. */
function unitSourceFiles(/** @type {string} */ unitDir, /** @type {Map<string, Unit>} */ units) {
  const nested = new Set(
    [...units.values()].map((unit) => unit.dir).filter((dir) => dir !== unitDir)
  );
  /** @type {string[]} */
  const found = [];
  const walk = (/** @type {string} */ dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!nested.has(full)) walk(full);
      } else if (entry.isFile() && SOURCE_FILE.test(entry.name)) found.push(full);
    }
  };
  walk(unitDir);
  return found;
}

const POPS_SPECIFIER = /(?:from|import)\s*\(?\s*['"](@pops\/[^'"]+)['"]/gu;

/**
 * The `@pops/*` packages this unit imports whose types are emitted into
 * `dist/`.
 *
 * Read off the unit's own source rather than its `dependencies`, because a
 * declared dependency whose types are published from `src/` costs nothing and
 * an undeclared one still breaks the typecheck. The import is what `tsc`
 * resolves, so the import is what decides.
 *
 * @param {string} unitDir
 * @param {Map<string, Unit>} units
 * @returns {string[]} Package names, sorted, deduplicated.
 */
export function coldGraphDependencies(unitDir, units) {
  const self = [...units.values()].find((unit) => unit.dir === unitDir);
  /** @type {Set<string>} */
  const cold = new Set();
  for (const file of unitSourceFiles(unitDir, units)) {
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const match of source.matchAll(POPS_SPECIFIER)) {
      const specifier = match[1] ?? '';
      const segments = specifier.split('/');
      const name = segments.slice(0, 2).join('/');
      if (name === self?.name) continue;
      const dependency = units.get(name);
      if (dependency === undefined) continue;
      const types = typesEntryFor(dependency.pkg, segments.slice(2).join('/'));
      if (types !== undefined && resolvesIntoDist(types)) cold.add(name);
    }
  }
  return [...cold].toSorted();
}

/**
 * Those of `names` whose published types are not on disk yet.
 *
 * Resolved through the unit's own `node_modules`, which is where `tsc` looks:
 * pnpm links each workspace dependency there, so a missing link and an unbuilt
 * package fail the same way and are reported the same way.
 *
 * @param {string} unitDir
 * @param {string[]} names
 * @param {Map<string, Unit>} units
 * @returns {{ name: string; types: string }[]}
 */
export function missingTypeEntries(unitDir, names, units) {
  /** @type {{ name: string; types: string }[]} */
  const missing = [];
  for (const name of names) {
    const dependency = units.get(name);
    if (dependency === undefined) continue;
    const types = typesEntryFor(dependency.pkg, '');
    if (types === undefined || !resolvesIntoDist(types)) continue;
    const onDisk = join(dependency.dir, types.replace(/^\.\//u, ''));
    try {
      statSync(onDisk);
    } catch {
      missing.push({ name, types });
    }
  }
  return missing;
}

/** The unit path as this repo writes it in messages. */
export function unitLabel(/** @type {string} */ unitDir, /** @type {string} */ root = repoRoot) {
  return relative(root, unitDir);
}
