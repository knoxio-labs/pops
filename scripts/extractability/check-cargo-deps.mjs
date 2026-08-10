#!/usr/bin/env node
/**
 * Federation isolation guard for the cargo workspace — the Rust mirror of
 * `scripts/ci/check-lib-no-pillar-import.mjs`.
 *
 * Rust is structurally stronger than TS — a crate only sees another crate's
 * `pub` surface, there is no path-import escape hatch — but cargo will happily
 * let a lib crate take a `[dependencies]` edge on a pillar crate, inverting the
 * dependency and blocking extraction. cargo itself won't stop it; this guard
 * does.
 *
 * Two-kind taxonomy (same as the TS side, classified by directory):
 *   - PILLAR : a workspace member under `pillars/`  (e.g. `pillars/contacts`).
 *   - LIB    : a workspace member under `libs/`      (e.g. `libs/pops-ai`,
 *              `libs/pops-settings`).
 *
 * Rules enforced (§8 crate-boundary table):
 *   RUST-2a  a LIB crate must not `[dependencies]` (or dev/build-depend on) a
 *            PILLAR crate.                                            (HARD)
 *   RUST-2b  a PILLAR crate must not depend on ANOTHER pillar crate; cross-
 *            pillar consumption is REST or a shared lib, never a crate edge.
 *                                                                     (HARD)
 *
 * Disk-discovered (principle P-8): the member list and the pillar/lib split are
 * read from the live workspace `Cargo.toml` + each member's `Cargo.toml`, so a
 * new crate is gated the moment it joins `[workspace].members` with no edit
 * here.
 *
 * A path/git dependency edge (`{ path = "..." }`) onto a sibling member, or a
 * registry dependency whose name equals a workspace member crate name, both
 * count as a crate edge for this guard — either form pulls the other crate into
 * the build graph.
 *
 * **Tier B guard**: the manifests go through a real TOML parser, so the job
 * that runs it installs the workspace first. See the tier amendment in
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 * Cargo accepts a dependency written as a key (`contacts = { path = … }`), as a
 * sub-table (`[dependencies.contacts]`), renamed (`package = "contacts"`), and
 * target-scoped — and the scanner this replaced was blind to the sub-table
 * spelling until a review caught it.
 *
 * Usage:
 *   node scripts/extractability/check-cargo-deps.mjs
 *   node scripts/extractability/check-cargo-deps.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one violation. Exit 2 = usage / parse error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigParseError, isMapping, parseToml, scalarText } from '../ci/config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Dependency tables whose entries pull a crate into the build graph. */
const DEP_TABLES = ['dependencies', 'dev-dependencies', 'build-dependencies'];

/**
 * @typedef {object} Crate
 * @property {string} dir   Repo-relative dir, e.g. `pillars/contacts`.
 * @property {string} name  Crate name from `[package].name`, e.g. `contacts`.
 * @property {'pillar'|'lib'} kind
 * @property {string[]} deps  Dependency crate names across all dep tables.
 */

/**
 * Extract the `members` array from a workspace `Cargo.toml`. Members are
 * repo-relative paths.
 *
 * @param {string} toml
 * @param {string} [label] Path used in a parse-failure message.
 * @returns {string[]}
 * @throws {ConfigParseError}
 */
export function parseWorkspaceMembers(toml, label = 'Cargo.toml') {
  const workspace = parseToml(toml, label).workspace;
  if (!isMapping(workspace)) return [];
  const members = workspace.members;
  if (members === undefined) return [];
  if (!Array.isArray(members)) {
    throw new ConfigParseError(label, '[workspace].members is not an array');
  }
  return members.map(scalarText).filter((member) => member !== undefined);
}

/**
 * Add every crate named by one dependency table to `deps`.
 *
 * A key names the crate unless the entry renames it — `bar = { package = "foo"
 * }` and its sub-table spelling `[dependencies.bar] package = "foo"` are the
 * same declaration and both resolve to `foo`, which is the name the build graph
 * keys on.
 *
 * @param {unknown} table
 * @param {Set<string>} deps
 * @param {string} label
 * @param {string} where  Table path, for a parse-failure message.
 */
function collectDepTable(table, deps, label, where) {
  if (table === undefined) return;
  if (!isMapping(table)) {
    throw new ConfigParseError(label, `[${where}] is not a table`);
  }
  for (const [alias, spec] of Object.entries(table)) {
    const renamed = isMapping(spec) ? scalarText(spec.package) : undefined;
    deps.add(renamed ?? alias);
  }
}

