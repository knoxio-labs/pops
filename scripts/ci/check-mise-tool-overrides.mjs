#!/usr/bin/env node
/**
 * Per-pillar mise toolchain override guard — see
 * [ADR-039](../../docs/architecture/adr-039-pillar-isolation.md) on why the
 * toolchain pin must not impose fleet-wide lockstep.
 *
 * The root `mise.toml` `[tools]` table (node/pnpm/rust) is the shared
 * default toolchain. mise merges config **up** the directory tree, so any
 * unit (`pillars/<id>`, `pillars/<id>/app`, `libs/<id>`) may declare its own
 * `[tools]` table in its own `mise.toml` to override just the tool(s) it
 * needs to trial or lag a bump — everything it doesn't redeclare still
 * resolves from the root pin.
 *
 * This guard keeps that escape hatch narrow and the root pin honest:
 *   - the root `mise.toml` must still declare `[tools]` for node/pnpm/rust
 *     (the documented shared default a per-unit override falls back to);
 *   - a unit may override `node` or `rust` only — `pnpm` manages the single
 *     pnpm workspace lockfile and must not fork per unit.
 *
 * **Tier B guard**: it reads TOML through a real parser, so the job that runs
 * it installs the workspace first. See the tier amendment in
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 * The hand-rolled scanner this replaced modelled one spelling of `[tools]` at a
 * time and had to be taught each new one — a sub-table, an inline table, a
 * commented header — after each had already slipped past it once.
 *
 * Usage:
 *   node scripts/ci/check-mise-tool-overrides.mjs
 *   node scripts/ci/check-mise-tool-overrides.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = a violation. Exit 2 = usage error.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigParseError, isMapping, parseToml, scalarText } from './config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Tool keys a non-root unit is permitted to override. */
export const ALLOWED_UNIT_OVERRIDE_TOOLS = ['node', 'rust'];

/** Tools the root pin must declare — the shared default every unit inherits. */
export const REQUIRED_ROOT_TOOLS = ['node', 'pnpm', 'rust'];

/** Unit-kind directories searched for a per-unit `mise.toml`. */
export const UNIT_BASES = ['pillars', 'libs'];

/**
 * Reduce a parsed `[tools]` entry to the version string the callers compare.
 *
 * mise accepts three spellings for one pin and they all mean the same thing:
 * a scalar (`node = "24"`), a request list (`node = ["24", "22"]`, highest
 * priority first), and a sub-table (`[tools.node] version = "24"`, which may
 * carry only a backend and no version at all). The tool being DECLARED is what
 * the guard rules on, so a spelling that names no version still yields the key
 * with an empty value.
 *
 * @param {unknown} value
 * @returns {string}
 */
function toolVersion(value) {
  const scalar = scalarText(value);
  if (scalar !== undefined) return scalar;
  if (Array.isArray(value)) {
    for (const item of value) {
      const first = scalarText(item);
      if (first !== undefined) return first;
      if (isMapping(item)) {
        const nested = scalarText(item.version);
        if (nested !== undefined) return nested;
      }
    }
    return '';
  }
  if (isMapping(value)) return scalarText(value.version) ?? '';
  return '';
}

/**
 * Read a top-level table from a mise.toml source as a plain key→value map.
 *
 * @param {string} source
 * @param {string} section Table name, e.g. `tools` or `settings`.
 * @param {string} [label] Path used in a parse-failure message.
 * @returns {Record<string, string>}
 * @throws {ConfigParseError} when the source is not valid TOML, or the named
 *   table is not a table.
 */
export function parseTomlSection(source, section, label = 'mise.toml') {
  const doc = parseToml(source, label);
  const table = doc[section];
  if (table === undefined) return {};
  if (!isMapping(table)) {
    throw new ConfigParseError(label, `[${section}] is a ${typeof table}, not a table`);
  }
  /** @type {Record<string, string>} */
  const entries = {};
  for (const [key, value] of Object.entries(table)) entries[key] = toolVersion(value);
  return entries;
}

/**
 * Extract the `[tools]` table from a mise.toml source.
 *
 * @param {string} source
 * @param {string} [label] Path used in a parse-failure message.
 * @returns {Record<string, string>}
 * @throws {ConfigParseError}
 */
