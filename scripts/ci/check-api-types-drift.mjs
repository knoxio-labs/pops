#!/usr/bin/env node
/**
 * Generated OpenAPI type-map drift guard.
 *
 * Nine pillars (ai, cerebrum, finance, food, inventory, lists, media,
 * purchases, registry) each carry a
 * `pillars/<id>/scripts/generate-api-types.ts` that runs `openapi-typescript`
 * against the pillar's committed OpenAPI snapshot and writes
 * `src/contract/api-types.generated.ts` — the `paths`/`components` types a
 * frontend composes with `openapi-fetch` for typed HTTP calls without
 * importing anything server-internal. Every one of the nine exposes this via
 * a `generate:api-types` script.
 *
 * This is a DIFFERENT artefact from the Hey API clients
 * `scripts/ci/check-generated-clients.mjs` already guards: that script's
 * `generate:*` commands invoke the `openapi-ts` CLI binary directly and take
 * a `--write <dir>` argument on the command line. This one runs a
 * project-local TS script (`tsx scripts/generate-api-types.ts`) that calls
 * the `openapi-typescript` library function itself and writes a path baked
 * into the script, not passed as a CLI argument — so it needs its own
 * discovery and its own runner rather than an extension of the Hey API one.
 * See that script's header for why it deliberately excludes
 * `generate:api-types` as producing "other artefacts entirely".
 *
 * Discovery reads each `pillars/<id>/package.json` rather than a hardcoded
 * list: a unit counts when its `generate:api-types` script is exactly
 * `tsx scripts/generate-api-types.ts`. The output path is then DERIVED from
 * the unit's own `exports['./api-types'].types` field (its declared build
 * output, `./dist/<subpath>.d.ts`) by swapping `dist` for `src` and `.d.ts`
 * for `.ts` — the same source/dist pairing every one of these pillars'
 * `build` script already relies on, so a moved contract directory cannot
 * drift from what this guard checks without first breaking that pillar's
 * own build.
 *
 * Usage:
 *   node scripts/ci/check-api-types-drift.mjs [--pkg <name>]
 *   node scripts/ci/check-api-types-drift.mjs --self-test
 *
 * Exit 0 = every discovered api-types module matches its OpenAPI spec, no
 * drift. Exit 1 = a violation, or discovery/filtering matched nothing.
 * Exit 2 = usage error.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const SCRIPT_NAME = 'generate:api-types';
const GENERATOR_COMMAND = 'tsx scripts/generate-api-types.ts';
const API_TYPES_EXPORT = './api-types';

/**
 * @typedef {object} ApiTypesTarget
 * @property {string} pkgName    npm package name from the unit's `package.json`.
 * @property {string} pkgDir     Unit directory, relative to repo root, posix-separated.
 * @property {string} command    The script's raw command string.
 * @property {string | null} outputPath
 *   Where the generator writes, relative to `pkgDir`, derived from the
 *   unit's `exports['./api-types'].types` field — or null when that field
 *   is missing or an unrecognised shape, so this generator's output cannot
 *   be verified.
 */

/**
 * Derive the source file a unit's `generate:api-types` script is supposed to
 * write, from the SAME `exports['./api-types']` mapping its `build` script
 * already depends on: `./dist/contract/api-types.generated.d.ts` (the
 * compiled types a consumer imports) implies
 * `src/contract/api-types.generated.ts` (the source `tsc` compiles it from).
 * Generalised over the subpath rather than hardcoded to `contract/`, so a
 * pillar that nests its contract elsewhere is still covered.
 *
 * @param {unknown} manifest Parsed `package.json`.
 * @returns {string | null}
 */
export function deriveOutputPath(manifest) {
  if (typeof manifest !== 'object' || manifest === null) return null;
  const exportsField = /** @type {{ exports?: unknown }} */ (manifest).exports;
  if (typeof exportsField !== 'object' || exportsField === null) return null;
  const apiTypesExport = /** @type {Record<string, unknown>} */ (exportsField)[API_TYPES_EXPORT];
  if (typeof apiTypesExport !== 'object' || apiTypesExport === null) return null;
  const typesPath = /** @type {{ types?: unknown }} */ (apiTypesExport).types;
  if (typeof typesPath !== 'string') return null;
  const match = /^\.\/dist\/(.+)\.d\.ts$/u.exec(typesPath);
  return match === null ? null : `src/${match[1]}.ts`;
}