/**
 * Parse a member `Cargo.toml` into its package name + the set of dependency
 * crate names declared across `[dependencies]`, `[dev-dependencies]` and
 * `[build-dependencies]`, including their `[target.<cfg>.…]` scopings.
 *
 * @param {string} toml
 * @param {string} [label] Path used in a parse-failure message.
 * @returns {{ name: string; deps: string[] }}
 * @throws {ConfigParseError}
 */
export function parseMemberManifest(toml, label = 'Cargo.toml') {
  const doc = parseToml(toml, label);
  const pkg = doc.package;
  const name = isMapping(pkg) ? (scalarText(pkg.name) ?? '') : '';

  /** @type {Set<string>} */
  const deps = new Set();
  for (const table of DEP_TABLES) collectDepTable(doc[table], deps, label, table);

  const targets = doc.target;
  if (isMapping(targets)) {
    for (const [cfg, scoped] of Object.entries(targets)) {
      if (!isMapping(scoped)) continue;
      for (const table of DEP_TABLES) {
        collectDepTable(scoped[table], deps, label, `target.${cfg}.${table}`);
      }
    }
  }

  return { name, deps: [...deps] };
}

/**
 * Discover every workspace member crate, classified by directory.
 *
 * @param {string} [root]  Repo root (override for tests).
 * @returns {Crate[]}
 */
