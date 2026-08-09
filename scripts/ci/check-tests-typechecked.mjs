#!/usr/bin/env node
/**
 * Test-files-are-type-checked guard.
 *
 * A unit's `typecheck` script must run `tsc --noEmit` against that unit's own
 * `tsconfig.json` — this guard verifies the script actually does that, rather
 * than assuming it. If that project excludes `__tests__/` or `*.test.*`, or
 * its `include` never reaches a test file, or the script quietly retargets
 * itself at a more lenient config (`tsconfig.build.json` legitimately excludes
 * tests), the unit's tests are type-checked by nothing at all — vitest and
 * Playwright both transpile without checking — and a test can call a helper
 * with the wrong arguments, assert against a field that does not exist, or
 * hold a stale fixture shape while both `pnpm typecheck` and `pnpm test` stay
 * green.
 *
 * Three independent checks per unit, each catching a different route to that
 * same silent outcome:
 *
 *   1. `offendingExcludes` — the unit's own `tsconfig.json` (or the base it
 *      extends, when it declares no `exclude` of its own) does not name
 *      `__tests__`, `*.test.*`, `*.spec.*` or a test-support module in
 *      `exclude`. That belongs on `tsconfig.build.json`, which decides what
 *      ships in `dist/` — a different question from what gets checked.
 *   2. `typecheckScriptCoversOwnConfig` — the unit's `package.json`
 *      `typecheck` script actually runs `tsc --noEmit` against the unit's own
 *      `tsconfig.json` (bare, or `-p tsconfig.json`), not only some other
 *      project. A second `tsc --noEmit -p <path>` invocation may be appended
 *      (the nine-pillar `scripts/tsconfig.json` shape) — that is additive,
 *      not a substitution, and stays green.
 *   3. `findUncoveredTestFiles` — every `*.test.*` / `*.spec.*` / `__tests__`
 *      file actually on disk under the unit is resolved by TypeScript's own
 *      config parser (`ts.parseJsonConfigFileContent`) against every project
 *      the `typecheck` script invokes. Comparing real files rather than
 *      reasoning about `include` globs is what catches a narrowed `include`
 *      without a second layer of pattern-guessing — and, as a side effect,
 *      catches two files whose module specifier collides once their
 *      extension is stripped (`Foo.test.ts` next to `Foo.test.tsx`), which
 *      TypeScript silently resolves to only one of the two.
 *
 * Discovery is disk-derived (no static unit list) so a new pillar, lib or
 * frontend app is gated the moment it appears. JSON is parsed after stripping
 * comments, since tsconfigs are JSONC.
 *
 * Usage:
 *   node scripts/ci/check-tests-typechecked.mjs
 *   node scripts/ci/check-tests-typechecked.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one unit hides its tests. Exit 2 = usage.
 */

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
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const EXTENSIONED_PATH = /\.[cm]?[tj]s$|\.json$/;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * An exclude glob hides tests when it names a `__tests__` directory, a
 * `.test.` / `.spec.` file, or a `test-helpers` / `test-utils` support module.
 *
 * @param {string} glob
 * @returns {boolean}
 */
export function hidesTests(glob) {
  const normalized = glob.replaceAll('\\', '/').toLowerCase();
  if (normalized.includes('node_modules')) return false;
  return (
    normalized.includes('__tests__') ||
    /\.test\./.test(normalized) ||
    /\.spec\./.test(normalized) ||
    /test-(helpers|utils)/.test(normalized)
  );
}

/**
 * Strip `//` and block comments so a JSONC tsconfig parses. String literals are
 * tracked so a `//` inside one (a URL, a glob) survives.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripJsonComments(source) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (inLine) {
      if (char === '\n') {
        inLine = false;
        out += char;
      }
      continue;
    }
    if (inBlock) {
      if (char === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * Every unit that owns a `tsconfig.json`: `libs/<lib>`, `pillars/<id>`, and a
 * pillar's nested `app/`.
 *
 * @param {string} root
 * @returns {string[]} Absolute unit directories, sorted.
 */
