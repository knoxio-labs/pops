#!/usr/bin/env node
/**
 * Per-unit mise bare-tool-name guard.
 *
 * The root `mise.toml` exposes exactly one bin dir to every task:
 * `[env] _.path = ["{{config_root}}/node_modules/.bin"]`. `{{config_root}}`
 * interpolates per config FILE, so that line only ever contributes the
 * ROOT's own `node_modules/.bin` — never a unit's. A unit task that calls a
 * bare tool name (`tsc --noEmit`, `vitest run`, `oxlint src`) therefore
 * resolves whatever the root's `node_modules/.bin` happens to hold, not the
 * binary that unit's own `package.json` pins and its own lockfile importer
 * resolves. pnpm's isolated `node_modules` layout makes those two diverge
 * routinely, not rarely — a unit trialling a newer `typescript` runs the
 * OLD one under `mise run -C <unit> typecheck` while every other entry point
 * (`pnpm --filter <unit> typecheck`, an editor's TS server) uses the new one.
 *
 * The fix already lives twice in this repo (`pillars/shell/mise.toml`,
 * `libs/ui/mise.toml`, both from the same `vite`/`storybook` sighting): a
 * unit adds its OWN `[env] _.path = ["{{config_root}}/node_modules/.bin"]`.
 * Because `{{config_root}}` interpolates per file, the unit's own config now
 * contributes the unit's own bin dir, and mise merges env config UP the
 * directory tree — the closer (unit) entry resolves first. This guard makes
 * that fix mandatory: a unit whose own mise config runs a bare watched-tool
 * name, and does not also declare a `_.path` entry naming its own
 * `node_modules/.bin`, is a violation.
 *
 * A unit that instead routes through `pnpm exec <tool>` or
 * `pnpm --filter <unit> exec <tool>` needs no `_.path` override — pnpm
 * itself resolves the nearest `node_modules/.bin` from the invocation
 * directory — so this guard only flags the bare-name shape, never a task
 * that already goes through pnpm.
 *
 * **Tier B guard**: reads TOML through a real parser, so the job that runs it
 * installs the workspace first. See the tier amendment in
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 *
 * Usage:
 *   node scripts/ci/check-mise-unit-bin-path.mjs
 *   node scripts/ci/check-mise-unit-bin-path.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = a violation. Exit 2 = usage error.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverUnitMiseDirs } from './check-mise-tool-overrides.mjs';
import { isMapping, scalarText } from './config-parse.mjs';
import { ConfigParseError, parseToml } from './config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Bin names this repo installs into a unit's own `node_modules/.bin` that a
 * task might invoke bare. Not every devDependency binary needs an entry here
 * — only ones this repo's `mise.toml` files actually call bare today; a tool
 * always invoked through `pnpm exec`/`pnpm run` never reaches this list.
 */
export const WATCHED_TOOLS = [
  'tsc',
  'vitest',
  'oxlint',
  'oxfmt',
  'tsx',
  'vite',
  'storybook',
  'playwright',
];

/** Unit-kind base a `clients/` unit never needs this fix under — it builds through `xcodebuild`/`swift`, never `node_modules/.bin`. */
const EXCLUDED_UNIT_BASE = 'clients';

/**
 * Read every `run` value out of a parsed mise.toml's `[tasks]` table,
 * regardless of whether a task was written as `[tasks.name]`, the quoted
 * `[tasks."a:b"]` spelling, or the inline `name = { run = "..." }` shorthand
 * — a real TOML parser collapses all three to the same shape, so this reads
 * one of them.
 *
 * @param {unknown} doc
 * @returns {{ task: string, run: string }[]}
 */
export function extractTaskRuns(doc) {
  /** @type {{ task: string, run: string }[]} */
  const out = [];
  if (!isMapping(doc) || !isMapping(doc.tasks)) return out;
  for (const [task, value] of Object.entries(doc.tasks)) {
    if (!isMapping(value)) continue;
    const run = value.run;
    if (Array.isArray(run)) {
      for (const step of run) {
        const text = scalarText(step);
        if (text !== undefined) out.push({ task, run: text });
      }
    } else {
      const text = scalarText(run);
      if (text !== undefined) out.push({ task, run: text });
    }
  }
  return out;
}

/**
 * The watched tool a `run` string invokes bare, if any — the first
 * whitespace-separated token of each `&&`/`;`/`|`/newline-separated segment,
 * checked against {@link WATCHED_TOOLS}. `pnpm exec tsc`, `pnpm run build`,
 * `node dist/index.js` and `mise run -C ../x build` all have a first token
 * that is not itself a watched tool, so none of them match.
 *
 * @param {string} run
 * @returns {string[]} Every distinct watched tool invoked bare, in order.
 */
