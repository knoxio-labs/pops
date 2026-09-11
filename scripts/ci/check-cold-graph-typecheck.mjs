#!/usr/bin/env node
/**
 * A unit's own `typecheck`/`test`/`test:coverage` may not silently need the
 * compiled graph.
 *
 * A unit that imports an `@pops/*` package whose `exports[...].types` resolves
 * into that package's `dist/` can only type-check or run its tests once the
 * graph has been emitted. `mise run typecheck` and CI's `unit-quality.yml`
 * emit it first — but a script run on its own (a bare `tsc --noEmit`, or a
 * bare `vitest run`) is correct only when the graph happens to be warm.
 *
 * On a fresh clone or worktree it is not warm, and the unit reports either
 * `TS2307: Cannot find module '@pops/<x>'` (typecheck) or a runtime error
 * against its own files (test/test:coverage). Either way it reads as a broken
 * package rather than a missing prerequisite, so this guard checks all three
 * script kinds for the gap.
 *
 * ## The remedy this guard demands
 *
 * A legible refusal, not a build: most of the repo's units import at least
 * one such package, several on half a dozen each, so a per-unit
 * `test -e ... || echo ...` line for every one of them would be six copies of
 * the same sentence in a `package.json` string.
 *
 * So the demanded shape is one call to `scripts/require-built-graph.mjs`
 * before `tsc`/`vitest`, which computes the same answer from the same module
 * this guard uses and names whichever packages are actually missing.
 *
 * ## What it does not check
 *
 * That the refusal fires. That is the helper's own job and its own test — this
 * guard only knows whether the call is there. A unit could call it with a
 * `|| true` and defeat it; nothing here would notice, and that is the same
 * hole every "the script must mention X" check has.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { relative } from 'node:path';

import {
  coldGraphDependencies,
  readUnits,
  repoRoot,
  resolvesIntoDist,
  typesEntryFor,
} from './cold-graph-deps.mjs';

/** The helper whose call satisfies this guard. */
const REQUIRE_HELPER = 'require-built-graph';

/** Whether a unit's typecheck script guarantees the graph before `tsc` runs. */
export function guardsItsOwnGraph(/** @type {string} */ script) {
  const beforeTsc = script.split(/(?<![.\w-])tsc\b/u)[0] ?? '';
  return beforeTsc.includes(REQUIRE_HELPER) || /\btsc\s+-b\b/u.test(script);
}

/**
 * Whether a unit's `test`/`test:coverage` script guarantees the graph before
 * `vitest` runs.
 *
 * Unlike `guardsItsOwnGraph`, there is no `tsc -b`-style self-satisfying
 * alternative here: `vitest` never builds the referenced graph on its own, so
 * the only thing that can satisfy this is the helper itself, called first.
 */
export function guardsItsOwnTests(/** @type {string} */ script) {
  const beforeVitest = script.split(/\bvitest\b/u)[0] ?? '';
  return beforeVitest.includes(REQUIRE_HELPER);
}

/** The `package.json` script keys this guard checks, and how each is satisfied. */
const CHECKED_SCRIPTS = /** @type {const} */ ([
  { key: 'typecheck', guarded: guardsItsOwnGraph },
  { key: 'test', guarded: guardsItsOwnTests },
  { key: 'test:coverage', guarded: guardsItsOwnTests },
  { key: 'test:live-seam', guarded: guardsItsOwnTests },
]);

/**
 * Scan the tree.
 *
 * @param {string} [root]
 * @returns {{ unitCount: number; needing: number; failures: string[] }}
 */
export function scanRepo(root = repoRoot) {
  const units = readUnits(root);
  /** @type {string[]} */
  const failures = [];
  let needing = 0;
  for (const unit of units.values()) {
    const scripts = unit.pkg.scripts;
    const scriptsObj =
      typeof scripts === 'object' && scripts !== null
        ? /** @type {Record<string, unknown>} */ (scripts)
        : {};
    const cold = coldGraphDependencies(unit.dir, units);
    if (cold.length === 0) continue;
    let unitNeeds = false;
    for (const { key, guarded } of CHECKED_SCRIPTS) {
      const script = scriptsObj[key];
      if (typeof script !== 'string') continue;
      unitNeeds = true;
      if (guarded(script)) continue;
      failures.push(`${relative(root, unit.dir)} (${key}) — imports ${cold.join(', ')}`);
    }
    if (unitNeeds) needing += 1;
  }
  return { unitCount: units.size, needing, failures };
}

/**
 * Prove the guard reports, one mutation at a time.
 *
 * The planted cases are on `guardsItsOwnGraph`/`guardsItsOwnTests` and on the
 * two resolution questions underneath them, because those are where a wrong
 * answer is silent: a `types` entry read as source when it is emitted output
 * removes a unit from the scan without removing it from the tree.
 */