export function parseToolsTable(source, label) {
  return parseTomlSection(source, 'tools', label);
}

/**
 * Discover every unit dir (relative to `root`) that carries its own
 * `mise.toml`: `pillars/<id>`, `pillars/<id>/app`, `libs/<id>`. Mirrors the
 * root `mise.toml`'s `run-all` disk-discovery.
 *
 * @param {string} root
 * @returns {string[]} Sorted repo-relative unit dirs.
 */
export function discoverUnitMiseDirs(root) {
  /** @type {string[]} */
  const out = [];
  for (const base of UNIT_BASES) {
    const baseDir = join(root, base);
    if (!existsSync(baseDir)) continue;
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(baseDir, entry.name);
      if (existsSync(join(dir, 'mise.toml'))) out.push(relative(root, dir));
      const appDir = join(dir, 'app');
      if (base === 'pillars' && existsSync(join(appDir, 'mise.toml'))) {
        out.push(relative(root, appDir));
      }
    }
  }
  return out.toSorted((a, b) => a.localeCompare(b));
}

/**
 * @typedef {{ dir: string, overrides: Record<string, string> }} UnitOverride
 * @typedef {{
 *   baselineMissing: string[],
 *   unitOverrides: UnitOverride[],
 *   violations: string[],
 * }} OverrideReport
 */

/**
 * Check the root `[tools]` baseline plus every unit's override, if any,
 * against `ALLOWED_UNIT_OVERRIDE_TOOLS`.
 *
 * @param {string} root
 * @returns {OverrideReport}
 */
export function checkOverrides(root) {
  /** @type {UnitOverride[]} */
  const unitOverrides = [];
  /** @type {string[]} */
  const violations = [];

  // An unreadable root pin is the degenerate case: every downstream question
  // ("does this unit override node?") is answered against nothing, and an empty
  // baseline would otherwise read as a fleet that simply declares no tools.
  const rootMise = join(root, 'mise.toml');
  if (!existsSync(rootMise)) {
    return {
      baselineMissing: [...REQUIRED_ROOT_TOOLS],
      unitOverrides,
      violations: [`${rootMise} does not exist — there is no root toolchain pin to check against.`],
    };
  }
  /** @type {Record<string, string>} */
  let rootTools;
  try {
    rootTools = parseToolsTable(readFileSync(rootMise, 'utf8'), 'mise.toml');
  } catch (error) {
    return {
      baselineMissing: [...REQUIRED_ROOT_TOOLS],
      unitOverrides,
      violations: [errorText(error)],
    };
  }
  const baselineMissing = REQUIRED_ROOT_TOOLS.filter((tool) => !(tool in rootTools));

  // Without this the unit half of the check is a loop over a set that can
  // become empty for reasons that have nothing to do with compliance — a
  // renamed unit-kind directory reads exactly like a fleet with no overrides.
  for (const base of UNIT_BASES) {
    if (!existsSync(join(root, base))) {
      violations.push(
        `${base}/ does not exist, so no unit under it was searched for a mise.toml override. ` +
          'Whichever directory now holds that unit kind must be added to UNIT_BASES.'
      );
    }
  }

  for (const dir of discoverUnitMiseDirs(root)) {
    const unitMise = `${dir}/mise.toml`;
    /** @type {Record<string, string>} */
    let tools;
    try {
      tools = parseToolsTable(readFileSync(join(root, dir, 'mise.toml'), 'utf8'), unitMise);
    } catch (error) {
      // A unit whose config does not parse is not a unit with no override — it
      // is a unit whose override nobody can see.
      violations.push(errorText(error));
      continue;
    }
    const keys = Object.keys(tools);
    if (keys.length === 0) continue;
    unitOverrides.push({ dir, overrides: tools });
    for (const key of keys) {
      if (!ALLOWED_UNIT_OVERRIDE_TOOLS.includes(key)) {
        violations.push(
          `${dir}/mise.toml overrides "${key}" — only ${ALLOWED_UNIT_OVERRIDE_TOOLS.join(
            ', '
          )} may be overridden per unit (pnpm manages one workspace lockfile; ` +
            'see AGENTS.md "Toolchain pin").'
        );
      }
    }
  }

  return { baselineMissing, unitOverrides, violations };
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-mise-tool-overrides.mjs [--self-test]\n' +
        'Fails if the root mise.toml [tools] baseline is missing a required tool, ' +
        'or a unit mise.toml overrides a tool it may not override.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { baselineMissing, unitOverrides, violations } = checkOverrides(repoRoot);

  if (unitOverrides.length === 0) {
    console.log('No unit currently overrides the root mise toolchain pin.');
  } else {
    for (const { dir, overrides } of unitOverrides) {
      console.log(`${dir}: overrides ${JSON.stringify(overrides)}`);
    }
  }

  if (baselineMissing.length === 0 && violations.length === 0) {
    console.log('OK — root toolchain pin intact, every unit override is allowed.');
    process.exit(0);
  }
  if (baselineMissing.length > 0) {
    console.error(
      `FAIL — root mise.toml [tools] is missing: ${baselineMissing.join(', ')}. ` +
        'The root pin is the documented shared default every unit falls back to.'
    );
  }
  for (const violation of violations) {
    console.error(`FAIL — ${violation}`);
  }
  process.exit(1);
}