export function bareToolsIn(run) {
  const found = new Set();
  for (const segment of run.split(/&&|\||;|\n/u)) {
    const token = segment.trim().split(/\s+/u)[0];
    if (token && WATCHED_TOOLS.includes(token)) found.add(token);
  }
  return [...found];
}

/**
 * Whether a parsed mise.toml's own `[env] _.path` declares an entry naming a
 * `node_modules/.bin` dir — the shape `{{config_root}}/node_modules/.bin`
 * takes once interpolation is stripped away, and the only shape that fixes
 * this guard's finding (see the file header).
 *
 * @param {unknown} doc
 * @returns {boolean}
 */
export function declaresOwnBinPath(doc) {
  if (!isMapping(doc) || !isMapping(doc.env)) return false;
  const underscore = doc.env['_'];
  if (!isMapping(underscore)) return false;
  const path = underscore.path;
  const entries = Array.isArray(path) ? path : [path];
  return entries.some((entry) => {
    const text = scalarText(entry);
    return text !== undefined && text.includes('node_modules/.bin');
  });
}

/**
 * Check every discovered unit (pillars, pillar apps, libs — not `clients`,
 * which never resolves tools through `node_modules/.bin`) for a bare
 * watched-tool invocation with no unit-local `_.path` fix.
 *
 * @param {string} root
 * @returns {{ violations: string[] }}
 */
