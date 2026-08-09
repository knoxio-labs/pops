#!/usr/bin/env node
/**
 * Node pin coherence guard — see [ADR-039](../../docs/architecture/adr-039-pillar-isolation.md)
 * on the toolchain pin, and `check-mise-tool-overrides.mjs` next door.
 *
 * Scope is the fleet-level pins only. A unit may still override `[tools] node`
 * in its own `mise.toml` to trial or lag a bump — that escape hatch belongs to
 * the sibling guard, and nothing here reads a unit config.
 *
 * The Node major is declared in five independent places, and nothing used to
 * make them agree:
 *
 *   - `mise.toml`           `[tools] node`      — what a local `mise run` uses
 *   - `mise.ci.toml`        `[tools] node`      — what `MISE_ENV=ci` uses
 *   - `package.json`        `engines.node`      — what pnpm refuses to run under
 *   - the workflows         `node-version:`     — what CI actually runs
 *   - each pillar Dockerfile `FROM node:<major>` — what the images ship
 *
 * When they drift, "green locally" and "green in CI" stop being the same claim,
 * and the failure is a silent behavioural difference rather than an error.
 *
 * This guard also asserts `activate_aggressive` is still set in the root
 * `mise.toml`. Without it mise appends its resolved tool bin dirs *after* the
 * inherited PATH whenever its shim dir is on PATH, so a system Node ahead of
 * the shims wins every `#!/usr/bin/env node` lookup inside a task — every
 * `node_modules/.bin` entry is such a shebang. Dropping that one line silently
 * reintroduces suites that pass under pnpm and fail under mise, so it is
 * load-bearing config, not preference.
 *
 * Parses TOML as text (regex, no dependency) — mirrors the other guards here.
 *
 * Usage:
 *   node scripts/ci/check-node-pin.mjs
 *   node scripts/ci/check-node-pin.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = a violation. Exit 2 = usage error.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTomlSection } from './check-mise-tool-overrides.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** mise setting that must stay enabled for the pin to reach task subprocesses. */
export const REQUIRED_MISE_SETTINGS = { activate_aggressive: 'true' };

/**
 * Reduce any Node version expression to its major as a string. Handles a bare
 * major (`24`), an exact version (`24.19.0`), and the range operators that
 * appear in an `engines` field (`^24`, `>=24`, `~24.19`).
 *
 * Returns `null` when no major can be read, which callers report as a
 * violation rather than silently skipping — an unreadable pin is drift.
 *
 * @param {string} expression
 * @returns {string | null}
 */
export function nodeMajor(expression) {
  const match = /(\d+)/u.exec(expression.trim());
  return match === null ? null : match[1];
}

/**
 * @typedef {{ source: string, expression: string, major: string | null }} PinSite
 */

/**
 * Collect every `FROM node:<tag>` base image across the repo's Dockerfiles.
 *
 * @param {string} root
 * @returns {PinSite[]}
 */
