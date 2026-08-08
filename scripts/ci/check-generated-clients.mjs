#!/usr/bin/env node
/**
 * Generated Hey API client drift guard.
 *
 * Every pillar/app frontend that talks to its own pillar, or to a sibling
 * pillar's contract (ADR-040), does so over a generated Hey API client —
 * checked-in output of `@hey-api/openapi-ts`, not built at image time. This
 * guard discovers every `generate:*` script in the workspace that runs the
 * Hey API generator, re-runs it, and fails on drift.
 *
 * Discovery is driven from each unit's `package.json`, not a hardcoded list:
 * a `generate:*` script counts as a Hey API client generator when one of its
 * `&&`-separated steps is literally the `openapi-ts` binary — the shape every
 * such script in this repo uses (`openapi-ts [...] && oxfmt --write <dir>`).
 * That excludes the unrelated `generate:openapi` / `generate:manifest` /
 * `generate:api-types` / `generate:prompt-catalog` scripts pillars also
 * declare, which produce other artefacts entirely.
 *
 * Candidate units are `pillars/<id>/app` (own-pillar and cross-pillar
 * consumer clients), `pillars/<id>` (a pillar-level client, e.g. the shell's
 * registry client) and `libs/<lib>` (a library-level client, e.g.
 * overlay-ego's). This mirrors how `app-quality.yml` and `unit-quality.yml`
 * already partition the workspace for typecheck/test, so a twelfth pillar
 * or a new lib client needs no edit here — it is discovered.
 *
 * `--pkg <name>` scopes to one package (what `app-quality.yml`'s per-app
 * matrix row passes, so each app still fails in isolation like every other
 * step in that matrix). `--exclude-app-matrix` runs everything that matrix
 * does NOT already cover (what `quality.yml`'s workspace-wide job passes).
 * Together the two invocations partition the full set with no overlap and
 * no gap — see the `inAppMatrix` field below.
 *
 * A regeneration is trusted only after three independent checks, per
 * POPS-1589 (guards that report success under exactly the condition they
 * exist to detect): the generator must exit zero, its declared output
 * directory must exist and be non-empty, and `git diff` against it must be
 * empty. Any other outcome — including a `generate:*` script with no
 * parseable `--write` target — is a reported violation, never a silent pass.
 *
 * Usage:
 *   node scripts/ci/check-generated-clients.mjs [--pkg <name>] [--exclude-app-matrix]
 *   node scripts/ci/check-generated-clients.mjs --self-test
 *
 * Exit 0 = every discovered client is up to date. Exit 1 = a violation, or
 * discovery/filtering matched nothing. Exit 2 = usage error.
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

const GENERATE_PREFIX = 'generate:';
const HEY_API_BIN = 'openapi-ts';

/**
 * @typedef {object} GeneratedClientTarget
 * @property {string} pkgName      npm package name from the unit's `package.json`.
 * @property {string} pkgDir       Unit directory, relative to repo root, posix-separated.
 * @property {string} scriptName   The `generate:*` script key.
 * @property {string} command      The script's raw command string.
 * @property {string | null} outputDir
 *   The `--write <dir>` target, relative to `pkgDir`, or null if the script
 *   invokes the Hey API generator but declares no parseable write target.
 * @property {boolean} inAppMatrix Whether `pkgDir` is a `pillars/<id>/app` unit.
 */

/**
 * True when `command` runs the Hey API generator as one of its
 * `&&`-separated steps. A substring match would also fire on
 * `generate-openapi.ts` (it doesn't contain the token, but nothing here
 * should rely on that coincidence) — this checks the first word of each step
 * instead, so only an actual invocation of the `openapi-ts` binary matches.
 *
 * @param {string} command
 * @returns {boolean}
 */
export function invokesHeyApiGenerator(command) {
  return command
    .split('&&')
    .map((step) => step.trim())
    .some((step) => step === HEY_API_BIN || step.startsWith(`${HEY_API_BIN} `));
}

