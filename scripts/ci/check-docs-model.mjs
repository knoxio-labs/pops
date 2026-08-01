#!/usr/bin/env node
/**
 * Documentation-model guard (ADR-041).
 *
 * Enforces exactly two things, and deliberately nothing else:
 *
 *   1. Every top-level unit — `pillars/<id>` and `libs/<lib>` — has a
 *      `README.md`. These are published units whose README is the entry
 *      point a reader lands on, so one is always warranted.
 *
 *   2. The abolished doc trees do not come back. `prds/`, `themes/`,
 *      `epics/`, and `ideas/` directories anywhere in the repo are a
 *      violation: requirements-as-documents and status-as-documents were
 *      replaced by colocated READMEs plus Huly, and the failure mode this
 *      guards against is them reappearing one directory at a time.
 *
 * This is NOT a coverage quota. Per ADR-041 a README is warranted only where
 * the code cannot speak for itself, and a directory without one is a correct
 * outcome. Deliberately no check requires a README for a module, a page
 * directory, or any nested path — a gate that demanded one would produce
 * exactly the write-to-satisfy-the-gate documentation the model rejects.
 *
 * Usage:
 *   node scripts/ci/check-docs-model.mjs
 *   node scripts/ci/check-docs-model.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = a violation. Exit 2 = usage error.
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Directory names that encode the abolished documentation model. */
export const BANNED_DOC_DIRS = ['prds', 'themes', 'epics', 'ideas'];

/** Directories never walked when scanning for banned trees. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'coverage', '.next']);

/**
 * Discover the repo's top-level units: every immediate child of `pillars/`
 * and `libs/`. A unit is a directory — `moltbot` ships no package.json and
 * still counts, because a reader still lands on it.
 *
 * @param {string} root
 * @returns {string[]} Sorted repo-relative unit dirs.
 */
export function discoverUnits(root) {
  /** @type {string[]} */
  const out = [];
  for (const base of ['pillars', 'libs']) {
    const baseDir = join(root, base);
    if (!existsSync(baseDir)) continue;
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      out.push(relative(root, join(baseDir, entry.name)));
    }
  }
  return out.toSorted((a, b) => a.localeCompare(b));
}

/**
 * Walk the tree looking for directories whose name is in `BANNED_DOC_DIRS`.
 * Returns repo-relative paths. Does not descend into a banned directory once
 * found — one report per tree, not one per file inside it.
 *
 * @param {string} root
 * @param {string[]} [banned]
 * @returns {string[]} Sorted repo-relative banned dirs.
 */
export function findBannedDocDirs(root, banned = BANNED_DOC_DIRS) {
  /** @type {string[]} */
  const found = [];

  /** @param {string} dir */
  function walk(dir) {
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (banned.includes(entry.name)) {
        found.push(relative(root, full));
        continue;
      }
      walk(full);
    }
  }

  walk(root);
  return found.toSorted((a, b) => a.localeCompare(b));
}

/**
 * @typedef {{ missingReadme: string[], bannedDirs: string[] }} DocsModelReport
 */

/**
 * @param {string} root
 * @returns {DocsModelReport}
 */
export function checkDocsModel(root) {
  const missingReadme = discoverUnits(root).filter(
    (unit) => !existsSync(join(root, unit, 'README.md'))
  );
  return { missingReadme, bannedDirs: findBannedDocDirs(root) };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-docs-model.mjs [--self-test]\n' +
        'Fails if a pillar/lib lacks a README.md, or an abolished doc tree ' +
        '(prds/, themes/, epics/, ideas/) has reappeared. See ADR-041.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { missingReadme, bannedDirs } = checkDocsModel(repoRoot);

  if (missingReadme.length === 0 && bannedDirs.length === 0) {
    console.log('OK — every pillar and lib has a README, and no abolished doc tree exists.');
    process.exit(0);
  }

  for (const unit of missingReadme) {
    console.error(
      `FAIL — ${unit} has no README.md. A published unit's README is the entry ` +
        'point a reader lands on; write one describing what it is and what depends on it.'
    );
  }
  for (const dir of bannedDirs) {
    console.error(
      `FAIL — ${dir} recreates an abolished doc tree. Requirements and status do not ` +
        'live in this repo (ADR-041): put how-it-works in a colocated README, decisions ' +
        'in an ADR, and undone work in Huly (project POPS).'
    );
  }
  process.exit(1);
}

/** @returns {boolean} */
function selfTest() {
  const units = discoverUnits(repoRoot);
  const ok1 = units.includes('libs/ui') && units.includes('pillars/finance');

  const banned = findBannedDocDirs(repoRoot, ['__tests__']);
  const ok2 = banned.length > 0 && banned.every((d) => d.endsWith('__tests__'));

  // A banned dir is reported once, not once per nested copy beneath it.
  const ok3 = new Set(banned).size === banned.length;

  if (!ok1) console.error('self-test FAILED: unit discovery missed a known unit');
  if (!ok2) console.error('self-test FAILED: banned-dir walk found nothing to match');
  if (!ok3) console.error('self-test FAILED: banned-dir walk reported duplicates');
  return ok1 && ok2 && ok3;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