export function discoverUnitDirs(root) {
  /** @type {string[]} */
  const out = [];
  for (const kind of ['libs', 'pillars']) {
    const kindRoot = join(root, kind);
    if (!existsSync(kindRoot)) continue;
    for (const entry of readdirSync(kindRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(kindRoot, entry.name);
      if (existsSync(join(dir, 'tsconfig.json'))) out.push(dir);
      const appDir = join(dir, 'app');
      if (existsSync(join(appDir, 'tsconfig.json'))) out.push(appDir);
    }
  }
  return out.toSorted((a, b) => a.localeCompare(b));
}

/**
 * Resolve a tsconfig's effective `exclude` list, following `extends` when the
 * config itself declares none. This mirrors tsc's real inheritance rule: a
 * config that declares its own `exclude` (even an empty array) fully replaces
 * whatever a base would otherwise contribute — arrays are never merged across
 * an extends chain. Every unit here extends `tsconfig.base.json`, which today
 * carries no `exclude` of its own; if that ever changed, a unit with no
 * `exclude` of its own (several already have none post-POPS-1448) would
 * silently inherit it, and a check that only reads the unit's own file would
 * miss it.
 *
 * @param {string} configPath Absolute path to a tsconfig.json.
 * @param {Set<string>} [seen] Visited config paths, guards an extends cycle.
 * @returns {string[]}
 */
export function resolveEffectiveExclude(configPath, seen = new Set()) {
  if (seen.has(configPath) || !existsSync(configPath)) return [];
  seen.add(configPath);
  const source = readFileSync(configPath, 'utf8');
  /** @type {{ exclude?: unknown; extends?: unknown }} */
  const config = JSON.parse(stripJsonComments(source));
  if (Array.isArray(config.exclude)) return config.exclude;

  let bases = /** @type {unknown[]} */ ([]);
  if (Array.isArray(config.extends)) bases = config.extends;
  else if (typeof config.extends === 'string') bases = [config.extends];

  let resolvedExclude = /** @type {string[]} */ ([]);
  for (const base of bases) {
    if (typeof base !== 'string' || !base.startsWith('.')) continue;
    const baseFile = EXTENSIONED_PATH.test(base) ? base : `${base}.json`;
    const baseExclude = resolveEffectiveExclude(resolve(dirname(configPath), baseFile), seen);
    if (baseExclude.length > 0) resolvedExclude = baseExclude;
  }
  return resolvedExclude;
}

/**
 * Read a unit's type-check project and report the exclude globs that hide its
 * tests, resolving its `extends` chain when the unit declares no `exclude` of
 * its own.
 *
 * @param {string} unitDir
 * @returns {string[]} Offending globs (empty when the unit is clean).
 */
export function offendingExcludes(unitDir) {
  const exclude = resolveEffectiveExclude(join(unitDir, 'tsconfig.json'));
  return exclude.filter((glob) => typeof glob === 'string' && hidesTests(glob));
}

const TSC_NOEMIT_INVOCATION = /^tsc\s+--noEmit(?:\s+-p\s+(\S+))?$/;

/**
 * @typedef {{ raw: string; recognized: boolean; projectPath: string | null }} TypecheckInvocation
 */

/**
 * Split a unit's `package.json` `typecheck` script into the sequence of
 * commands it runs, and resolve which ones are `tsc --noEmit [-p <project>]`
 * invocations against a concrete tsconfig path. A command that doesn't match
 * that shape (a lint step, a build tool, anything else) is kept as
 * unrecognized rather than dropped, so callers can tell "no typecheck script"
 * apart from "a typecheck script that runs something other than tsc".
 *
 * @param {string} unitDir
 * @returns {{ script: string | null; invocations: TypecheckInvocation[] }}
 */
export function readTypecheckInvocations(unitDir) {
  const pkgPath = join(unitDir, 'package.json');
  if (!existsSync(pkgPath)) return { script: null, invocations: [] };
  /** @type {{ scripts?: Record<string, unknown> }} */
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const script = pkg.scripts?.typecheck;
  if (typeof script !== 'string' || script.trim() === '') return { script: null, invocations: [] };

  const invocations = script.split('&&').map((part) => {
    const raw = part.trim();
    const match = raw.match(TSC_NOEMIT_INVOCATION);
    if (!match) return { raw, recognized: false, projectPath: null };
    const projectArg = match[1];
    const projectPath = projectArg ? resolve(unitDir, projectArg) : join(unitDir, 'tsconfig.json');
    return { raw, recognized: true, projectPath };
  });
  return { script, invocations };
}

/**
 * A unit's `typecheck` script must run `tsc --noEmit` against the unit's own
 * `tsconfig.json` — bare, or `-p tsconfig.json` naming the same file
 * explicitly. A script retargeted to only run against a different project
 * (most likely `tsconfig.build.json`, which legitimately excludes tests)
 * makes a red typecheck go green with no `exclude` or `include` change at
 * all. A second, appended invocation against a different project (the
 * nine-pillar `scripts/tsconfig.json` shape) does not fail this — the guard
 * only requires that the unit's own config appears somewhere in the chain.
 *
 * @param {string} unitDir
 * @returns {boolean}
 */
export function typecheckScriptCoversOwnConfig(unitDir) {
  const { invocations } = readTypecheckInvocations(unitDir);
  const ownConfig = join(unitDir, 'tsconfig.json');
  return invocations.some((inv) => inv.recognized && inv.projectPath === ownConfig);
}

/**
 * Resolve the set of files a tsconfig project actually type-checks, using
 * TypeScript's own config parser (`extends`, `include`, `exclude`, `files`,
 * all handled the way `tsc` itself handles them) rather than re-implementing
 * glob semantics. Returns an empty set on a missing or unparsable config —
 * callers treat that as "this project covers nothing", which is the correct
 * failure direction for a guard.
 *
 * @param {string} configPath
 * @returns {Set<string>} Absolute file paths.
 */
export function resolveProjectFileSet(configPath) {
  if (!existsSync(configPath)) return new Set();
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) return new Set();
  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, dirname(configPath));
  return new Set(parsed.fileNames.map((fileName) => resolve(fileName)));
}