/**
 * Extract the `--write <path>` argument every Hey API generate script in
 * this repo passes to `oxfmt`.
 *
 * @param {string} command
 * @returns {string | null}
 */
export function extractWriteTarget(command) {
  const match = /--write\s+(\S+)/u.exec(command);
  return match === null ? null : match[1];
}

/** @param {string} pkgDir Relative to repo root, posix-separated. @returns {boolean} */
export function isAppMatrixDir(pkgDir) {
  return /^pillars\/[^/]+\/app$/u.test(pkgDir);
}

/**
 * @param {string} root
 * @param {string} pkgDir Relative to root, posix-separated.
 * @returns {GeneratedClientTarget[]}
 */
function scanUnit(root, pkgDir) {
  const pkgJsonPath = join(root, pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return [];
  /** @type {{ name?: unknown, scripts?: Record<string, unknown> }} */
  const manifest = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (typeof manifest.name !== 'string') return [];
  const pkgName = manifest.name;
  const scripts = manifest.scripts ?? {};

  /** @type {GeneratedClientTarget[]} */
  const targets = [];
  for (const [scriptName, command] of Object.entries(scripts)) {
    if (!scriptName.startsWith(GENERATE_PREFIX)) continue;
    if (typeof command !== 'string' || !invokesHeyApiGenerator(command)) continue;
    targets.push({
      pkgName,
      pkgDir,
      scriptName,
      command,
      outputDir: extractWriteTarget(command),
      inAppMatrix: isAppMatrixDir(pkgDir),
    });
  }
  return targets;
}

/**
 * Every unit directory that might hold a Hey-API-generating package:
 * `pillars/<id>`, `pillars/<id>/app` (when it exists), and `libs/<lib>`.
 *
 * @param {string} root
 * @returns {string[]} Relative, posix-separated, sorted.
 */
export function discoverCandidateDirs(root) {
  /** @type {string[]} */
  const dirs = [];
  for (const unitKind of ['pillars', 'libs']) {
    const kindDir = join(root, unitKind);
    if (!existsSync(kindDir)) continue;
    for (const entry of readdirSync(kindDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      dirs.push(`${unitKind}/${entry.name}`);
      if (unitKind === 'pillars' && existsSync(join(kindDir, entry.name, 'app', 'package.json'))) {
        dirs.push(`${unitKind}/${entry.name}/app`);
      }
    }
  }
  return dirs.toSorted((a, b) => a.localeCompare(b));
}

/** @param {string} root @returns {GeneratedClientTarget[]} */
export function discoverGeneratedClientTargets(root) {
  return discoverCandidateDirs(root).flatMap((dir) => scanUnit(root, dir));
}

/**
 * @typedef {object} Violation
 * @property {GeneratedClientTarget} target
 * @property {'malformed' | 'generator-error' | 'no-output' | 'drift'} kind
 * @property {string} message
 */

/**
 * Classify one regeneration outcome. Every branch produces a distinct,
 * named violation — "nothing happened" is never treated as success.
 *
 * @param {GeneratedClientTarget} target
 * @param {{ exitCode: number, outputFileCount: number | null, gitDiff: string | null }} outcome
 * @returns {Violation | null}
 */
export function classifyOutcome(target, { exitCode, outputFileCount, gitDiff }) {
  if (target.outputDir === null) {
    return {
      target,
      kind: 'malformed',
      message:
        `${target.pkgName} ${target.scriptName} ("${target.command}") runs ${HEY_API_BIN} ` +
        `with no --write <dir> — cannot verify its output.`,
    };
  }
  if (exitCode !== 0) {
    return {
      target,
      kind: 'generator-error',
      message: `${target.pkgName} ${target.scriptName} exited ${exitCode}.`,
    };
  }
  if (outputFileCount === null || outputFileCount === 0) {
    return {
      target,
      kind: 'no-output',
      message:
        `${target.pkgName} ${target.scriptName} produced no output at ` +
        `${target.pkgDir}/${target.outputDir} — regeneration silently failed.`,
    };
  }
  if (gitDiff !== null && gitDiff.trim().length > 0) {
    return {
      target,
      kind: 'drift',
      message:
        `${target.pkgDir}/${target.outputDir} is out of date. Run ` +
        `'pnpm --filter ${target.pkgName} ${target.scriptName}' and commit the result.\n${gitDiff}`,
    };
  }
  return null;
}

/**
 * @typedef {object} Runner
 * @property {(target: GeneratedClientTarget, repoRoot: string) => number} generate
 * @property {(target: GeneratedClientTarget, repoRoot: string) => number | null} countOutputFiles
 * @property {(target: GeneratedClientTarget, repoRoot: string) => string} gitDiff
 */

/** @param {string} dir @returns {number} */
function countFilesRecursive(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    count += entry.isDirectory() ? countFilesRecursive(join(dir, entry.name)) : 1;
  }
  return count;
}

/** @type {Runner} */
export const realRunner = {
  generate(target, root) {
    const result = spawnSync('pnpm', ['--filter', target.pkgName, target.scriptName], {
      cwd: root,
      stdio: 'inherit',
    });
    return result.status ?? 1;
  },
  countOutputFiles(target, root) {
    if (target.outputDir === null) return null;
    const dir = join(root, target.pkgDir, target.outputDir);
    return existsSync(dir) ? countFilesRecursive(dir) : 0;
  },
  gitDiff(target, root) {
    const relPath = `${target.pkgDir}/${target.outputDir}`;
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
 * @param {GeneratedClientTarget} target
 * @param {string} root
 * @param {Runner} runner
 * @returns {Violation | null}
 */
export function runTarget(target, root, runner) {
  if (target.outputDir === null) {
    return classifyOutcome(target, { exitCode: 0, outputFileCount: null, gitDiff: null });
  }
  const exitCode = runner.generate(target, root);
  const outputFileCount = runner.countOutputFiles(target, root);
  const gitDiff =
    exitCode === 0 && outputFileCount !== null && outputFileCount > 0
      ? runner.gitDiff(target, root)
      : null;
  return classifyOutcome(target, { exitCode, outputFileCount, gitDiff });
}

/** @returns {boolean} */
function selfTestDiscovery() {
  const root = mkdtempSync(join(tmpdir(), 'generated-clients-discovery-'));
  try {
    mkdirSync(join(root, 'pillars', 'widgets', 'app'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'widgets', 'app', 'package.json'),
      JSON.stringify({
        name: '@pops/app-widgets',
        scripts: { 'generate:api': 'openapi-ts && oxfmt --write src/widgets-api' },
      })
    );

    mkdirSync(join(root, 'libs', 'overlay-widgets'), { recursive: true });
    writeFileSync(
      join(root, 'libs', 'overlay-widgets', 'package.json'),
      JSON.stringify({
        name: '@pops/overlay-widgets',
        scripts: {
          'generate:client': 'openapi-ts -f custom.config.ts && oxfmt --write src/widgets-api',
        },
      })
    );

    mkdirSync(join(root, 'pillars', 'broken'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'broken', 'package.json'),
      JSON.stringify({ name: '@pops/broken', scripts: { 'generate:client': 'openapi-ts' } })
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

    const targets = discoverGeneratedClientTargets(root);
    const byPkg = new Map(targets.map((t) => [t.pkgName, t]));

    const checks = {
      'finds the app-matrix target': byPkg.get('@pops/app-widgets')?.inAppMatrix === true,
      'finds the non-app-matrix target': byPkg.get('@pops/overlay-widgets')?.inAppMatrix === false,
      'reads its --write target':
        byPkg.get('@pops/overlay-widgets')?.outputDir === 'src/widgets-api',
      'flags the malformed script': byPkg.get('@pops/broken')?.outputDir === null,
      'ignores non-Hey-API generate scripts': !byPkg.has('@pops/decoy'),
      'finds exactly 3 targets': targets.length === 3,
    };
    const ok = Object.values(checks).every(Boolean);
    if (!ok) {
      console.error('SELF-TEST FAILED (discovery):');
      for (const [name, pass] of Object.entries(checks)) console.error(`  ${name}: ${pass}`);
    } else {
      console.log(
        'self-test OK — discovers app-matrix + non-app-matrix targets, flags malformed, ignores decoys.'
      );
    }
    return ok;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function selfTestOutcomes() {
  /** @type {GeneratedClientTarget} */
  const target = {
    pkgName: '@pops/app-widgets',
    pkgDir: 'pillars/widgets/app',
    scriptName: 'generate:api',
    command: 'openapi-ts && oxfmt --write src/widgets-api',
    outputDir: 'src/widgets-api',
    inAppMatrix: true,
  };
  /** @type {GeneratedClientTarget} */
  const malformedTarget = { ...target, outputDir: null, command: 'openapi-ts' };

  const scenarios = {
    'catches a malformed script (no --write target)': () =>
      runTarget(malformedTarget, '/repo', {
        generate: () => 0,
        countOutputFiles: () => 1,
        gitDiff: () => '',
      })?.kind === 'malformed',
    'catches a generator that errors': () =>
      runTarget(target, '/repo', {
        generate: () => 1,
        countOutputFiles: () => 0,
        gitDiff: () => {
          throw new Error('must not be called when the generator already failed');
        },
      })?.kind === 'generator-error',
    'catches output that never landed': () =>
      runTarget(target, '/repo', {
        generate: () => 0,
        countOutputFiles: () => 0,
        gitDiff: () => {
          throw new Error('must not be called when there is nothing to diff');
        },
      })?.kind === 'no-output',
    'catches drift against the committed client': () =>
      runTarget(target, '/repo', {
        generate: () => 0,
        countOutputFiles: () => 4,
        gitDiff: () => '--- a/x\n+++ b/x\n',
      })?.kind === 'drift',
    'passes a clean regeneration': () =>
      runTarget(target, '/repo', {
        generate: () => 0,
        countOutputFiles: () => 4,
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

/** @returns {boolean} */
function selfTest() {
  const discovery = selfTestDiscovery();
  const outcomes = selfTestOutcomes();
  return discovery && outcomes;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-generated-clients.mjs [--pkg <name>] [--exclude-app-matrix]\n' +
        '       node scripts/ci/check-generated-clients.mjs --self-test\n\n' +
        'Regenerates every generate:* Hey API client script found in the workspace and fails\n' +
        'on drift, a missing/empty output directory, a generator error, or a script with no\n' +
        'parseable --write target.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const pkgFlagIndex = args.indexOf('--pkg');
  const pkgFilter = pkgFlagIndex === -1 ? null : (args[pkgFlagIndex + 1] ?? null);
  const excludeAppMatrix = args.includes('--exclude-app-matrix');

  let targets = discoverGeneratedClientTargets(repoRoot);
  if (pkgFilter !== null) targets = targets.filter((t) => t.pkgName === pkgFilter);
  if (excludeAppMatrix) targets = targets.filter((t) => !t.inAppMatrix);

  if (targets.length === 0) {
    let scope = '';
    if (pkgFilter !== null) scope = `for --pkg ${pkgFilter}`;
    else if (excludeAppMatrix) scope = 'outside the app matrix';
    console.error(
      `FAIL — discovered zero generate:* Hey API client scripts ${scope}. ` +
        'Discovery is broken, or the filter matched nothing.'
    );
    process.exit(1);
  }

  /** @type {Violation[]} */
  const violations = [];
  for (const target of targets) {
    console.log(`::group::${target.pkgName} ${target.scriptName}`);
    const violation = runTarget(target, repoRoot, realRunner);
    if (violation) violations.push(violation);
    console.log('::endgroup::');
  }

  if (violations.length > 0) {
    console.error(`FAIL — ${violations.length} generated-client problem(s):`);
    for (const violation of violations) console.error(`  [${violation.kind}] ${violation.message}`);
    process.exit(1);
  }

  console.log(`OK — ${targets.length} generated Hey API client(s) match their contract, no drift.`);
  process.exit(0);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
