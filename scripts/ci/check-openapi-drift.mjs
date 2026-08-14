#!/usr/bin/env node
/**
 * Committed OpenAPI spec drift guard.
 *
 * Eleven pillars declare `generate:openapi` (`tsx scripts/generate-openapi.ts`),
 * which calls the one shared projection every pillar uses —
 * `@pops/contract-openapi`'s `writePillarOpenApi` — to turn the pillar's
 * ts-rest contract into a byte-stable snapshot at the hardcoded path
 * `<packageDir>/openapi/<pillarId>.openapi.json` (see
 * `libs/contract-openapi/src/write-pillar-openapi.ts`, which also asserts
 * `pillarId` matches the package name). That path convention is a property
 * of the shared library every one of these scripts calls, not a per-pillar
 * choice, so this guard derives the output file from the pillar's own
 * directory name rather than reading it out of `package.json` — there is
 * nothing there to read; several of these pillars (`documents`) declare no
 * `exports` field at all.
 *
 * That committed snapshot is the root of a contract chain other guards
 * already police rigorously: `check-api-types-drift.mjs` regenerates a
 * TypeScript type map FROM it, `check-generated-clients.mjs` and the
 * `cross-pillar-clients` job regenerate FE clients from it, and
 * `check-vendored-contracts.mjs` (ADR-033) diffs vendored copies of it. None
 * of them verify the snapshot itself agrees with the contract source it
 * claims to project — this guard is the one that does.
 *
 * Unlike its Tier A siblings, this one needs a build. `generate-openapi.ts`
 * imports `@pops/contract-openapi` (and, transitively through the pillar's
 * own contract module, `@pops/types`/`@pops/pillar-settings`/`@pops/pillar-sdk`
 * /`@pops/ai-telemetry`/`@pops/pillar-express`) from each dependency's
 * `dist/`, which `pnpm install` alone does not produce — only `node_modules`
 * symlinks to workspace source. Working out the minimal build closure
 * per-pillar was tried and abandoned: it is roughly six shared packages plus
 * each pillar's own runtime deps, and differs pillar to pillar. The
 * `openapi-drift` job in `quality.yml` instead runs `pnpm build` once
 * (`tsc -b tsconfig.build.json`, the same whole-graph build `exports`
 * already runs on push to `main`) before invoking this script — measured at
 * ~23s cold in this repo, once, for all eleven pillars, which is cheaper
 * than working out and maintaining eleven separate minimal closures.
 *
 * Discovery reads each `pillars/<id>/package.json` rather than a hardcoded
 * list: a unit counts when its `generate:openapi` script is exactly
 * `tsx scripts/generate-openapi.ts`. `EXPECTED_TARGETS` below is the second,
 * independent line of defence — the exact pillar set this repo owns today,
 * checked on every real invocation (not only in the sibling Vitest suite)
 * AND, per ADR-045 and the `check-vendored-contracts.mjs` precedent
 * (`KNOWN_VENDORED_LEGS`), inside `--self-test` itself: `selfTestRealRepo`
 * below runs discovery against the actual repo tree and compares it to this
 * literal, so a discovery regression fails the self-test that
 * `agent-review.yml`/`quality.yml` preflight steps run, not only the
 * separate real invocation later in the same job.
 *
 * Usage:
 *   node scripts/ci/check-openapi-drift.mjs [--pkg <name>]
 *   node scripts/ci/check-openapi-drift.mjs --self-test
 *
 * Exit 0 = every discovered pillar's committed OpenAPI spec matches its
 * contract source, no drift. Exit 1 = a violation, or discovery/filtering
 * matched nothing. Exit 2 = usage error.
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

const SCRIPT_NAME = 'generate:openapi';
const GENERATOR_COMMAND = 'tsx scripts/generate-openapi.ts';

/**
 * @typedef {object} OpenApiTarget
 * @property {string} pkgName   npm package name from the unit's `package.json`.
 * @property {string} pkgDir    Unit directory, relative to repo root, posix-separated.
 * @property {string} pillarId  The `pillars/<id>` segment.
 * @property {string} command   The script's raw command string.
 * @property {string} outputPath
 *   Where `writePillarOpenApi` writes, relative to `pkgDir`:
 *   `openapi/<pillarId>.openapi.json`. Never null — unlike the sibling
 *   guards that derive a path out of `exports`, this one is a hardcoded
 *   convention owned by the shared library, not a per-unit declaration that
 *   can be malformed or absent.
 */