const TEST_FILE_EXTENSION = /\.[cm]?tsx?$/;
const SKIPPED_DIR_NAMES = new Set(['node_modules', 'dist', '.git']);

/**
 * Every `*.test.*` / `*.spec.*` / `__tests__` TypeScript file actually on
 * disk under a unit. Stops descending into another discovered unit's own
 * directory (e.g. scanning `pillars/<id>` must not sweep up
 * `pillars/<id>/app`'s tests — that's a separately-discovered, separately
 * gated unit) so a unit's coverage is judged only against files that are
 * really its own.
 *
 * @param {string} unitDir
 * @param {ReadonlySet<string>} allUnitDirs Every discovered unit dir, including `unitDir` itself.
 * @returns {string[]} Absolute paths.
 */
export function findTestFilesOnDisk(unitDir, allUnitDirs) {
  /** @type {string[]} */
  const out = [];
  function walk(dir) {
    if (dir !== unitDir && allUnitDirs.has(dir)) return;
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && TEST_FILE_EXTENSION.test(entry.name) && hidesTests(full)) {
        out.push(full);
      }
    }
  }
  walk(unitDir);
  return out;
}

/**
 * Test files that sit on disk under a unit but that no `tsc --noEmit`
 * invocation in its `typecheck` script actually resolves — a narrowed
 * `include`, a missing second project for a tree like `scripts/` or `e2e/`,
 * or two files whose module specifier collides once their extension is
 * stripped (TypeScript keeps only one of `Foo.test.ts` / `Foo.test.tsx` when
 * both exist) all surface here the same way, because this compares against
 * TypeScript's own resolved file list rather than reasoning about the globs
 * that produced it.
 *
 * @param {string} unitDir
 * @param {ReadonlySet<string>} allUnitDirs Every discovered unit dir, including `unitDir` itself.
 * @returns {string[]} Absolute paths of on-disk test files no invoked project covers.
 */
export function findUncoveredTestFiles(unitDir, allUnitDirs) {
  const { invocations } = readTypecheckInvocations(unitDir);
  const covered = new Set();
  for (const inv of invocations) {
    if (!inv.recognized || !inv.projectPath) continue;
    for (const file of resolveProjectFileSet(inv.projectPath)) covered.add(file);
  }
  return findTestFilesOnDisk(unitDir, allUnitDirs).filter((file) => !covered.has(resolve(file)));
}

/**
 * Prove `offendingExcludes` resolves an `extends` chain: a unit that declares
 * no `exclude` of its own inherits one from its base, and a unit that
 * declares its own `exclude` overrides the base's entirely (tsc never merges
 * the two).
 *
 * @returns {boolean}
 */
