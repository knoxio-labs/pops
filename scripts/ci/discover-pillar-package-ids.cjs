'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Every pillar's own contract-package id — the `<pillar>` in `@pops/<pillar>`
 * — read straight off `pillars/<x>/package.json`. Used by `.dependency-cruiser.cjs`
 * (ISO-R1) to build the alternation a lib is forbidden from importing, so a
 * new or renamed pillar package cannot silently fall outside that rule's
 * reach the way `bfm`, `purchases` and `design` once did under a
 * hand-maintained list.
 *
 * A pillar directory with no `package.json` (e.g. a Rust-only pillar), or
 * whose `name` is not `@pops/<dirname>`, is not a consumable npm package by
 * that convention and is skipped — a TS/JS lib cannot import what does not
 * resolve as one.
 *
 * @param {string} repoRoot Absolute path to the repo root.
 * @returns {string[]} Pillar ids, sorted.
 */
function discoverPillarPackageIds(repoRoot) {
  const pillarsRoot = path.join(repoRoot, 'pillars');
  if (!fs.existsSync(pillarsRoot)) return [];
  const ids = [];
  for (const entry of fs.readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = path.join(pillarsRoot, entry.name, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const match = typeof pkg.name === 'string' && pkg.name.match(/^@pops\/([a-z0-9-]+)$/);
    if (match && match[1] === entry.name) ids.push(match[1]);
  }
  return ids.toSorted();
}

module.exports = { discoverPillarPackageIds };