export function discoverCrates(root = repoRoot) {
  const wsPath = join(root, 'Cargo.toml');
  if (!existsSync(wsPath)) {
    throw new Error(`no workspace Cargo.toml at ${wsPath}`);
  }
  const members = parseWorkspaceMembers(readFileSync(wsPath, 'utf8'), 'Cargo.toml');
  /** @type {Crate[]} */
  const crates = [];
  for (const member of members) {
    const memberToml = join(root, member, 'Cargo.toml');
    if (!existsSync(memberToml)) {
      throw new Error(`workspace member '${member}' has no Cargo.toml`);
    }
    const { name, deps } = parseMemberManifest(
      readFileSync(memberToml, 'utf8'),
      `${member}/Cargo.toml`
    );
    if (!name) throw new Error(`member '${member}' has no [package].name`);
    /** @type {'pillar'|'lib'|null} */
    let kind = null;
    if (member.startsWith('pillars/')) kind = 'pillar';
    else if (member.startsWith('libs/')) kind = 'lib';
    if (!kind) continue; // crate outside the pillar/lib taxonomy — not gated.
    crates.push({ dir: member, name, kind, deps });
  }
  return crates.toSorted((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * @typedef {object} Violation
 * @property {string} from    Offending crate name.
 * @property {'lib'|'pillar'} fromKind
 * @property {string} to      Pillar crate name reached.
 * @property {'RUST-2a'|'RUST-2b'} rule
 */

/**
 * Pure detector — find every forbidden crate edge. Exported for tests.
 *
 *   RUST-2a : a lib depends on any pillar crate.
 *   RUST-2b : a pillar depends on a DIFFERENT pillar crate (self-edge ignored).
 *
 * @param {Crate[]} crates
 * @returns {Violation[]}
 */
export function findViolations(crates) {
  const pillarNames = new Set(crates.filter((c) => c.kind === 'pillar').map((c) => c.name));
  /** @type {Violation[]} */
  const violations = [];
  for (const crate of crates) {
    for (const dep of crate.deps) {
      if (!pillarNames.has(dep)) continue;
      if (crate.kind === 'lib') {
        violations.push({ from: crate.name, fromKind: 'lib', to: dep, rule: 'RUST-2a' });
      } else if (crate.kind === 'pillar' && dep !== crate.name) {
        violations.push({ from: crate.name, fromKind: 'pillar', to: dep, rule: 'RUST-2b' });
      }
    }
  }
  return violations;
}

/**
 * Self-test: prove the detector flags a lib→pillar edge and a pillar→pillar
 * edge, and passes a clean fixture. Mirrors the `--self-test` in
 * check-lib-no-pillar-import.mjs so a regression that neuters the guard is
 * caught without depending on a real-tree violation.
 *
 * @returns {boolean}
 */
function selfTest() {
  /** @type {Crate[]} */
  const fixture = [
    { dir: 'pillars/contacts', name: 'contacts', kind: 'pillar', deps: ['axum', 'sqlx'] },
    { dir: 'pillars/finance', name: 'finance', kind: 'pillar', deps: ['contacts'] },
    { dir: 'libs/pops-ai', name: 'pops-ai', kind: 'lib', deps: ['contacts', 'serde'] },
    { dir: 'libs/pops-settings', name: 'pops-settings', kind: 'lib', deps: ['serde', 'axum'] },
  ];
  const found = findViolations(fixture);
  const caughtLib = found.some(
    (v) => v.from === 'pops-ai' && v.to === 'contacts' && v.rule === 'RUST-2a'
  );
  const caughtPillar = found.some(
    (v) => v.from === 'finance' && v.to === 'contacts' && v.rule === 'RUST-2b'
  );
  const cleanPassed = !found.some((v) => v.from === 'pops-settings');

  // The fixture above starts from a Crate[] literal, so it proves the rule and
  // never the manifest reader that feeds it. These spell the same forbidden
  // edge in the sub-table form Cargo accepts, which used to parse to no dep at
  // all (ADR-045).
  const subTableSeen = parseMemberManifest(
    '[package]\nname = "pops-ai"\n\n[dependencies.contacts]\npath = "../../pillars/contacts"\n'
  ).deps.includes('contacts');
  const renamedSubTableSeen = parseMemberManifest(
    '[package]\nname = "pops-ai"\n\n[dependencies.ct]\npackage = "contacts"\npath = "x"\n'
  ).deps.includes('contacts');
  const targetSubTableSeen = parseMemberManifest(
    '[package]\nname = "pops-ai"\n\n[target.\'cfg(unix)\'.dependencies.contacts]\npath = "x"\n'
  ).deps.includes('contacts');

  // A manifest nobody can read must raise, so `main` exits 2 with the reason
  // rather than classifying the crate as one that declares no dependencies.
  let unparseableRaised = false;
  try {
    parseMemberManifest('[package\nname = "pops-ai"\n');
  } catch (error) {
    unparseableRaised = error instanceof ConfigParseError;
  }

  const ok =
    caughtLib &&
    caughtPillar &&
    cleanPassed &&
    subTableSeen &&
    renamedSubTableSeen &&
    targetSubTableSeen &&
    unparseableRaised;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  caught lib→pillar (RUST-2a):    ${caughtLib}`);
    console.error(`  caught pillar→pillar (RUST-2b): ${caughtPillar}`);
    console.error(`  clean lib passed:               ${cleanPassed}`);
    console.error(`  read [dependencies.<crate>]:    ${subTableSeen}`);
    console.error(`  read a renamed sub-table dep:   ${renamedSubTableSeen}`);
    console.error(`  read a target sub-table dep:    ${targetSubTableSeen}`);
    console.error(`  raised on an unreadable manifest: ${unparseableRaised}`);
  } else {
    console.log(
      'self-test OK — guard flags lib→pillar + pillar→pillar, passes clean lib, reads ' +
        'every dependency spelling, and refuses to read an unparseable manifest as empty.'
    );
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/extractability/check-cargo-deps.mjs [--self-test]\n' +
        'Fails if a lib crate depends on a pillar crate, or a pillar crate ' +
        'depends on another pillar crate.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  let crates;
  try {
    crates = discoverCrates();
  } catch (err) {
    console.error(
      `FAIL — could not read the cargo workspace: ${err instanceof Error ? err.message : err}`
    );
    process.exit(2);
  }
  const libs = crates.filter((c) => c.kind === 'lib');
  const pillars = crates.filter((c) => c.kind === 'pillar');
  console.log(
    `Scanned ${crates.length} workspace crate(s): ${pillars.length} pillar(s), ${libs.length} lib(s).`
  );

  const violations = findViolations(crates);
  if (violations.length === 0) {
    console.log('OK — no lib→pillar and no pillar→pillar crate dependency.');
    process.exit(0);
  }
  console.error(`FAIL — ${violations.length} crate-boundary violation(s):`);
  for (const v of violations.toSorted((a, b) => a.from.localeCompare(b.from))) {
    const why =
      v.rule === 'RUST-2a'
        ? 'a lib must never depend on a pillar (inverts the dependency, blocks extraction)'
        : 'a pillar must consume another pillar via REST or a shared lib, never a crate edge';
    console.error(`  [${v.rule}] ${v.from} (${v.fromKind}) → ${v.to} (pillar) — ${why}`);
  }
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
