#!/usr/bin/env node
/**
 * Every curated pillar must register on boot.
 *
 * Not a discovery nicety — a routing invariant. The shell's production nginx
 * conf is NOT the committed `pillars/shell/nginx.conf`: `docker-entrypoint.sh`
 * boot-renders it from the live registry, and `renderNginxConfDynamic` emits
 * one `/<id>-api/` block per pillar in the registry snapshot. A pillar that
 * never registers therefore has no route on the running host, while the
 * committed conf, the nginx drift test and the static generator all agree it
 * does. That asymmetry is what hid a dead `/design-api/` (POPS-2793): every
 * local check was green over a conf production does not serve.
 *
 * The check: for each id in the SDK's `PILLARS`, the pillar's own source must
 * contain a registration call site. Two shapes count, one per language —
 * `bootstrapPillar(` for the Node pillars, `register_with_retry(` for the Rust
 * one, which reimplements the same protocol. Both are call sites rather than
 * imports or prose, so a pillar that imports the SDK and never calls it does
 * not pass.
 *
 * What this deliberately does NOT check: that registration is *enabled* in a
 * given deployment. `POPS_REGISTRY_ENABLED` is a compose decision, and a
 * pillar that registers only in the fleet is correct. This gate is about the
 * code being able to at all.
 *
 * Usage:
 *   node scripts/ci/check-pillar-registration.mjs
 *   node scripts/ci/check-pillar-registration.mjs --self-test
 *
 * Exit 0 when every curated pillar registers; 1 on any that does not, on a
 * discovery result too small to believe, or a failed self-test.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const PILLARS_SOURCE = 'libs/sdk/src/capabilities/known-pillar-id.ts';

/** Registration call sites, by the language that spells it that way. */
export const REGISTRATION_CALLS = ['bootstrapPillar(', 'register_with_retry('];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.rs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', '__tests__', '__mocks__']);

/**
 * A floor on discovery, per ADR-045. The tuple has a dozen entries; a parser
 * that reads none of them would report an empty fleet and pass.
 */
export const MIN_PILLARS = 8;

/**
 * The `PILLARS` tuple, read as text rather than imported: this gate runs
 * before `pnpm install`, so the compiled SDK is not on disk.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function parsePillars(source) {
  const start = source.indexOf('export const PILLARS = [');
  if (start === -1) return [];
  const end = source.indexOf(']', start);
  if (end === -1) return [];
  return [...source.slice(start, end).matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]);
}

/**
 * Does this source register? A call site, not an import — a pillar that pulls
 * the SDK in and never calls it is exactly the shape this gate exists for.
 *
 * @param {string} source
 * @returns {boolean}
 */
export function registersOnBoot(source) {
  return REGISTRATION_CALLS.some((call) => source.includes(call));
}

/**
 * Every source file under a pillar's `src/`, skipping test trees: a call site
 * that exists only in a test is a pillar that does not register.
 *
 * @param {string} absDir
 * @returns {string[]}
 */
function sourceFiles(absDir) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
      } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        if (!/\.(test|spec)\./.test(entry.name)) found.push(join(dir, entry.name));
      }
    }
  }
  walk(absDir);
  return found;
}

/**
 * @typedef {object} PillarReport
 * @property {string} pillar
 * @property {number} filesRead
 * @property {string | null} callSite  Repo-relative path, or null when none registers.
 */

/**
 * @param {string} pillar
 * @returns {PillarReport}
 */
function reportPillar(pillar) {
  const dir = join(repoRoot, 'pillars', pillar, 'src');
  let exists = false;
  try {
    exists = statSync(dir).isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) return { pillar, filesRead: 0, callSite: null };

  const files = sourceFiles(dir);
  for (const file of files) {
    if (registersOnBoot(readFileSync(file, 'utf8'))) {
      return { pillar, filesRead: files.length, callSite: file.slice(repoRoot.length + 1) };
    }
  }
  return { pillar, filesRead: files.length, callSite: null };
}

