#!/usr/bin/env node
/**
 * A unit's own `typecheck` may not silently need the compiled graph.
 *
 * A unit that imports an `@pops/*` package whose `exports[...].types` resolves
 * into that package's `dist/` can only type-check once the graph has been
 * emitted. `mise run typecheck` emits it — `tsc -b tsconfig.build.json` first,
 * then the fan-out to each unit's own script. The per-unit script is a bare
 * `tsc --noEmit` almost everywhere, so run on its own it is correct only when
 * the graph happens to be warm.
 *
 * On a fresh clone or worktree it is not warm, and the unit reports
 * `TS2307: Cannot find module '@pops/<x>'` against its own files. That reads
 * as a broken package rather than a missing prerequisite, and it has cost a
 * whole agent run and a ticket filed against the wrong subsystem (POPS-3072:
 * 93 `TS2307`s from `pnpm --filter @pops/app-finance typecheck`; the graph was
 * fine; moving that pillar's own emitted output aside reproduced it, and
 * restoring it fixed it).
 *
 * ## The remedy this guard demands
 *
 * A legible refusal, not a build. POPS-3072 chose it for the two units it
 * fixed, and at this scale it is the only one that stays readable: **30** of
 * the repo's 38 units have such a dependency, several on half a dozen packages
 * each. A per-unit `test -e ... || echo ...` line for every one of them would
 * be six copies of the same sentence in a `package.json` string.
 *
 * So the demanded shape is one call to `scripts/require-built-graph.mjs`
 * before `tsc`, which computes the same answer from the same module this guard
 * uses and names whichever packages are actually missing.
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
    const script =
      typeof scripts === 'object' && scripts !== null
        ? /** @type {Record<string, unknown>} */ (scripts).typecheck
        : undefined;
    if (typeof script !== 'string') continue;
    const cold = coldGraphDependencies(unit.dir, units);
    if (cold.length === 0) continue;
    needing += 1;
    if (guardsItsOwnGraph(script)) continue;
    failures.push(`${relative(root, unit.dir)} — imports ${cold.join(', ')}`);
  }
  return { unitCount: units.size, needing, failures };
}

/**
 * Prove the guard reports, one mutation at a time.
 *
 * The planted cases are on `guardsItsOwnGraph` and on the two resolution
 * questions underneath it, because those are where a wrong answer is silent:
 * a `types` entry read as source when it is emitted output removes a unit from
 * the scan without removing it from the tree.
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
        "Fails when a unit's typecheck script needs the compiled graph and does not say so."
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
    "FAIL — these units' own `typecheck` scripts only work when the compiled graph happens " +
      "to be warm. On a fresh clone they report TS2307 against the unit's own files, which " +
      'reads as a broken package rather than a missing prerequisite (POPS-3072):'
  );
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    'Put `node <relative path to>/scripts/require-built-graph.mjs && ` in front of `tsc` in ' +
      "that unit's typecheck script. It names whichever packages are actually missing, and " +
      'exits 0 when the graph is warm.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
