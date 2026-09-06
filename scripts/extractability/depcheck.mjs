#!/usr/bin/env node
/**
 * EX-1 — declared-deps completeness (phantom-dependency detection).
 *
 * Asserts every package a unit IMPORTS in source is DECLARED in its own
 * package.json (dependencies / peerDependencies / optionalDependencies /
 * devDependencies). A unit that imports `@pops/types` but never declares it
 * builds fine in-workspace (pnpm hoisting) yet breaks the instant it is
 * extracted to its own repo — that is the extraction bug this gate catches.
 *
 * Usage:
 *   node scripts/extractability/depcheck.mjs <unit-dir> [<unit-dir> …]
 *   node scripts/extractability/depcheck.mjs --all
 *   node scripts/extractability/depcheck.mjs --self-test
 *
 * Exit codes: 0 = clean, 1 = phantom deps found, 2 = bad invocation / self-test fail.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  discoverUnits,
  findPhantomDeps,
  importedPackages,
  noProofSurfaceReason,
  packageRoot,
  resolveUnit,
  rel,
} from './lib.mjs';

/** @param {string[]} argv */
function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const all = argv.includes('--all');
  const targets = argv.filter((a) => !a.startsWith('--'));
  if (!all && targets.length === 0) {
    process.stderr.write('usage: depcheck.mjs <unit-dir> [<unit-dir> …] | --all | --self-test\n');
    return 2;
  }

  const cwd = process.cwd();
  /** @type {import('./lib.mjs').Unit[]} */
  let units;
  try {
    units = all ? discoverUnits(undefined, cwd) : targets.map((t) => resolveUnit(t, cwd));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  // `--all` over a tree it can no longer see reports the same ✔ as a clean
  // one. The roots are hardcoded and skipped with `existsSync`, so a renamed
  // `libs`/`pillars` silently empties the list rather than failing.
  if (units.length === 0) {
    process.stderr.write(
      all
        ? 'EX-1 discovered zero units under libs/ and pillars/. That is a broken scan, ' +
            'not a clean workspace — nothing was checked.\n'
        : 'EX-1 was given no unit to check.\n'
    );
    return 1;
  }

  let failed = 0;
  let scannedUnits = 0;
  let scannedFiles = 0;
  /** @type {Array<{ unit: string; reason: string }>} */
  const declaredEmpty = [];
  /** @type {string[]} */
  const silentlyEmpty = [];
  for (const unit of units) {
    const { phantoms, scanned } = findPhantomDeps(unit);
    scannedUnits += 1;
    scannedFiles += scanned;
    if (scanned === 0) {
      // A unit with nothing to parse is either data (and says so) or a unit
      // whose source the scan has stopped finding. `findPhantomDeps` returns
      // `phantoms: []` for both, which is the guard's success value.
      const reason = noProofSurfaceReason(unit.pkg);
      if (reason === null) silentlyEmpty.push(unit.name);
      else declaredEmpty.push({ unit: unit.name, reason });
    }
    if (phantoms.length === 0) continue;
    failed += 1;
    process.stderr.write(`\n✗ ${unit.name} (${rel(cwd, unit.dir)}) — phantom dependencies:\n`);
    for (const phantom of phantoms) {
      const sample = phantom.files.slice(0, 3).map((f) => rel(cwd, f));
      const more =
        phantom.files.length > sample.length
          ? ` (+${phantom.files.length - sample.length} more)`
          : '';
      process.stderr.write(
        `    ${phantom.pkg}\n        imported in: ${sample.join(', ')}${more}\n`
      );
    }
  }

  if (silentlyEmpty.length > 0) {
    process.stderr.write(
      `\n${silentlyEmpty.length} unit(s) had no source file to scan and do not declare why:\n`
    );
    for (const name of silentlyEmpty) process.stderr.write(`    ${name}\n`);
    process.stderr.write(
      `\nEX-1 cannot report a phantom dependency in a unit it parsed nothing from, and ` +
        `"nothing to check" and "clean" are the same answer here. Either the unit's source ` +
        `moved, or it genuinely holds no code — in which case declare that in its ` +
        `package.json as pops.extractability.noProofSurface, the same field EX-2 reads.\n`
    );
    return 1;
  }

  if (failed > 0) {
    process.stderr.write(
      `\n${failed} unit(s) import undeclared packages. Declare them in the unit's package.json — ` +
        `an undeclared import breaks the build on extraction to its own repo.\n`
    );
    return 1;
  }
  // The file count is the number that separates "clean" from "did not look".
  // `findPhantomDeps` has always computed it and no caller read it, so a unit
  // whose `src/` had moved was counted among the units that passed.
  process.stdout.write(
    `✔ EX-1: ${scannedUnits} unit(s) declare every imported package ` +
      `(${scannedFiles} source file(s) parsed).\n`
  );
  for (const { unit, reason } of declaredEmpty) {
    process.stdout.write(`    ${unit}: no source to scan — ${reason}\n`);
  }
  return 0;
}