/**
 * @param {string} root
 * @param {string} pkgDir Relative to root, posix-separated — `pillars/<id>`.
 * @returns {OpenApiTarget | null}
 */
function scanUnit(root, pkgDir) {
  const pkgJsonPath = join(root, pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return null;
  /** @type {{ name?: unknown, scripts?: Record<string, unknown> }} */
  const manifest = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (typeof manifest.name !== 'string') return null;
  const command = manifest.scripts?.[SCRIPT_NAME];
  if (typeof command !== 'string' || command.trim() !== GENERATOR_COMMAND) return null;

  const pillarId = pkgDir.slice('pillars/'.length);
  return {
    pkgName: manifest.name,
    pkgDir,
    pillarId,
    command,
    outputPath: `openapi/${pillarId}.openapi.json`,
  };
}

/**
 * Every `pillars/<id>` unit — the only unit kind `generate-openapi.ts` lives
 * in.
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

/** @param {string} root @returns {OpenApiTarget[]} */
export function discoverOpenApiTargets(root) {
  return discoverCandidateDirs(root)
    .map((dir) => scanUnit(root, dir))
    .filter((/** @type {OpenApiTarget | null} */ target) => target !== null);
}

/**
 * The exact set of pillars that own a `generate:openapi` script today. A
 * bare discovery floor only catches losing every target; this catches
 * losing (or gaining) any one — the same reasoning
 * `check-api-types-drift.mjs`'s and `check-generated-clients.mjs`'s
 * `EXPECTED_TARGETS` document, kept honest by `findExpectedTargetSetViolations`
 * running on every real invocation of this guard, not only in the sibling
 * Vitest suite or `selfTestRealRepo`. Adding or removing a pillar's OpenAPI
 * generator means editing this list in the same commit.
 *
 * @type {string[]}
 */
export const EXPECTED_TARGETS = [
  '@pops/ai',
  '@pops/bfm',
  '@pops/cerebrum',
  '@pops/documents',
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
 * @param {OpenApiTarget[]} targets Full, unfiltered discovery — not scoped by `--pkg`.
 * @returns {string[]}
 */
export function findExpectedTargetSetViolations(targets) {
  /** @type {string[]} */
  const messages = [];

  /** @type {Map<string, OpenApiTarget>} */
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
        `expected target ${pkgName} was not discovered — its generate:openapi script was ` +
          'renamed, removed, or its command no longer matches the known invocation.'
      );
    }
  }
  for (const pkgName of discovered.keys()) {
    if (!expectedSet.has(pkgName)) {
      messages.push(
        `discovered ${pkgName}, which is not in EXPECTED_TARGETS — add it there once its ` +
          'generated OpenAPI spec is committed.'
      );
    }
  }
  return messages;
}

/**
 * @typedef {object} Violation
 * @property {OpenApiTarget} target
 * @property {'generator-error' | 'no-output' | 'drift'} kind
 * @property {string} message
 */

/**
 * Classify one regeneration outcome. Every branch produces a distinct,
 * named violation — "nothing happened" is never treated as success.
 *
 * @param {OpenApiTarget} target
 * @param {{ exitCode: number, exists: boolean | null, gitDiff: string | null }} outcome
 * @returns {Violation | null}
 */
export function classifyOutcome(target, { exitCode, exists, gitDiff }) {
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
        `${target.pkgDir}/${target.outputPath} is out of date with its contract source. Run ` +
        `'pnpm --filter ${target.pkgName} ${SCRIPT_NAME}' and commit the result.\n${gitDiff}`,
    };
  }
  return null;
}

/**
 * @typedef {object} Runner
 * @property {(target: OpenApiTarget, repoRoot: string) => number} generate
 * @property {(target: OpenApiTarget, repoRoot: string) => boolean} outputExists
 * @property {(target: OpenApiTarget, repoRoot: string) => string} gitDiff
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
 * injectable `Runner`, so tests can simulate a generator that errors or
 * writes nothing without a real pnpm/git toolchain.
 *
 * @param {OpenApiTarget} target
 * @param {string} root
 * @param {Runner} runner
 * @returns {Violation | null}
 */