function selfTest() {
  /** @type {[name: string, actual: () => unknown, expected: unknown][]} */
  const cases = [
    [
      'a bare tsc --noEmit does not guarantee the graph',
      () => guardsItsOwnGraph('tsc --noEmit'),
      false,
    ],
    [
      'the helper called before tsc does',
      () => guardsItsOwnGraph('node ../../scripts/require-built-graph.mjs && tsc --noEmit'),
      true,
    ],
    [
      'the helper called AFTER tsc does not — tsc has already blamed the unit',
      () => guardsItsOwnGraph('tsc --noEmit && node ../../scripts/require-built-graph.mjs'),
      false,
    ],
    ['building the graph itself does', () => guardsItsOwnGraph('tsc -b && tsc --noEmit'), true],
    [
      'a second project appended after the guarded tsc stays satisfied',
      () =>
        guardsItsOwnGraph(
          'node ../../scripts/require-built-graph.mjs && tsc --noEmit && tsc --noEmit -p scripts/tsconfig.json'
        ),
      true,
    ],
    [
      'a bare vitest run does not guarantee the graph',
      () => guardsItsOwnTests('vitest run'),
      false,
    ],
    [
      'the helper called before vitest does',
      () => guardsItsOwnTests('node ../../scripts/require-built-graph.mjs && vitest run'),
      true,
    ],
    [
      'the helper called AFTER vitest does not — vitest has already blamed the unit',
      () => guardsItsOwnTests('vitest run && node ../../scripts/require-built-graph.mjs'),
      false,
    ],
    [
      'unlike typecheck, there is no self-satisfying vitest flag',
      () => guardsItsOwnTests('vitest run --coverage'),
      false,
    ],
    [
      'a trailing command appended after the guarded vitest stays satisfied',
      () =>
        guardsItsOwnTests(
          'node ../../scripts/require-built-graph.mjs && vitest run --coverage && node scripts/check-storybook-coverage.mjs'
        ),
      true,
    ],
    [
      'a dist types entry is emitted output',
      () => resolvesIntoDist('./dist/contract/index.d.ts'),
      true,
    ],
    ['a src types entry is not', () => resolvesIntoDist('./src/index.ts'), false],
    [
      'a path merely containing the letters dist is not',
      () => resolvesIntoDist('./src/distance.d.ts'),
      false,
    ],
    [
      'a conditional exports entry yields its types',
      () => typesEntryFor({ exports: { './manifest': { types: './dist/m.d.ts' } } }, 'manifest'),
      './dist/m.d.ts',
    ],
    [
      'a string exports entry is taken as the types entry',
      () => typesEntryFor({ exports: { '.': './src/index.ts' } }, ''),
      './src/index.ts',
    ],
    [
      'a subpath the package does not export yields nothing',
      () => typesEntryFor({ exports: { '.': { types: './dist/i.d.ts' } } }, 'nope'),
      undefined,
    ],
    [
      'a package with no exports map falls back to types',
      () => typesEntryFor({ types: './dist/index.d.ts' }, ''),
      './dist/index.d.ts',
    ],
  ];

  let ok = true;
  for (const [name, actual, expected] of cases) {
    const got = actual();
    if (got === expected) continue;
    ok = false;
    console.error(`  self-test FAIL — ${name}: expected ${String(expected)}, got ${String(got)}`);
  }
  console.log(
    ok
      ? `OK — ${cases.length} self-test mutations behave as stated.`
      : 'FAIL — the guard does not report what its header claims.'
  );
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-cold-graph-typecheck.mjs [--self-test]\n' +
        "Fails when a unit's typecheck/test/test:coverage script needs the compiled graph and " +
        'does not say so.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) process.exit(selfTest() ? 0 : 1);

  const { unitCount, needing, failures } = scanRepo();
  console.log(
    `Scanned ${unitCount} workspace unit(s) under libs/ and pillars/ — ` +
      `${needing} import an @pops/* package whose types are emitted into dist/.`
  );
  if (failures.length === 0) {
    console.log('OK — every unit that needs the compiled graph refuses legibly without it.');
    process.exit(0);
  }
  console.error(
    "FAIL — these units' own scripts only work when the compiled graph happens to be warm. " +
      "On a fresh clone they report TS2307, or a runtime error against the unit's own files, " +
      'which reads as a broken package rather than a missing prerequisite (POPS-3072):'
  );
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    'Put `node <relative path to>/scripts/require-built-graph.mjs && ` in front of `tsc`/`vitest` ' +
      "in that unit's script. It names whichever packages are actually missing, and exits 0 when " +
      'the graph is warm.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
