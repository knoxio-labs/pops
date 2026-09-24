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

/**
 * `discoverPillarPackageIds`, but fails loudly on an empty result instead of
 * handing the caller a list that silently turns ISO-R1's alternation into
 * `^@pops/()(/|$)` — a pattern that matches nothing, so the rule would stop
 * catching any lib→pillar import without anything going red. A repo with a
 * `pillars/` tree finding zero ids is discovery drift, not a valid empty
 * state, and the failure should point at the discovery, not the depcruise
 * run it silently neutered.
 *
 * @param {string} repoRoot Absolute path to the repo root.
 * @returns {string[]} Pillar ids, sorted, guaranteed non-empty.
 */
function discoverPillarPackageIdsOrThrow(repoRoot) {
  const ids = discoverPillarPackageIds(repoRoot);
  if (ids.length === 0) {
    throw new Error(
      `discoverPillarPackageIds() found no pillar packages under ${path.join(repoRoot, 'pillars')} — ` +
        'ISO-R1 (lib-no-pillar-import) would silently stop matching any pillar. ' +
        'Check that pillars/*/package.json still exists and names its package `@pops/<dirname>`.'
    );
  }
  return ids;
}

module.exports = { discoverPillarPackageIds, discoverPillarPackageIdsOrThrow };