export function collectDockerfilePins(root) {
  /** @type {PinSite[]} */
  const pins = [];
  const pillarsDir = join(root, 'pillars');
  if (!existsSync(pillarsDir)) return pins;
  for (const entry of readdirSync(pillarsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dockerfile = join(pillarsDir, entry.name, 'Dockerfile');
    if (!existsSync(dockerfile)) continue;
    const source = readFileSync(dockerfile, 'utf8');
    for (const match of source.matchAll(/^FROM\s+node:(\S+)/gmu)) {
      pins.push({
        source: relative(root, dockerfile),
        expression: match[1],
        major: nodeMajor(match[1]),
      });
    }
  }
  return pins;
}

/**
 * Collect every `node-version:` pin across the GitHub Actions workflows.
 *
 * @param {string} root
 * @returns {PinSite[]}
 */
export function collectWorkflowPins(root) {
  /** @type {PinSite[]} */
  const pins = [];
  const workflowsDir = join(root, '.github', 'workflows');
  if (!existsSync(workflowsDir)) return pins;
  for (const name of readdirSync(workflowsDir).toSorted((a, b) => a.localeCompare(b))) {
    if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
    const file = join(workflowsDir, name);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^\s*node-version:\s*["']?([^"'\s#]+)/gmu)) {
      pins.push({
        source: relative(root, file),
        expression: match[1],
        major: nodeMajor(match[1]),
      });
    }
  }
  return pins;
}

/**
 * Gather every declared Node pin in the repo.
 *
 * @param {string} root
 * @returns {PinSite[]}
 */
export function collectPins(root) {
  /** @type {PinSite[]} */
  const pins = [];

  const rootMise = parseTomlSection(readFileSync(join(root, 'mise.toml'), 'utf8'), 'tools');
  if (typeof rootMise.node === 'string') {
    pins.push({ source: 'mise.toml', expression: rootMise.node, major: nodeMajor(rootMise.node) });
  }

  const ciMisePath = join(root, 'mise.ci.toml');
  if (existsSync(ciMisePath)) {
    const ciMise = parseTomlSection(readFileSync(ciMisePath, 'utf8'), 'tools');
    if (typeof ciMise.node === 'string') {
      pins.push({
        source: 'mise.ci.toml',
        expression: ciMise.node,
        major: nodeMajor(ciMise.node),
      });
    }
  }

  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const engines = manifest.engines?.node;
  if (typeof engines === 'string') {
    pins.push({
      source: 'package.json engines.node',
      expression: engines,
      major: nodeMajor(engines),
    });
  }

  pins.push(...collectWorkflowPins(root), ...collectDockerfilePins(root));
  return pins;
}

/**
 * @typedef {{
 *   pins: PinSite[],
 *   majors: string[],
 *   violations: string[],
 * }} PinReport
 */

/**
 * Check that every declared Node pin names the same major, that the root
 * manifest declares `engines.node` at all, and that the root `mise.toml` still
 * enables the settings the pin depends on.
 *
 * @param {string} root
 * @returns {PinReport}
 */
export function checkNodePin(root) {
  const pins = collectPins(root);
  /** @type {string[]} */
  const violations = [];

  for (const pin of pins) {
    if (pin.major === null) {
      violations.push(
        `${pin.source} declares Node "${pin.expression}", which has no readable major.`
      );
    }
  }

  const majors = [...new Set(pins.map((pin) => pin.major).filter((major) => major !== null))];
  if (majors.length > 1) {
    const detail = pins.map((pin) => `  ${pin.source}: ${pin.expression}`).join('\n');
    violations.push(
      `Node pins disagree — majors ${majors.toSorted().join(', ')} are all declared:\n${detail}`
    );
  }

  if (!pins.some((pin) => pin.source === 'package.json engines.node')) {
    violations.push(
      'package.json declares no engines.node. Without it pnpm has nothing to enforce, ' +
        'so a shell resolving an unpinned Node runs the workspace silently.'
    );
  }

  // The disagreement check is a set comparison over discovered pins: discover
  // none and every major agrees trivially. Both of these sites are populated in
  // any healthy tree, so an empty one means the collector stopped finding them,
  // not that the pins went away (ADR-045).
  if (!pins.some((pin) => pin.source.startsWith('.github/workflows/'))) {
    violations.push(
      'No workflow declares a `node-version:`. Either .github/workflows moved, or CI now ' +
        'resolves Node some other way — until the collector is taught that way, the ' +
        'workflows are outside the coherence check rather than agreeing with it.'
    );
  }
  if (!pins.some((pin) => pin.source.endsWith('Dockerfile'))) {
    violations.push(
      'No pillar Dockerfile declares a `FROM node:<tag>` base image. Either pillars/ moved, ' +
        'or the images now derive their Node another way — either way the shipped runtime is ' +
        'no longer being compared against the local and CI pins.'
    );
  }

  const settings = parseTomlSection(readFileSync(join(root, 'mise.toml'), 'utf8'), 'settings');
  for (const [key, expected] of Object.entries(REQUIRED_MISE_SETTINGS)) {
    if (settings[key] !== expected) {
      violations.push(
        `mise.toml [settings] ${key} must be ${expected} (found ${settings[key] ?? 'unset'}). ` +
          'Without it mise appends its tool bin dirs after the inherited PATH, so a system ' +
          'Node ahead of the mise shims wins every shebang lookup inside a task.'
      );
    }
  }

  return { pins, majors, violations };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-node-pin.mjs [--self-test]\n' +
        'Fails if the Node major disagrees across mise.toml, mise.ci.toml, package.json ' +
        'engines.node, the workflows and the pillar Dockerfiles, or if the root mise ' +
        'settings that carry the pin into tasks have been dropped.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { pins, majors, violations } = checkNodePin(repoRoot);

  if (violations.length === 0) {
    console.log(`OK — all ${pins.length} Node pins name major ${majors[0]}.`);
    process.exit(0);
  }
  for (const pin of pins) console.error(`  ${pin.source}: ${pin.expression}`);
  for (const violation of violations) console.error(`FAIL — ${violation}`);
  process.exit(1);
}

/** @returns {boolean} */
function selfTest() {
  const checks = [
    nodeMajor('24') === '24',
    nodeMajor('24.19.0') === '24',
    nodeMajor('^24') === '24',
    nodeMajor('>=24.1') === '24',
    nodeMajor('24-slim') === '24',
    nodeMajor('lts/*') === null,
    parseTomlSection('[settings]\nactivate_aggressive = true\n', 'settings').activate_aggressive ===
      'true',
    // A tree the collectors cannot see must fail, not agree with itself.
    emptyTreeIsReported(),
  ];
  const ok = checks.every(Boolean);
  if (!ok) console.error(`self-test FAILED: ${JSON.stringify(checks)}`);
  return ok;
}

/** @returns {boolean} */
function emptyTreeIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-selftest-'));
  try {
    writeFileSync(
      join(dir, 'mise.toml'),
      '[tools]\nnode = "24"\n\n[settings]\nactivate_aggressive = true\n',
      'utf8'
    );
    writeFileSync(join(dir, 'package.json'), '{"engines":{"node":"24"}}\n', 'utf8');
    const { violations } = checkNodePin(dir);
    return (
      violations.some((v) => v.includes('No workflow declares')) &&
      violations.some((v) => v.includes('No pillar Dockerfile declares'))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