function checkExtendsResolution() {
  const root = mkdtempSync(join(tmpdir(), 'tests-typechecked-selftest-'));
  try {
    writeFileSync(join(root, 'base.json'), JSON.stringify({ exclude: ['**/__tests__/**'] }));

    mkdirSync(join(root, 'inherits'), { recursive: true });
    writeFileSync(
      join(root, 'inherits', 'tsconfig.json'),
      JSON.stringify({ extends: '../base.json', include: ['src'] })
    );

    mkdirSync(join(root, 'overrides'), { recursive: true });
    writeFileSync(
      join(root, 'overrides', 'tsconfig.json'),
      JSON.stringify({ extends: '../base.json', exclude: ['node_modules', 'dist'] })
    );

    const inherited = offendingExcludes(join(root, 'inherits'));
    const overridden = offendingExcludes(join(root, 'overrides'));
    return inherited.length === 1 && inherited[0] === '**/__tests__/**' && overridden.length === 0;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Prove `typecheckScriptCoversOwnConfig` accepts a bare invocation and the
 * legitimate nine-pillar "appended second project" shape, and rejects a
 * script retargeted away from the unit's own config or missing entirely.
 *
 * @returns {boolean}
 */
function checkTypecheckScriptDetection() {
  const root = mkdtempSync(join(tmpdir(), 'tests-typechecked-selftest-script-'));
  try {
    const write = (dir, scripts) => {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'tsconfig.json'), JSON.stringify({ include: ['src'] }));
      writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ scripts }));
    };
    write('bare', { typecheck: 'tsc --noEmit' });
    write('explicit', { typecheck: 'tsc --noEmit -p tsconfig.json' });
    write('appended', { typecheck: 'tsc --noEmit && tsc --noEmit -p scripts/tsconfig.json' });
    write('retargeted', { typecheck: 'tsc --noEmit -p tsconfig.build.json' });
    write('no-script', { build: 'tsc -b tsconfig.build.json' });

    const bareOk = typecheckScriptCoversOwnConfig(join(root, 'bare'));
    const explicitOk = typecheckScriptCoversOwnConfig(join(root, 'explicit'));
    const appendedOk = typecheckScriptCoversOwnConfig(join(root, 'appended'));
    const retargetedCaught = !typecheckScriptCoversOwnConfig(join(root, 'retargeted'));
    const missingCaught = !typecheckScriptCoversOwnConfig(join(root, 'no-script'));
    return bareOk && explicitOk && appendedOk && retargetedCaught && missingCaught;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Prove `findUncoveredTestFiles` passes a unit whose `include` reaches every
 * test file on disk, and flags one whose `include` is narrowed past a real
 * test file — the shape `offendingExcludes` cannot see because there is no
 * `exclude` involved at all. Also proves the same detector catches the
 * TypeScript same-stem-collision case: `Foo.test.ts` sitting next to
 * `Foo.test.tsx` in a directory-form `include`, where TypeScript silently
 * keeps only one of the two with no config error.
 *
 * @returns {boolean}
 */
