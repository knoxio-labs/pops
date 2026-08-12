#!/usr/bin/env node
/**
 * Known-pillars drift guard: the curated `PILLARS` tuple in
 * `libs/sdk/src/capabilities/known-pillar-id.ts` is the single
 * hand-maintained enumeration the nginx config generator's coverage assert
 * (`assertRenderOrderCoversAllPillars`) and `isKnownPillarId` gate against.
 * Nothing re-derives it from disk, so a new data pillar can ship without
 * ever being added to it.
 *
 * This guard is disk-derived on the OTHER side of that gap: it discovers
 * every "data pillar" (a `pillars/<id>` that owns a persisted DB — the
 * AGENTS.md `Pillars and ports` table's definition) and diffs that set
 * against the `PILLARS` tuple.
 *
 * A dir counts as a data pillar if it owns a migrated schema:
 *   - TS pillars: `pillars/<id>/src/db/schema.ts` exists.
 *   - Rust pillars: `pillars/<id>/Cargo.toml` + `pillars/<id>/migrations/`
 *     both exist (e.g. `contacts`).
 *
 * This deliberately excludes `shell`, `mcp`, `orchestrator`, `docs`, and
 * `moltbot` — every one of those owns no DB (AGENTS.md), so none belongs in
 * the curated list.
 *
 * `PILLARS` is parsed as text (not imported) so this stays a plain-`node`
 * script with no TS toolchain dependency, matching the other guards in this
 * directory.
 *
 * Usage:
 *   node scripts/ci/check-known-pillars-coverage.mjs
 *   node scripts/ci/check-known-pillars-coverage.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one drift. Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const KNOWN_PILLAR_ID_PATH = join(
  repoRoot,
  'libs',
  'sdk',
  'src',
  'capabilities',
  'known-pillar-id.ts'
);

/**
 * Discover every `pillars/<id>` that owns a persisted DB, from disk.
 *
 * @param {string} root  Repo root.
 * @returns {string[]} Sorted pillar ids.
 */
export function discoverDataPillarIds(root) {
  const pillarsRoot = join(root, 'pillars');
  if (!existsSync(pillarsRoot)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(pillarsRoot, entry.name);
    const ownsTsSchema = existsSync(join(dir, 'src', 'db', 'schema.ts'));
    const ownsRustSchema =
      existsSync(join(dir, 'Cargo.toml')) && existsSync(join(dir, 'migrations'));
    if (ownsTsSchema || ownsRustSchema) out.push(entry.name);
  }
  return out.toSorted((a, b) => a.localeCompare(b));
}

/**
 * Extract the string literals inside `export const PILLARS = [...] as
 * const;` from the `known-pillar-id.ts` source text.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function extractCuratedPillarIds(source) {
  const match = /export const PILLARS = \[([\s\S]*?)\] as const;/u.exec(source);
  if (!match) {
    throw new Error(
      'check-known-pillars-coverage: could not find `export const PILLARS = [...] as const;` ' +
        'in known-pillar-id.ts — has it been renamed or reshaped?'
    );
  }
  const body = match[1];
  const ids = [...body.matchAll(/'([^']+)'/gu)].map((m) => m[1]);
  return ids.toSorted((a, b) => a.localeCompare(b));
}

/**
 * @typedef {object} Drift
 * @property {string[]} missing  Data pillar ids on disk with no PILLARS entry.
 * @property {string[]} extra    PILLARS entries with no matching data pillar dir.
 */

/**
 * Pure diff — exported for tests.
 *
 * @param {string[]} dataPillarIds
 * @param {string[]} curatedPillarIds
 * @returns {Drift}
 */
export function findDrift(dataPillarIds, curatedPillarIds) {
  const curated = new Set(curatedPillarIds);
  const data = new Set(dataPillarIds);
  return {
    missing: dataPillarIds.filter((id) => !curated.has(id)),
    extra: curatedPillarIds.filter((id) => !data.has(id)),
  };
}

/**
 * Self-test: prove the detector flags a synthetic missing/extra id and
 * passes a clean fixture. CI runs this so a regression that neuters the
 * guard is caught without relying on a real tree violation.
 *
 * @returns {boolean}
 */
function selfTest() {
  const clean = findDrift(['finance', 'media'], ['finance', 'media']);
  const cleanOk = clean.missing.length === 0 && clean.extra.length === 0;

  const withMissing = findDrift(['finance', 'media', 'weather'], ['finance', 'media']);
  const missingOk =
    withMissing.missing.length === 1 &&
    withMissing.missing[0] === 'weather' &&
    withMissing.extra.length === 0;

  const withExtra = findDrift(['finance'], ['finance', 'ghost']);
  const extraOk =
    withExtra.extra.length === 1 &&
    withExtra.extra[0] === 'ghost' &&
    withExtra.missing.length === 0;

  const ok = cleanOk && missingOk && extraOk;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  clean fixture passed:   ${cleanOk}`);
    console.error(`  caught missing entry:   ${missingOk}`);
    console.error(`  caught extra entry:     ${extraOk}`);
  } else {
    console.log('self-test OK — guard catches missing + extra PILLARS entries, passes clean.');
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-known-pillars-coverage.mjs [--self-test]\n' +
        "Fails if a data pillar's disk dir and the curated PILLARS tuple disagree."
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const dataPillarIds = discoverDataPillarIds(repoRoot);
  const source = readFileSync(KNOWN_PILLAR_ID_PATH, 'utf8');
  const curatedPillarIds = extractCuratedPillarIds(source);
  console.log(
    `Scanned ${dataPillarIds.length} data pillar(s) on disk against ${curatedPillarIds.length} curated PILLARS entries.`
  );

  const { missing, extra } = findDrift(dataPillarIds, curatedPillarIds);
  if (missing.length === 0 && extra.length === 0) {
    console.log('OK — PILLARS matches the on-disk data pillar set.');
    process.exit(0);
  }
  if (missing.length > 0) {
    console.error(
      `FAIL — pillar dir(s) exist with no PILLARS entry: ${missing.join(', ')}. ` +
        'Add them to PILLARS in libs/sdk/src/capabilities/known-pillar-id.ts.'
    );
  }
  if (extra.length > 0) {
    console.error(
      `FAIL — PILLARS entry(ies) with no matching data pillar dir: ${extra.join(', ')}. ` +
        'Remove them from PILLARS in libs/sdk/src/capabilities/known-pillar-id.ts.'
    );
  }
  process.exit(1);
}

if (import.meta.main) {
  main();
}