/**
 * Self-test: builds throwaway fixture units in a temp dir and asserts the
 * detector flags exactly the undeclared imports and nothing else. Exercises
 * the import-form coverage (static/dynamic/require/type-only/subpath) and the
 * package-root reduction. Returns 0 on pass, 2 on any failed assertion.
 */
function selfTest() {
  /** @type {string[]} */
  const failures = [];
  /** @param {boolean} cond @param {string} msg */
  const assert = (cond, msg) => {
    if (!cond) failures.push(msg);
  };

  // --- packageRoot unit cases (pure) ---
  const rootCases = /** @type {[string, string | null][]} */ ([
    ['@pops/types', '@pops/types'],
    ['@pops/sdk/client', '@pops/sdk'],
    ['react', 'react'],
    ['react-dom/client', 'react-dom'],
    ['./local', null],
    ['../up', null],
    ['/abs', null],
    ['node:fs', null],
    ['data:text/js,1', null],
    ['@scope', null],
    ['', null],
  ]);
  for (const [input, expected] of rootCases) {
    const got = packageRoot(input);
    assert(
      got === expected,
      `packageRoot(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(expected)}`
    );
  }

  // --- importedPackages form coverage on a temp file ---
  const root = mkdtempSync(join(tmpdir(), 'ex1-selftest-'));
  try {
    const formsFile = join(root, 'forms.ts');
    writeFileSync(
      formsFile,
      [
        "import a from 'static-default';",
        "import type { T } from 'type-only';",
        "import { b } from '@scope/named/subpath';",
        "export { c } from 're-export';",
        "const d = await import('dynamic-import');",
        "const e = require('require-call');",
        "import f from './relative-ignored';",
        "import g from 'node:fs';",
        'const noop = a + d + e + f + g; void noop; void b;',
      ].join('\n')
    );
    const forms = importedPackages(formsFile);
    for (const expected of [
      'static-default',
      'type-only',
      '@scope/named',
      're-export',
      'dynamic-import',
      'require-call',
    ]) {
      assert(
        forms.has(expected),
        `importedPackages missing ${expected} (got ${[...forms].join(',')})`
      );
    }
    assert(!forms.has('node:fs') && !forms.has('fs'), 'node: builtin leaked into importedPackages');
    assert(
      ![...forms].some((p) => p.startsWith('.')),
      'relative import leaked into importedPackages'
    );

    // --- findPhantomDeps on a fixture unit (declared vs undeclared) ---
    const unitDir = join(root, 'fixture-unit');
    mkdirSync(join(unitDir, 'src'), { recursive: true });
    writeFileSync(
      join(unitDir, 'package.json'),
      JSON.stringify({
        name: '@fixture/unit',
        dependencies: { declared: '^1.0.0' },
        devDependencies: { 'declared-dev': '^1.0.0' },
      })
    );
    writeFileSync(
      join(unitDir, 'src', 'index.ts'),
      [
        "import { x } from 'declared';",
        "import { d } from 'declared-dev';",
        "import { p } from 'phantom-pkg';",
        "import sub from 'phantom-scoped/lib';",
        "import self from '@fixture/unit/other';",
        "import fs from 'node:fs';",
        'void x; void d; void p; void sub; void self; void fs;',
      ].join('\n')
    );
    // A test file referencing an undeclared pkg must be ignored by default.
    writeFileSync(
      join(unitDir, 'src', 'index.test.ts'),
      "import t from 'test-only-phantom'; void t;"
    );

    const { phantoms } = findPhantomDeps({
      dir: unitDir,
      name: '@fixture/unit',
      pkg: {
        name: '@fixture/unit',
        dependencies: { declared: '^1.0.0' },
        devDependencies: { 'declared-dev': '^1.0.0' },
      },
    });
    const phantomNames = new Set(phantoms.map((p) => p.pkg));
    assert(phantomNames.has('phantom-pkg'), 'phantom-pkg not detected');
    assert(
      phantomNames.has('phantom-scoped'),
      'phantom-scoped (subpath reduced to root) not detected'
    );
    assert(!phantomNames.has('declared'), 'declared dep wrongly flagged');
    assert(!phantomNames.has('declared-dev'), 'declared devDep wrongly flagged');
    assert(!phantomNames.has('@fixture/unit'), 'self-import wrongly flagged');
    assert(!phantomNames.has('test-only-phantom'), 'test-file import flagged (should be excluded)');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    process.stderr.write(`✗ EX-1 self-test: ${failures.length} failure(s)\n`);
    for (const f of failures) process.stderr.write(`    - ${f}\n`);
    return 2;
  }
  process.stdout.write('✔ EX-1 self-test passed.\n');
  return 0;
}

process.exit(main(process.argv.slice(2)));