function checkUncoveredTestFilesDetection() {
  const root = mkdtempSync(join(tmpdir(), 'tests-typechecked-selftest-disk-'));
  try {
    const writeUnit = (dir, tsconfig) => {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'tsconfig.json'), JSON.stringify(tsconfig));
      writeFileSync(
        join(root, dir, 'package.json'),
        JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } })
      );
    };

    writeUnit('covered', { include: ['src'] });
    mkdirSync(join(root, 'covered/src/__tests__'), { recursive: true });
    writeFileSync(join(root, 'covered/src/index.ts'), 'export {};\n');
    writeFileSync(join(root, 'covered/src/__tests__/index.test.ts'), 'export {};\n');

    writeUnit('narrowed', { include: ['src/api/**'] });
    mkdirSync(join(root, 'narrowed/src/api'), { recursive: true });
    mkdirSync(join(root, 'narrowed/src/__tests__'), { recursive: true });
    writeFileSync(join(root, 'narrowed/src/api/index.ts'), 'export {};\n');
    writeFileSync(join(root, 'narrowed/src/__tests__/index.test.ts'), 'export {};\n');

    writeUnit('same-stem', { compilerOptions: { jsx: 'react-jsx' }, include: ['src'] });
    mkdirSync(join(root, 'same-stem/src'), { recursive: true });
    writeFileSync(join(root, 'same-stem/src/Foo.test.ts'), 'export {};\n');
    writeFileSync(join(root, 'same-stem/src/Foo.test.tsx'), 'export {};\n');

    const allUnitDirs = new Set(['covered', 'narrowed', 'same-stem'].map((dir) => join(root, dir)));

    const coveredResult = findUncoveredTestFiles(join(root, 'covered'), allUnitDirs);
    const narrowedResult = findUncoveredTestFiles(join(root, 'narrowed'), allUnitDirs);
    const sameStemResult = findUncoveredTestFiles(join(root, 'same-stem'), allUnitDirs);

    return (
      coveredResult.length === 0 &&
      narrowedResult.length === 1 &&
      narrowedResult[0]?.endsWith(join('src', '__tests__', 'index.test.ts')) === true &&
      sameStemResult.length === 1 &&
      sameStemResult[0]?.endsWith('Foo.test.tsx') === true
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Self-test: prove the detector flags each shape of test-hiding glob and
 * passes the globs a type-check project legitimately carries. CI runs this so
 * a regression that neuters the guard is caught without a real tree violation.
 *
 * @returns {boolean}
 */
function selfTest() {
  const hidden = [
    '**/__tests__/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    'src/**/*.test.ts',
    'src/__tests__/**',
    'src/**/test-helpers.ts',
    '**/*.spec.tsx',
  ];
  const allowed = ['node_modules', 'dist', 'scripts', '**/*.stories.tsx', '**/*.mdx'];

  const catchesHidden = hidden.every(hidesTests);
  const passesAllowed = allowed.every((glob) => !hidesTests(glob));

  const parsed = stripJsonComments('{\n// a comment\n"a": "http://x//y", /* block */ "b": 1\n}');
  const commentsOk = JSON.parse(parsed).a === 'http://x//y' && JSON.parse(parsed).b === 1;

  const extendsOk = checkExtendsResolution();
  const typecheckScriptOk = checkTypecheckScriptDetection();
  const uncoveredTestFilesOk = checkUncoveredTestFilesDetection();

  const ok =
    catchesHidden &&
    passesAllowed &&
    commentsOk &&
    extendsOk &&
    typecheckScriptOk &&
    uncoveredTestFilesOk;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  caught every test-hiding glob:      ${catchesHidden}`);
    console.error(`  passed legitimate excludes:         ${passesAllowed}`);
    console.error(`  stripped JSONC comments:            ${commentsOk}`);
    console.error(`  resolved extends correctly:         ${extendsOk}`);
    console.error(`  detected typecheck script coverage: ${typecheckScriptOk}`);
    console.error(`  detected uncovered test files:      ${uncoveredTestFilesOk}`);
  } else {
    console.log(
      'self-test OK — guard catches test-hiding excludes, retargeted typecheck scripts, ' +
        'and narrowed includes (incl. same-stem .ts/.tsx collisions), passes legitimate shapes.'
    );
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-tests-typechecked.mjs [--self-test]\n' +
        "Fails if a unit's tsconfig.json excludes its own test files from tsc."
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const unitDirs = discoverUnitDirs(repoRoot);
  const unitDirSet = new Set(unitDirs);
  /** @type {string[]} */
  const failures = [];
  for (const dir of unitDirs) {
    const unitLabel = relative(repoRoot, dir);

    const offenders = offendingExcludes(dir);
    if (offenders.length > 0) {
      failures.push(`${unitLabel}/tsconfig.json excludes ${offenders.join(', ')}`);
    }

    if (!typecheckScriptCoversOwnConfig(dir)) {
      const { script } = readTypecheckInvocations(dir);
      const described = script === null ? 'has no typecheck script' : `runs "${script}"`;
      failures.push(
        `${unitLabel}'s package.json ${described}, which never type-checks its own tsconfig.json`
      );
    }

    const uncovered = findUncoveredTestFiles(dir, unitDirSet);
    if (uncovered.length > 0) {
      const files = uncovered.map((file) => relative(repoRoot, file)).join(', ');
      failures.push(`${unitLabel} has test files no invoked tsc project resolves: ${files}`);
    }
  }

  console.log(`Scanned ${unitDirs.length} unit type-check project(s).`);
  if (failures.length === 0) {
    console.log('OK — every unit type-checks its own tests.');
    process.exit(0);
  }
  console.error('FAIL — these units hide their tests from `tsc --noEmit`:');
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    "Move a test-hiding exclusion to the unit's tsconfig.build.json (which decides what ships " +
      'in dist/), widen a narrowed include to reach every test file, or make the typecheck ' +
      "script run tsc --noEmit against the unit's own tsconfig.json (appending a second project " +
      'is fine — substituting one is not).'
  );
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