export function runTarget(target, root, runner) {
  const exitCode = runner.generate(target, root);
  const exists = exitCode === 0 ? runner.outputExists(target, root) : false;
  const gitDiff = exitCode === 0 && exists ? runner.gitDiff(target, root) : null;
  return classifyOutcome(target, { exitCode, exists, gitDiff });
}

/** @returns {boolean} */
function selfTestDiscovery() {
  const root = mkdtempSync(join(tmpdir(), 'openapi-drift-discovery-'));
  try {
    mkdirSync(join(root, 'pillars', 'widgets'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'widgets', 'package.json'),
      JSON.stringify({ name: '@pops/widgets', scripts: { 'generate:openapi': GENERATOR_COMMAND } })
    );

    mkdirSync(join(root, 'pillars', 'decoy'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'decoy', 'package.json'),
      JSON.stringify({
        name: '@pops/decoy',
        scripts: {
          'generate:api-types': 'tsx scripts/generate-api-types.ts',
          'generate:manifest': 'tsx scripts/generate-manifest.ts',
        },
      })
    );

    mkdirSync(join(root, 'pillars', 'different-command'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'different-command', 'package.json'),
      JSON.stringify({
        name: '@pops/different-command',
        scripts: { 'generate:openapi': 'tsx scripts/generate-legacy-openapi.ts' },
      })
    );

    // A pillars/<id>/app unit must NOT be scanned — generate-openapi.ts
    // only ever lives at the pillar root.
    mkdirSync(join(root, 'pillars', 'widgets', 'app'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'widgets', 'app', 'package.json'),
      JSON.stringify({
        name: '@pops/app-widgets',
        scripts: { 'generate:openapi': GENERATOR_COMMAND },
      })
    );

    const targets = discoverOpenApiTargets(root);
    const byPkg = new Map(targets.map((t) => [t.pkgName, t]));

    const checks = {
      'finds the well-formed target':
        byPkg.get('@pops/widgets')?.outputPath === 'openapi/widgets.openapi.json',
      'ignores a unit whose generate:openapi command does not match':
        !byPkg.has('@pops/different-command'),
      'ignores a unit with no generate:openapi script': !byPkg.has('@pops/decoy'),
      'never scans pillars/<id>/app': !byPkg.has('@pops/app-widgets'),
      'finds exactly 1 target': targets.length === 1,
    };
    const ok = Object.values(checks).every(Boolean);
    if (!ok) {
      console.error('SELF-TEST FAILED (discovery):');
      for (const [name, pass] of Object.entries(checks)) console.error(`  ${name}: ${pass}`);
    } else {
      console.log(
        'self-test OK — discovers the well-formed target, ignores a command mismatch and ' +
          'decoys, never scans pillars/<id>/app.'
      );
    }
    return ok;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function selfTestOutcomes() {
  /** @type {OpenApiTarget} */
  const target = {
    pkgName: '@pops/widgets',
    pkgDir: 'pillars/widgets',
    pillarId: 'widgets',
    command: GENERATOR_COMMAND,
    outputPath: 'openapi/widgets.openapi.json',
  };

  const scenarios = {
    'catches a generator that errors': () =>
      runTarget(target, '/repo', {
        generate: () => 1,
        outputExists: () => {
          throw new Error('must not be called when the generator already failed');
        },
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
    'catches drift against the committed spec': () =>
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
    console.log('self-test OK — reports generator-error/no-output/drift, passes a clean run.');
  }
  return ok;
}

/** @param {string} pkgName @returns {OpenApiTarget} */
function fullTargetFor(pkgName) {
  const pillarId = pkgName.slice('@pops/'.length);
  return {
    pkgName,
    pkgDir: `pillars/${pillarId}`,
    pillarId,
    command: GENERATOR_COMMAND,
    outputPath: `openapi/${pillarId}.openapi.json`,
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

/**
 * Runs discovery against the ACTUAL repo tree — not a synthetic fixture —
 * and checks it against `EXPECTED_TARGETS`. `selfTestDiscovery` and
 * `selfTestExpectedTargetSet` above only ever exercise fixtures or synthetic
 * data; neither would notice `SCRIPT_NAME`/`GENERATOR_COMMAND` silently
 * losing the ability to match a real pillar's `package.json` (e.g. a typo
 * introduced while editing this file). This half is the one that actually
 * runs `discoverOpenApiTargets(repoRoot)`, so a discovery regression fails
 * by name in the same `--self-test` invocation the guard's CI job runs as a
 * preflight — mirroring `check-vendored-contracts.mjs`'s `selfTestLegSet`,
 * added for exactly this reason (see its doc comment and POPS-2181).
 *
 * @returns {boolean}
 */
function selfTestRealRepo() {
  const discovered = discoverOpenApiTargets(repoRoot)
    .map((t) => t.pkgName)
    .toSorted();
  const expected = [...EXPECTED_TARGETS].toSorted();

  const missing = expected.filter((pkgName) => !discovered.includes(pkgName));
  const extra = discovered.filter((pkgName) => !expected.includes(pkgName));
  const ok = missing.length === 0 && extra.length === 0;

  if (!ok) {
    console.error(
      'SELF-TEST FAILED (real repo): discovered pillars do not match EXPECTED_TARGETS.'
    );
    for (const pkgName of missing) console.error(`  missing (pinned, not discovered): ${pkgName}`);
    for (const pkgName of extra) console.error(`  extra (discovered, not pinned):    ${pkgName}`);
    console.error(
      '  if this is a deliberate addition/removal, update EXPECTED_TARGETS in the same commit; ' +
        'if it is not, discovery has stopped seeing a real pillar.'
    );
  } else {
    console.log(
      `self-test OK — discovers exactly the ${expected.length} pillars EXPECTED_TARGETS pins, ` +
        'against the real repo tree.'
    );
  }
  return ok;
}

/** @returns {boolean} */
function selfTest() {
  const discovery = selfTestDiscovery();
  const outcomes = selfTestOutcomes();
  const expectedTargetSet = selfTestExpectedTargetSet();
  const realRepo = selfTestRealRepo();
  return discovery && outcomes && expectedTargetSet && realRepo;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-openapi-drift.mjs [--pkg <name>]\n' +
        '       node scripts/ci/check-openapi-drift.mjs --self-test\n\n' +
        'Regenerates every generate:openapi script found under pillars/*/package.json and fails\n' +
        'on drift against the committed spec, a generator error, or a missing output file.\n' +
        'Requires the workspace to already be built (dist/ present for @pops/contract-openapi\n' +
        'and its dependents) — run `pnpm build` first.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const pkgFlagIndex = args.indexOf('--pkg');
  const pkgFilter = pkgFlagIndex === -1 ? null : (args[pkgFlagIndex + 1] ?? null);

  const allTargets = discoverOpenApiTargets(repoRoot);

  const expectedSetViolations = findExpectedTargetSetViolations(allTargets);
  if (expectedSetViolations.length > 0) {
    console.error(
      `FAIL — discovered target set does not match the ${EXPECTED_TARGETS.length} pinned in ` +
        'EXPECTED_TARGETS (scripts/ci/check-openapi-drift.mjs):'
    );
    for (const message of expectedSetViolations) console.error(`  ${message}`);
    process.exit(1);
  }

  let targets = allTargets;
  if (pkgFilter !== null) targets = targets.filter((t) => t.pkgName === pkgFilter);

  if (targets.length === 0) {
    const scope = pkgFilter !== null ? `for --pkg ${pkgFilter}` : '';
    console.error(
      `FAIL — discovered zero generate:openapi scripts ${scope}. ` +
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
    console.error(`FAIL — ${violations.length} OpenAPI spec drift problem(s):`);
    for (const violation of violations) console.error(`  [${violation.kind}] ${violation.message}`);
    process.exit(1);
  }

  console.log(
    `OK — ${targets.length} committed OpenAPI spec(s) match their contract source, no drift.`
  );
  process.exit(0);
}

if (import.meta.main) {
  main();
}
