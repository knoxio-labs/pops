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
 * Parses TOML as text (regex, no dependency) — mirrors the other guards in
 * this directory (e.g. `check-known-pillars-coverage.mjs`).
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

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Tool keys a non-root unit is permitted to override. */
export const ALLOWED_UNIT_OVERRIDE_TOOLS = ['node', 'rust'];

/** Tools the root pin must declare — the shared default every unit inherits. */
export const REQUIRED_ROOT_TOOLS = ['node', 'pnpm', 'rust'];

/** Unit-kind directories searched for a per-unit `mise.toml`. */
export const UNIT_BASES = ['pillars', 'libs'];

/**
 * Extract a TOML string value from the right-hand side of a `key = value`
 * line, tolerating a trailing inline comment (`node = "24.5.0" # pin`). A
 * quoted value returns its contents verbatim (anything after the closing
 * quote — including a `#` — is ignored); a bare value is truncated at the
 * first `#` and trimmed.
 *
 * @param {string} raw
 * @returns {string}
 */
function extractToolValue(raw) {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const end = trimmed.indexOf(quote, 1);
    return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
  }
  const hash = trimmed.indexOf('#');
  return (hash === -1 ? trimmed : trimmed.slice(0, hash)).trim();
}

/**
 * Extract a top-level table from a mise.toml source as a plain key→value map.
 * Stops at the next `[section]` header or EOF. Comment lines and blank lines
 * are ignored; values are unquoted and any inline comment is stripped.
 *
 * @param {string} source
 * @param {string} section Table name, e.g. `tools` or `settings`.
 * @returns {Record<string, string>}
 */
export function parseTomlSection(source, section) {
  const lines = source.split('\n');
  /** @type {Record<string, string>} */
  const entries = {};
  let inSection = false;
  /** Set while inside a `[<section>.<name>]` sub-table, to `<name>`. */
  let subTable;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#') || line === '') continue;

    // `[tools] # the shared pins` is a legal header. Anchoring on `]$` saw only
    // the bare form, so a commented header silently ended the table and every
    // key under it went unread — the guard then had nothing to object to.
    const header = /^\[([^\]]+)\](?:\s+#.*)?$/u.exec(line);
    if (header) {
      const name = header[1] ?? '';
      inSection = name === section;
      subTable = name.startsWith(`${section}.`)
        ? unquoteKey(name.slice(section.length + 1))
        : undefined;
      // A sub-table declares the tool whether or not it names a version, so
      // register it immediately — `[tools.pnpm]` alone is already the fork.
      if (subTable !== undefined && !(subTable in entries)) entries[subTable] = '';
      continue;
    }

    if (subTable !== undefined) {
      const versionKv = /^version\s*=\s*(.+)$/u.exec(line);
      if (versionKv) entries[subTable] = extractToolValue(versionKv[1] ?? '');
      continue;
    }

    // `tools = { node = "24", pnpm = "10" }` is the inline-table spelling of
    // the same declaration, and carries no `[tools]` header at all.
    const inlineTable = new RegExp(`^${section}\\s*=\\s*\\{(.*)\\}\\s*(?:#.*)?$`, 'u').exec(line);
    if (inlineTable) {
      for (const pair of splitInlineTable(inlineTable[1] ?? '')) {
        const kv = /^([A-Za-z0-9_"'-]+)\s*=\s*(.+)$/u.exec(pair.trim());
        if (kv) entries[unquoteKey(kv[1] ?? '')] = extractToolValue(kv[2] ?? '');
      }
      continue;
    }

    if (!inSection) continue;
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u.exec(line);
    if (!kv) continue;
    entries[kv[1]] = extractToolValue(kv[2]);
  }
  return entries;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function unquoteKey(raw) {
  return raw.trim().replace(/^["']|["']$/gu, '');
}

/**
 * Split an inline-table body on top-level commas, ignoring commas inside
 * quotes.
 *
 * @param {string} body
 * @returns {string[]}
 */
function splitInlineTable(body) {
  /** @type {string[]} */
  const parts = [];
  let current = '';
  let quote;
  for (const char of body) {
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.filter((part) => part.trim() !== '');
}

/**
 * Extract the `[tools]` table from a mise.toml source.
 *
 * @param {string} source
 * @returns {Record<string, string>}
 */
export function parseToolsTable(source) {
  return parseTomlSection(source, 'tools');
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
  const rootTools = parseToolsTable(readFileSync(join(root, 'mise.toml'), 'utf8'));
  const baselineMissing = REQUIRED_ROOT_TOOLS.filter((tool) => !(tool in rootTools));

  /** @type {UnitOverride[]} */
  const unitOverrides = [];
  /** @type {string[]} */
  const violations = [];

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
    const tools = parseToolsTable(readFileSync(join(root, dir, 'mise.toml'), 'utf8'));
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
 * Every case below spells the SAME forbidden declaration — a per-unit `pnpm`
 * fork — in a different legal TOML shape. Each of the last three used to parse
 * to `{}`, which the caller reads as "this unit overrides nothing".
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
    'a missing unit base is a violation, not an empty sweep': missingBaseIsReported(),
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