export function checkUnitBinPaths(root) {
  /** @type {string[]} */
  const violations = [];

  /** @type {Map<string, string[]>} */
  const filesByDir = new Map();
  for (const { dir, file } of discoverUnitMiseDirs(root)) {
    if (dir === EXCLUDED_UNIT_BASE || dir.startsWith(`${EXCLUDED_UNIT_BASE}/`)) continue;
    const files = filesByDir.get(dir) ?? [];
    files.push(file);
    filesByDir.set(dir, files);
  }

  for (const [dir, files] of filesByDir) {
    /** @type {{ task: string, run: string }[]} */
    const runs = [];
    let hasOwnBinPath = false;

    for (const file of files) {
      let doc;
      try {
        doc = parseToml(readFileSync(join(root, file), 'utf8'), file);
      } catch (error) {
        violations.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      runs.push(...extractTaskRuns(doc));
      if (declaresOwnBinPath(doc)) hasOwnBinPath = true;
    }

    if (hasOwnBinPath) continue;

    for (const { task, run } of runs) {
      for (const tool of bareToolsIn(run)) {
        violations.push(
          `${dir}: task "${task}" runs bare "${tool}" (${JSON.stringify(run)}) but declares no ` +
            '[env] _.path prepending its own node_modules/.bin — it silently runs the ROOT ' +
            "node_modules/.bin's copy instead of this unit's own (see pillars/shell/mise.toml " +
            'or libs/date/mise.toml for the fix).'
        );
      }
    }
  }

  return { violations };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-mise-unit-bin-path.mjs [--self-test]\n' +
        'Fails if a unit mise task invokes a bare watched tool name with no ' +
        "unit-local [env] _.path fix, so it silently runs the ROOT's binary."
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { violations } = checkUnitBinPaths(repoRoot);
  if (violations.length === 0) {
    console.log('OK — every unit mise task resolves its own node_modules/.bin, not the root’s.');
    process.exit(0);
  }
  for (const violation of violations) {
    console.error(`FAIL — ${violation}`);
  }
  process.exit(1);
}

/**
 * A unit with the fix already applied — a bare `vitest` task alongside its
 * own `_.path` — must not be flagged.
 *
 * @returns {boolean}
 */
function fixedUnitIsClean() {
  const dir = mkdtempSync(join(tmpdir(), 'mise-binpath-fixed-'));
  try {
    mkdirSync(join(dir, 'libs', 'ok'), { recursive: true });
    writeFileSync(
      join(dir, 'libs', 'ok', 'mise.toml'),
      '[tasks.test]\nrun = "vitest run"\n\n[env]\n_.path = ["{{config_root}}/node_modules/.bin"]\n',
      'utf8'
    );
    return checkUnitBinPaths(dir).violations.length === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A unit with no fix and a bare watched-tool task is exactly the defect this
 * guard exists to catch.
 *
 * @returns {boolean}
 */
function unfixedUnitIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'mise-binpath-unfixed-'));
  try {
    mkdirSync(join(dir, 'libs', 'rogue'), { recursive: true });
    writeFileSync(
      join(dir, 'libs', 'rogue', 'mise.toml'),
      '[tasks.test]\nrun = "vitest run"\n',
      'utf8'
    );
    const { violations } = checkUnitBinPaths(dir);
    return violations.some((v) => v.includes('libs/rogue') && v.includes('"vitest"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A watched tool buried as the second step of an array-form `run` (the
 * shape every `typecheck`/`test` task in this repo that rebuilds a
 * dependency first uses, e.g. `["mise run -C ../types build", "tsc
 * --noEmit"]`) must still be found — the defect does not only occur in
 * single-string tasks.
 *
 * @returns {boolean}
 */
function arrayFormSecondStepIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'mise-binpath-array-'));
  try {
    mkdirSync(join(dir, 'libs', 'rogue'), { recursive: true });
    writeFileSync(
      join(dir, 'libs', 'rogue', 'mise.toml'),
      '[tasks.typecheck]\nrun = ["mise run -C ../other build", "tsc --noEmit"]\n',
      'utf8'
    );
    const { violations } = checkUnitBinPaths(dir);
    return violations.some((v) => v.includes('libs/rogue') && v.includes('"tsc"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A task that already routes through `pnpm exec`/`pnpm run`/`node`/`mise
 * run` needs no `_.path` fix and must not be flagged — this guard targets
 * the bare-name shape only, not every task in a unit that lacks the env
 * override.
 *
 * @returns {boolean}
 */
function pnpmAndNodeTasksAreNotFlagged() {
  const dir = mkdtempSync(join(tmpdir(), 'mise-binpath-pnpm-'));
  try {
    mkdirSync(join(dir, 'libs', 'clean'), { recursive: true });
    writeFileSync(
      join(dir, 'libs', 'clean', 'mise.toml'),
      [
        '[tasks.test]',
        'run = "pnpm exec vitest run"',
        '',
        '[tasks.build]',
        'run = "pnpm run build:remote"',
        '',
        '[tasks.start]',
        'run = "node dist/index.js"',
        '',
      ].join('\n'),
      'utf8'
    );
    return checkUnitBinPaths(dir).violations.length === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * `clients/*` units (iOS today) build through `xcodebuild`/`swift`, never
 * `node_modules/.bin` — a bare token that happens to collide with a watched
 * name there (unlikely, but the exclusion should hold regardless) must not
 * be flagged.
 *
 * @returns {boolean}
 */
function clientsUnitIsExcluded() {
  const dir = mkdtempSync(join(tmpdir(), 'mise-binpath-clients-'));
  try {
    mkdirSync(join(dir, 'clients', 'ios'), { recursive: true });
    writeFileSync(
      join(dir, 'clients', 'ios', 'mise.toml'),
      '[tasks.test]\nrun = "vitest run"\n',
      'utf8'
    );
    return checkUnitBinPaths(dir).violations.length === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A unit mise.toml that does not parse is a violation, not a silently
 * skipped unit — the same rule every Tier B guard applies to structured
 * config it cannot read.
 *
 * @returns {boolean}
 */
function unparseableUnitIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'mise-binpath-badtoml-'));
  try {
    mkdirSync(join(dir, 'libs', 'broken'), { recursive: true });
    writeFileSync(
      join(dir, 'libs', 'broken', 'mise.toml'),
      '[tasks.test\nrun = "vitest run"\n',
      'utf8'
    );
    const { violations } = checkUnitBinPaths(dir);
    return violations.some((v) => v.includes('could not be parsed'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function selfTest() {
  try {
    parseToml('not valid toml [', 'probe');
  } catch (error) {
    if (!(error instanceof ConfigParseError)) {
      console.error('self-test FAILED: parseToml did not raise ConfigParseError on bad input');
      return false;
    }
  }

  const checks = {
    'a unit whose own [env] _.path fixes the defect is clean': fixedUnitIsClean(),
    'a unit with no fix and a bare watched tool is reported': unfixedUnitIsReported(),
    'a bare watched tool buried in the second step of an array run is reported':
      arrayFormSecondStepIsReported(),
    'pnpm exec / pnpm run / node / mise run tasks are never flagged':
      pnpmAndNodeTasksAreNotFlagged(),
    'a clients/ unit is excluded entirely': clientsUnitIsExcluded(),
    'an unparseable unit mise.toml is a violation, not a skipped unit': unparseableUnitIsReported(),
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(`self-test FAILED: ${failed.map(([name]) => name).join('; ')}`);
    return false;
  }
  console.log(`self-test OK — ${Object.keys(checks).length} assertions passed.`);
  return true;
}

if (import.meta.main) {
  main();
}
