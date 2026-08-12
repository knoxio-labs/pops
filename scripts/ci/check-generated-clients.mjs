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
 * `&&`- or `;`-separated steps invokes the `openapi-ts` binary — directly,
 * through `pnpm exec`/`npx`, or behind a leading `KEY=VALUE` env prefix —
 * the shapes such a script can take in this repo (plain form:
 * `openapi-ts [...] && oxfmt --write <dir>`). That excludes the unrelated
 * `generate:openapi` / `generate:manifest` / `generate:api-types` /
 * `generate:prompt-catalog` scripts pillars also declare, which produce
 * other artefacts entirely.
 *
 * Candidate units are `pillars/<id>/app` (own-pillar and cross-pillar
 * consumer clients), `pillars/<id>` (a pillar-level client, e.g. the shell's
 * registry client) and `libs/<lib>` (a library-level client, e.g.
 * overlay-ego's). This mirrors how `app-quality.yml` and `unit-quality.yml`
 * already partition the workspace for typecheck/test, so a twelfth pillar
 * or a new lib client needs no edit here — it is discovered.
 *
 * Discovery tolerating every known script shape still only defends against
 * the forms this file knows about. `EXPECTED_TARGETS` below is the second,
 * independent line of defence: the exact target set this repo owns today,
 * checked on every real invocation (not only in the sibling Vitest suite),
 * so a discovery break — including one from a wrapper form nobody has
 * written yet — fails the guard directly instead of only the vitest lane in
 * a different CI job. Adding or removing a Hey API client leg means editing
 * this list in the same commit; that is the point, not friction to route
 * around.
 *
 * `--pkg <name>` scopes to one package (what `app-quality.yml`'s per-app
 * matrix row passes, so each app still fails in isolation like every other
 * step in that matrix). `--exclude-app-matrix` runs everything that matrix
 * does NOT already cover (what `quality.yml`'s workspace-wide job passes).
 * Together the two invocations partition the full set with no overlap and
 * no gap — see the `inAppMatrix` field below.
 *
 * A regeneration is trusted only after three independent checks, deliberately
 * distinct from "the diff step didn't complain": the generator must exit
 * zero, its declared output directory must exist and be non-empty, and only
 * then does `git diff` against it decide drift. A guard that skips the first
 * two would report success on a generator that silently no-ops or a client
 * directory that was deleted out from under it — those are reported
 * violations here, same as an actual diff, never a silent pass. A
 * `generate:*` script with no parseable `--write` target is likewise a
 * violation rather than something quietly skipped.
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

/** Package-manager wrappers a script may invoke `openapi-ts` through. */
const RUNNER_WRAPPERS = [['pnpm', 'exec'], ['npx']];

/** A leading `KEY=VALUE` env assignment token, e.g. `NODE_OPTIONS=--max-old-space-size=4096`. */
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/u;

/**
 * True when a single step (already split off `&&`/`;`) invokes the
 * `openapi-ts` binary — bare, through `pnpm exec`/`npx`, and/or behind one
 * or more leading env-var assignments. Tokenises on whitespace rather than
 * matching a fixed string, so it does not depend on exactly which wrapper or
 * how many env vars precede the binary; it does not attempt to honour
 * quoted, space-containing env values, which none of this repo's scripts use.
 *
 * @param {string} step
 * @returns {boolean}
 */
function stepInvokesHeyApiGenerator(step) {
  const tokens = step.split(/\s+/u).filter((token) => token.length > 0);
  let i = 0;
  while (i < tokens.length && ENV_ASSIGNMENT.test(tokens[i])) i++;
  for (const wrapper of RUNNER_WRAPPERS) {
    if (wrapper.every((word, offset) => tokens[i + offset] === word)) {
      i += wrapper.length;
      break;
    }
  }
  return tokens[i] === HEY_API_BIN;
}

/**
 * True when `command` runs the Hey API generator as one of its `&&`- or
 * `;`-separated steps. A substring match would also fire on
 * `generate-openapi.ts` (it doesn't contain the token, but nothing here
 * should rely on that coincidence) — this checks each step's binary
 * position instead, so only an actual invocation of the `openapi-ts` binary
 * matches, wrapped or not.
 *
 * @param {string} command
 * @returns {boolean}
 */
export function invokesHeyApiGenerator(command) {
  return command
    .split(/&&|;/u)
    .map((step) => step.trim())
    .some((step) => stepInvokesHeyApiGenerator(step));
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
 * @typedef {object} ExpectedTarget
 * @property {string} pkgName
 * @property {string} scriptName
 * @property {boolean} inAppMatrix
 */

/**
 * The exact set of `generate:*` Hey API client scripts this repo owns today.
 * This is the pinned invariant ADR-045 recommends over a bare discovery
 * floor: a floor only catches losing every target, this catches losing (or
 * gaining) any one of them. Adding, removing, or renaming a Hey API client
 * leg means editing this list in the same commit — `findExpectedTargetSetViolations`
 * fails loudly otherwise, on every real invocation of this guard, not only
 * in the sibling Vitest suite.
 *
 * @type {ExpectedTarget[]}
 */
export const EXPECTED_TARGETS = [
  { pkgName: '@pops/app-ai', scriptName: 'generate:api', inAppMatrix: true },
  { pkgName: '@pops/app-bfm', scriptName: 'generate:api', inAppMatrix: true },
  { pkgName: '@pops/app-cerebrum', scriptName: 'generate:cerebrum-client', inAppMatrix: true },
  { pkgName: '@pops/app-finance', scriptName: 'generate:finance-client', inAppMatrix: true },
  { pkgName: '@pops/app-finance', scriptName: 'generate:contacts-client', inAppMatrix: true },
  { pkgName: '@pops/app-food', scriptName: 'generate:food-client', inAppMatrix: true },
  { pkgName: '@pops/app-food', scriptName: 'generate:lists-client', inAppMatrix: true },
  { pkgName: '@pops/app-inventory', scriptName: 'generate:inventory-client', inAppMatrix: true },
  { pkgName: '@pops/app-lists', scriptName: 'generate:lists-client', inAppMatrix: true },
  { pkgName: '@pops/app-media', scriptName: 'generate:media-client', inAppMatrix: true },
  { pkgName: '@pops/shell', scriptName: 'generate:registry-client', inAppMatrix: false },
  { pkgName: '@pops/overlay-ego', scriptName: 'generate:ego-client', inAppMatrix: false },
];

/** @param {{ pkgName: string, scriptName: string }} target @returns {string} */
function targetKey(target) {
  return `${target.pkgName}:${target.scriptName}`;
}

/**
 * Compares a freshly discovered, unfiltered target set against
 * `EXPECTED_TARGETS` and reports every discrepancy: an expected target that
 * did not come back, one that came back on the wrong side of the app
 * matrix, one that was not expected at all, and two units that collided on
 * the same `pkgName:scriptName` key. That last case matters on its own:
 * collapsing duplicates into a `Map` via its constructor keeps whichever
 * entry comes last and silently drops the other, which would let the
 * pinned-set check pass even though discovery returned an ambiguous result.
 * Returns an empty array only when the two sets match exactly — that is the
 * "pass" case.
 *
 * @param {GeneratedClientTarget[]} targets Full, unfiltered discovery — not scoped by `--pkg`/`--exclude-app-matrix`.
 * @returns {string[]}
 */
export function findExpectedTargetSetViolations(targets) {
  /** @type {string[]} */
  const messages = [];

  /** @type {Map<string, GeneratedClientTarget>} */
  const discovered = new Map();
  for (const target of targets) {
    const key = targetKey(target);
    const existing = discovered.get(key);
    if (existing !== undefined) {
      messages.push(
        `discovered ${key} twice — once from ${existing.pkgDir}, once from ${target.pkgDir} — ` +
          'two units declare the same package name and script name.'
      );
      continue;
    }
    discovered.set(key, target);
  }

  const expectedKeys = new Set(EXPECTED_TARGETS.map((target) => targetKey(target)));

  for (const expected of EXPECTED_TARGETS) {
    const key = targetKey(expected);
    const found = discovered.get(key);
    if (found === undefined) {
      messages.push(
        `expected target ${key} was not discovered — its generate:* script was renamed, ` +
          'removed, or its command no longer matches a known Hey API invocation.'
      );
    } else if (found.inAppMatrix !== expected.inAppMatrix) {
      messages.push(
        `${key} is ${found.inAppMatrix ? 'inside' : 'outside'} the app matrix now, expected ` +
          `${expected.inAppMatrix ? 'inside' : 'outside'} — its unit moved.`
      );
    }
  }
  for (const key of discovered.keys()) {
    if (!expectedKeys.has(key)) {
      messages.push(
        `discovered ${key}, which is not in EXPECTED_TARGETS — add it there once its ` +
          'generated client is committed.'
      );
    }
  }
  return messages;
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

/** @param {ExpectedTarget} expected @returns {GeneratedClientTarget} */
function fullTargetFor(expected) {
  return {
    ...expected,
    pkgDir: 'pillars/x/app',
    command: 'openapi-ts && oxfmt --write src/x-api',
    outputDir: 'src/x-api',
  };
}

/** @returns {boolean} */
function selfTestExpectedTargetSet() {
  const clean = EXPECTED_TARGETS.map(fullTargetFor);
  const missingOne = clean.slice(1);
  const droppedKey = targetKey(EXPECTED_TARGETS[0]);
  const withExtra = [
    ...clean,
    fullTargetFor({
      pkgName: '@pops/app-bogus',
      scriptName: 'generate:bogus-client',
      inAppMatrix: true,
    }),
  ];
  const wrongMatrixFlag = clean.map((target, index) =>
    index === 0 ? { ...target, inAppMatrix: !target.inAppMatrix } : target
  );
  const collidingTarget = clean[1];
  const duplicateKey = [{ ...collidingTarget, pkgDir: 'pillars/other/app' }, ...clean];

  const scenarios = {
    'passes when the discovered set matches EXPECTED_TARGETS exactly':
      findExpectedTargetSetViolations(clean).length === 0,
    'reports a dropped target instead of silently passing': findExpectedTargetSetViolations(
      missingOne
    ).some((message) => message.includes(droppedKey)),
    'reports a target that is not in EXPECTED_TARGETS': findExpectedTargetSetViolations(
      withExtra
    ).some((message) => message.includes('@pops/app-bogus')),
    'reports a target that moved across the app-matrix boundary': findExpectedTargetSetViolations(
      wrongMatrixFlag
    ).some((message) => message.includes(targetKey(EXPECTED_TARGETS[0]))),
    'reports two units colliding on the same key instead of silently keeping one':
      findExpectedTargetSetViolations(duplicateKey).some(
        (message) =>
          message.includes(targetKey(collidingTarget)) &&
          message.includes('pillars/other/app') &&
          message.includes(collidingTarget.pkgDir)
      ),
  };

  const ok = Object.values(scenarios).every(Boolean);
  if (!ok) {
    console.error('SELF-TEST FAILED (expected target set):');
    for (const [name, pass] of Object.entries(scenarios)) console.error(`  ${name}: ${pass}`);
  } else {
    console.log(
      'self-test OK — pinned target set catches a dropped target, an unexpected one, one that ' +
        'moved app-matrix side, and two units colliding on the same key.'
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

  const allTargets = discoverGeneratedClientTargets(repoRoot);

  const expectedSetViolations = findExpectedTargetSetViolations(allTargets);
  if (expectedSetViolations.length > 0) {
    console.error(
      `FAIL — discovered target set does not match the ${EXPECTED_TARGETS.length} pinned in ` +
        'EXPECTED_TARGETS (scripts/ci/check-generated-clients.mjs):'
    );
    for (const message of expectedSetViolations) console.error(`  ${message}`);
    process.exit(1);
  }

  let targets = allTargets;
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

if (import.meta.main) {
  main();
}