/**
 * @param {string} root
 * @param {string} pkgDir Relative to root, posix-separated.
 * @returns {ApiTypesTarget | null}
 */
function scanUnit(root, pkgDir) {
  const pkgJsonPath = join(root, pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return null;
  /** @type {{ name?: unknown, scripts?: Record<string, unknown> }} */
  const manifest = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (typeof manifest.name !== 'string') return null;
  const command = manifest.scripts?.[SCRIPT_NAME];
  if (typeof command !== 'string' || command.trim() !== GENERATOR_COMMAND) return null;

  return {
    pkgName: manifest.name,
    pkgDir,
    command,
    outputPath: deriveOutputPath(manifest),
  };
}

/**
 * Every `pillars/<id>` unit — the only unit kind this generator lives in
 * (unlike the Hey API clients, which also live under `pillars/<id>/app` and
 * `libs/<lib>`).
 *
 * @param {string} root
 * @returns {string[]} Relative, posix-separated, sorted.
 */
export function discoverCandidateDirs(root) {
  const pillarsDir = join(root, 'pillars');
  if (!existsSync(pillarsDir)) return [];
  return readdirSync(pillarsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `pillars/${entry.name}`)
    .toSorted((a, b) => a.localeCompare(b));
}

/** @param {string} root @returns {ApiTypesTarget[]} */
export function discoverApiTypesTargets(root) {
  return discoverCandidateDirs(root)
    .map((dir) => scanUnit(root, dir))
    .filter((/** @type {ApiTypesTarget | null} */ target) => target !== null);
}

/**
 * The exact set of pillars that own a `generate:api-types` script today. A
 * bare discovery floor only catches losing every target; this catches
 * losing (or gaining) any one — the same reasoning
 * `check-generated-clients.mjs`'s `EXPECTED_TARGETS` documents, kept honest
 * by `findExpectedTargetSetViolations` running on every real invocation of
 * this guard, not only in the sibling Vitest suite. Adding or removing a
 * pillar's api-types generator means editing this list in the same commit.
 *
 * @type {string[]}
 */
export const EXPECTED_TARGETS = [
  '@pops/ai',
  '@pops/cerebrum',
  '@pops/finance',
  '@pops/food',
  '@pops/inventory',
  '@pops/lists',
  '@pops/media',
  '@pops/purchases',
  '@pops/registry',
];

/**
 * Compares a freshly discovered, unfiltered target set against
 * `EXPECTED_TARGETS` and reports every discrepancy: an expected target that
 * did not come back, one that was not expected at all, and two units that
 * collided on the same package name. Returns an empty array only when the
 * two sets match exactly.
 *
 * @param {ApiTypesTarget[]} targets Full, unfiltered discovery — not scoped by `--pkg`.
 * @returns {string[]}
 */
export function findExpectedTargetSetViolations(targets) {
  /** @type {string[]} */
  const messages = [];

  /** @type {Map<string, ApiTypesTarget>} */
  const discovered = new Map();
  for (const target of targets) {
    const existing = discovered.get(target.pkgName);
    if (existing !== undefined) {
      messages.push(
        `discovered ${target.pkgName} twice — once from ${existing.pkgDir}, once from ` +
          `${target.pkgDir} — two units declare the same package name.`
      );
      continue;
    }
    discovered.set(target.pkgName, target);
  }

  const expectedSet = new Set(EXPECTED_TARGETS);
  for (const pkgName of EXPECTED_TARGETS) {
    if (!discovered.has(pkgName)) {
      messages.push(
        `expected target ${pkgName} was not discovered — its generate:api-types script was ` +
          'renamed, removed, or its command no longer matches the known invocation.'
      );
    }
  }
  for (const pkgName of discovered.keys()) {
    if (!expectedSet.has(pkgName)) {
      messages.push(
        `discovered ${pkgName}, which is not in EXPECTED_TARGETS — add it there once its ` +
          'generated api-types module is committed.'
      );
    }
  }
  return messages;
}

/**
 * @typedef {object} Violation
 * @property {ApiTypesTarget} target
 * @property {'malformed' | 'generator-error' | 'no-output' | 'drift'} kind
 * @property {string} message
 */

/**
 * Classify one regeneration outcome. Every branch produces a distinct,
 * named violation — "nothing happened" is never treated as success.
 *
 * @param {ApiTypesTarget} target
 * @param {{ exitCode: number, exists: boolean | null, gitDiff: string | null }} outcome
 * @returns {Violation | null}
 */
export function classifyOutcome(target, { exitCode, exists, gitDiff }) {
  if (target.outputPath === null) {
    return {
      target,
      kind: 'malformed',
      message:
        `${target.pkgName} ${SCRIPT_NAME} ("${target.command}") — cannot derive its output path ` +
        `from exports['${API_TYPES_EXPORT}'].types; cannot verify its output.`,
    };
  }
  if (exitCode !== 0) {
    return {
      target,
      kind: 'generator-error',
      message: `${target.pkgName} ${SCRIPT_NAME} exited ${exitCode}.`,
    };
  }
  if (exists !== true) {
    return {
      target,
      kind: 'no-output',
      message:
        `${target.pkgName} ${SCRIPT_NAME} produced no file at ` +
        `${target.pkgDir}/${target.outputPath} — regeneration silently failed.`,
    };
  }
  if (gitDiff !== null && gitDiff.trim().length > 0) {
    return {
      target,
      kind: 'drift',
      message:
        `${target.pkgDir}/${target.outputPath} is out of date. Run ` +
        `'pnpm --filter ${target.pkgName} ${SCRIPT_NAME}' and commit the result.\n${gitDiff}`,
    };
  }
  return null;
}

/**
 * @typedef {object} Runner
 * @property {(target: ApiTypesTarget, repoRoot: string) => number} generate
 * @property {(target: ApiTypesTarget, repoRoot: string) => boolean | null} outputExists
 * @property {(target: ApiTypesTarget, repoRoot: string) => string} gitDiff
 */

/** @type {Runner} */
export const realRunner = {
  generate(target, root) {
    const result = spawnSync('pnpm', ['--filter', target.pkgName, SCRIPT_NAME], {
      cwd: root,
      stdio: 'inherit',
    });
    return result.status ?? 1;
  },
  outputExists(target, root) {
    if (target.outputPath === null) return null;
    return existsSync(join(root, target.pkgDir, target.outputPath));
  },
  gitDiff(target, root) {
    const relPath = `${target.pkgDir}/${target.outputPath}`;
    execFileSync('git', ['add', '--intent-to-add', relPath], { cwd: root });
    return execFileSync('git', ['diff', '--', relPath], { cwd: root, encoding: 'utf8' });
  },
};

/**
 * Regenerate one target and classify the outcome. Pure orchestration over an
 * injectable `Runner`, so tests can simulate a generator that errors, writes
 * nothing, or writes something git already has — without a real pnpm/git
 * toolchain.
 *
 * @param {ApiTypesTarget} target
 * @param {string} root
 * @param {Runner} runner
 * @returns {Violation | null}
 */
export function runTarget(target, root, runner) {
  if (target.outputPath === null) {
    return classifyOutcome(target, { exitCode: 0, exists: null, gitDiff: null });
  }
  const exitCode = runner.generate(target, root);
  const exists = runner.outputExists(target, root);
  const gitDiff = exitCode === 0 && exists === true ? runner.gitDiff(target, root) : null;
  return classifyOutcome(target, { exitCode, exists, gitDiff });
}

/** @returns {boolean} */
function selfTestDiscovery() {
  const root = mkdtempSync(join(tmpdir(), 'api-types-discovery-'));
  try {
    mkdirSync(join(root, 'pillars', 'widgets'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'widgets', 'package.json'),
      JSON.stringify({
        name: '@pops/widgets',
        scripts: { 'generate:api-types': GENERATOR_COMMAND },
        exports: {
          './api-types': {
            types: './dist/contract/api-types.generated.d.ts',
            default: './dist/contract/api-types.generated.js',
          },
        },
      })
    );

    mkdirSync(join(root, 'pillars', 'broken'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'broken', 'package.json'),
      JSON.stringify({
        name: '@pops/broken',
        scripts: { 'generate:api-types': GENERATOR_COMMAND },
        // No `exports['./api-types']` — output path cannot be derived.
      })
    );

    mkdirSync(join(root, 'pillars', 'decoy'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'decoy', 'package.json'),
      JSON.stringify({
        name: '@pops/decoy',
        scripts: {
          'generate:openapi': 'tsx scripts/generate-openapi.ts',
          'generate:manifest': 'tsx scripts/generate-manifest.ts',
        },
      })
    );

    // A pillars/<id>/app unit must NOT be scanned — this generator only
    // ever lives at the pillar root, unlike the Hey API clients.
    mkdirSync(join(root, 'pillars', 'widgets', 'app'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'widgets', 'app', 'package.json'),
      JSON.stringify({ name: '@pops/app-widgets', scripts: {} })
    );

    const targets = discoverApiTypesTargets(root);
    const byPkg = new Map(targets.map((t) => [t.pkgName, t]));

    const checks = {
      'finds the well-formed target':
        byPkg.get('@pops/widgets')?.outputPath === 'src/contract/api-types.generated.ts',
      'flags the malformed target (no derivable output path)':
        byPkg.get('@pops/broken')?.outputPath === null,
      'ignores a unit with no generate:api-types script': !byPkg.has('@pops/decoy'),
      'never scans pillars/<id>/app': !byPkg.has('@pops/app-widgets'),
      'finds exactly 2 targets': targets.length === 2,
    };
    const ok = Object.values(checks).every(Boolean);
    if (!ok) {
      console.error('SELF-TEST FAILED (discovery):');
      for (const [name, pass] of Object.entries(checks)) console.error(`  ${name}: ${pass}`);
    } else {
      console.log(
        'self-test OK — discovers a well-formed target, flags a malformed one, ignores decoys, ' +
          'never scans pillars/<id>/app.'
      );
    }
    return ok;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function selfTestOutcomes() {
  /** @type {ApiTypesTarget} */
  const target = {
    pkgName: '@pops/widgets',
    pkgDir: 'pillars/widgets',
    command: GENERATOR_COMMAND,
    outputPath: 'src/contract/api-types.generated.ts',
  };
  /** @type {ApiTypesTarget} */
  const malformedTarget = { ...target, outputPath: null };

  const scenarios = {
    'catches a malformed target (no derivable output path)': () =>
      runTarget(malformedTarget, '/repo', {
        generate: () => 0,
        outputExists: () => true,
        gitDiff: () => '',
      })?.kind === 'malformed',
    'catches a generator that errors': () =>
      runTarget(target, '/repo', {
        generate: () => 1,
        outputExists: () => false,
        gitDiff: () => {
          throw new Error('must not be called when the generator already failed');
        },
      })?.kind === 'generator-error',
    'catches output that never landed': () =>
      runTarget(target, '/repo', {
        generate: () => 0,
        outputExists: () => false,
        gitDiff: () => {
          throw new Error('must not be called when there is nothing to diff');
        },
      })?.kind === 'no-output',
    'catches drift against the committed module': () =>
      runTarget(target, '/repo', {
        generate: () => 0,
        outputExists: () => true,
        gitDiff: () => '--- a/x\n+++ b/x\n',
      })?.kind === 'drift',
    'passes a clean regeneration': () =>
      runTarget(target, '/repo', {
        generate: () => 0,
        outputExists: () => true,
        gitDiff: () => '',
      }) === null,
  };

  const results = Object.fromEntries(Object.entries(scenarios).map(([name, run]) => [name, run()]));
  const ok = Object.values(results).every(Boolean);
  if (!ok) {
    console.error('SELF-TEST FAILED (outcomes):');
    for (const [name, pass] of Object.entries(results)) console.error(`  ${name}: ${pass}`);
  } else {
    console.log(
      'self-test OK — reports malformed/generator-error/no-output/drift, passes a clean run.'
    );
  }
  return ok;
}

/** @param {string} pkgName @returns {ApiTypesTarget} */
function fullTargetFor(pkgName) {
  return {
    pkgName,
    pkgDir: 'pillars/x',
    command: GENERATOR_COMMAND,
    outputPath: 'src/contract/api-types.generated.ts',
  };
}

/** @returns {boolean} */
function selfTestExpectedTargetSet() {
  const clean = EXPECTED_TARGETS.map(fullTargetFor);
  const missingOne = clean.slice(1);
  const droppedPkg = EXPECTED_TARGETS[0];
  const withExtra = [...clean, fullTargetFor('@pops/bogus')];
  const collidingTarget = clean[1];
  const duplicatePkg = [{ ...collidingTarget, pkgDir: 'pillars/other' }, ...clean];

  const scenarios = {
    'passes when the discovered set matches EXPECTED_TARGETS exactly':
      findExpectedTargetSetViolations(clean).length === 0,
    'reports a dropped target instead of silently passing': findExpectedTargetSetViolations(
      missingOne
    ).some((message) => message.includes(droppedPkg)),
    'reports a target that is not in EXPECTED_TARGETS': findExpectedTargetSetViolations(
      withExtra
    ).some((message) => message.includes('@pops/bogus')),
    'reports two units colliding on the same package name instead of silently keeping one':
      findExpectedTargetSetViolations(duplicatePkg).some(
        (message) =>
          message.includes(collidingTarget.pkgName) &&
          message.includes('pillars/other') &&
          message.includes(collidingTarget.pkgDir)
      ),
  };

  const ok = Object.values(scenarios).every(Boolean);
  if (!ok) {
    console.error('SELF-TEST FAILED (expected target set):');
    for (const [name, pass] of Object.entries(scenarios)) console.error(`  ${name}: ${pass}`);
  } else {
    console.log(
      'self-test OK — pinned target set catches a dropped target, an unexpected one, and two ' +
        'units colliding on the same package name.'
    );
  }
  return ok;
}

/** @returns {boolean} */
function selfTest() {
  const discovery = selfTestDiscovery();
  const outcomes = selfTestOutcomes();
  const expectedTargetSet = selfTestExpectedTargetSet();
  return discovery && outcomes && expectedTargetSet;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-api-types-drift.mjs [--pkg <name>]\n' +
        '       node scripts/ci/check-api-types-drift.mjs --self-test\n\n' +
        'Regenerates every generate:api-types script found under pillars/*/package.json and\n' +
        'fails on drift, a missing output file, a generator error, or a script whose output\n' +
        'path cannot be derived from its exports.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const pkgFlagIndex = args.indexOf('--pkg');
  const pkgFilter = pkgFlagIndex === -1 ? null : (args[pkgFlagIndex + 1] ?? null);

  const allTargets = discoverApiTypesTargets(repoRoot);

  const expectedSetViolations = findExpectedTargetSetViolations(allTargets);
  if (expectedSetViolations.length > 0) {
    console.error(
      `FAIL — discovered target set does not match the ${EXPECTED_TARGETS.length} pinned in ` +
        'EXPECTED_TARGETS (scripts/ci/check-api-types-drift.mjs):'
    );
    for (const message of expectedSetViolations) console.error(`  ${message}`);
    process.exit(1);
  }

  let targets = allTargets;
  if (pkgFilter !== null) targets = targets.filter((t) => t.pkgName === pkgFilter);

  if (targets.length === 0) {
    const scope = pkgFilter !== null ? `for --pkg ${pkgFilter}` : '';
    console.error(
      `FAIL — discovered zero generate:api-types scripts ${scope}. ` +
        'Discovery is broken, or the filter matched nothing.'
    );
    process.exit(1);
  }

  /** @type {Violation[]} */
  const violations = [];
  for (const target of targets) {
    console.log(`::group::${target.pkgName} ${SCRIPT_NAME}`);
    const violation = runTarget(target, repoRoot, realRunner);
    if (violation) violations.push(violation);
    console.log('::endgroup::');
  }

  if (violations.length > 0) {
    console.error(`FAIL — ${violations.length} api-types drift problem(s):`);
    for (const violation of violations) console.error(`  [${violation.kind}] ${violation.message}`);
    process.exit(1);
  }

  console.log(
    `OK — ${targets.length} generated api-types module(s) match their OpenAPI spec, no drift.`
  );
  process.exit(0);
}

if (import.meta.main) {
  main();
}