/**
 * A tree whose unit-kind directories have been renamed away must report that,
 * not sweep zero units and call the fleet compliant.
 *
 * @returns {boolean}
 */
function missingBaseIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'mise-overrides-selftest-'));
  try {
    writeFileSync(
      join(dir, 'mise.toml'),
      '[tools]\nnode = "24"\npnpm = "10"\nrust = "stable"\n',
      'utf8'
    );
    const { violations } = checkOverrides(dir);
    return UNIT_BASES.every((base) => violations.some((v) => v.startsWith(`${base}/`)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A root pin nobody can read must be reported, not treated as a fleet that
 * happens to declare no tools.
 *
 * @returns {boolean}
 */
function unparseableRootIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'mise-overrides-badtoml-'));
  try {
    writeFileSync(join(dir, 'mise.toml'), '[tools\nnode = "24"\n', 'utf8');
    const { violations, baselineMissing } = checkOverrides(dir);
    return (
      violations.some((v) => v.includes('could not be parsed')) &&
      baselineMissing.length === REQUIRED_ROOT_TOOLS.length
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Every spelling case below writes the SAME forbidden declaration — a per-unit
 * `pnpm` fork — in a different legal TOML shape. The scanner this replaced had
 * to be taught each one after it had already slipped through; a real parser
 * collapses them all before the guard sees them, and these cases exist to prove
 * that stays true.
 *
 * @returns {boolean}
 */
function selfTest() {
  const rootTools = parseToolsTable(
    '[tools]\nnode = "24.5.0"\npnpm = "10.32.1"\nrust = "stable"\n'
  );
  const overrideTools = parseToolsTable('[tasks.build]\nrun = "x"\n\n[tools]\nnode = "22"\n');

  const checks = {
    'reads the root baseline':
      rootTools.node === '24.5.0' && rootTools.pnpm === '10.32.1' && rootTools.rust === 'stable',
    'reads a plain unit override': overrideTools.node === '22' && !('run' in overrideTools),
    'sees a pnpm fork behind a commented table header':
      parseToolsTable('[tools] # trial pins\npnpm = "9.0.0"\n').pnpm === '9.0.0',
    'sees a pnpm fork written as a sub-table':
      parseToolsTable('[tools.pnpm]\nversion = "9.0.0"\n').pnpm === '9.0.0',
    'sees a versionless sub-table as a declaration':
      'pnpm' in parseToolsTable('[tools.pnpm]\nbackend = "npm"\n'),
    'sees a pnpm fork written as an inline table':
      parseToolsTable('tools = { node = "24", pnpm = "9.0.0" }\n').pnpm === '9.0.0',
    'sees a pnpm fork written as a request list':
      parseToolsTable('[tools]\npnpm = ["9.0.0", "8"]\n').pnpm === '9.0.0',
    'a missing unit base is a violation, not an empty sweep': missingBaseIsReported(),
    'an unparseable root pin is a violation, not an empty baseline':
      unparseableRootIsReported(),
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(`self-test FAILED: ${failed.map(([name]) => name).join('; ')}`);
    return false;
  }
  console.log(`self-test OK — ${Object.keys(checks).length} assertions passed.`);
  return true;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