function check() {
  const pillars = parsePillars(readFileSync(join(repoRoot, PILLARS_SOURCE), 'utf8'));
  if (pillars.length < MIN_PILLARS) {
    console.error(
      `✗ registration gate: read only ${pillars.length} pillar(s) from ${PILLARS_SOURCE}, below ` +
        `the floor of ${MIN_PILLARS}. The tuple parser has stopped seeing the file — this is not ` +
        `a clean tree.`
    );
    return false;
  }

  const reports = pillars.map(reportPillar);
  console.log(`Checked ${reports.length} curated pillar(s) for a boot registration call.`);
  for (const r of reports) {
    console.log(`  ${r.pillar.padEnd(11)} ${r.callSite ?? '— none —'} (${r.filesRead} files read)`);
  }

  const missing = reports.filter((r) => r.callSite === null);
  if (missing.length === 0) {
    console.log(
      'OK — every curated pillar registers on boot, so every route survives a live render.'
    );
    return true;
  }
  for (const r of missing) {
    console.error(
      `✗ ${r.pillar} never registers: no ${REGISTRATION_CALLS.join(' or ')} in ` +
        `pillars/${r.pillar}/src (${r.filesRead} files read).\n` +
        `  The shell renders its production nginx conf from the live registry, so this pillar has ` +
        `no /${r.pillar}-api/ route on the running host — however complete pillars/shell/nginx.conf ` +
        `looks. See POPS-2793.`
    );
  }
  return false;
}

function selfTest() {
  const tuple = `export const PILLARS = [\n  'registry',\n  'finance',\n  'design',\n] as const;`;
  const parsesTuple =
    JSON.stringify(parsePillars(tuple)) === JSON.stringify(['registry', 'finance', 'design']);
  const emptyOnGarbage = parsePillars('const OTHER = [1];').length === 0;

  const seesNodeCall = registersOnBoot('  pillarHandle = await bootstrapPillar({\n');
  const seesRustCall = registersOnBoot('    register_with_retry(&transport).await;');
  const ignoresImport = !registersOnBoot(
    "import { bootstrapPillar } from '@pops/pillar-sdk/bootstrap';"
  );
  const ignoresProse = !registersOnBoot('//! the SDK’s bootstrapPillar does the same thing.');

  // Against the real tree, not a fixture: a fixture cannot notice a pillar
  // quietly losing its call site, which is the whole failure this gate is for.
  const real = parsePillars(readFileSync(join(repoRoot, PILLARS_SOURCE), 'utf8'));
  const readsRealTuple = real.length >= MIN_PILLARS;
  const readsRealSources = real.every((p) => reportPillar(p).filesRead > 0);

  const allOk =
    parsesTuple &&
    emptyOnGarbage &&
    seesNodeCall &&
    seesRustCall &&
    ignoresImport &&
    ignoresProse &&
    readsRealTuple &&
    readsRealSources;
  if (!allOk) {
    console.error('self-test FAILED');
    console.error(`  parses the PILLARS tuple:              ${parsesTuple}`);
    console.error(`  reads nothing out of an unrelated file: ${emptyOnGarbage}`);
    console.error(`  sees the Node call site:               ${seesNodeCall}`);
    console.error(`  sees the Rust call site:               ${seesRustCall}`);
    console.error(`  ignores an import of it:               ${ignoresImport}`);
    console.error(`  ignores prose naming it:               ${ignoresProse}`);
    console.error(`  reads the real tuple:                  ${readsRealTuple} (${real.length})`);
    console.error(`  reads every real pillar's source:      ${readsRealSources}`);
    return false;
  }
  console.log(
    `self-test OK — parses the tuple, distinguishes a call site from an import or a mention, ` +
      `and reads ${real.length} real pillars off disk.`
  );
  return true;
}

const ok = process.argv.includes('--self-test') ? selfTest() : check();
process.exit(ok ? 0 : 1);
