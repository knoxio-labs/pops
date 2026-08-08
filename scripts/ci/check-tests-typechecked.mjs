#!/usr/bin/env node
/**
 * Test-files-are-type-checked guard.
 *
 * A unit's `typecheck` script is `tsc --noEmit` over that unit's
 * `tsconfig.json`. If that project excludes `__tests__/` or `*.test.*`, the
 * unit's tests are type-checked by nothing at all — vitest transpiles without
 * checking — and a test can call a helper with the wrong arguments, assert
 * against a field that does not exist, or hold a stale fixture shape while both
 * `pnpm typecheck` and `pnpm test` stay green.
 *
 * The excludes belong on `tsconfig.build.json`, which decides what ships in
 * `dist/` — a different question from what gets checked. This guard enforces
 * exactly that split: the type-check project may not exclude tests; the build
 * project may.
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

  const ok = catchesHidden && passesAllowed && commentsOk && extendsOk;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  caught every test-hiding glob:  ${catchesHidden}`);
    console.error(`  passed legitimate excludes:     ${passesAllowed}`);
    console.error(`  stripped JSONC comments:        ${commentsOk}`);
    console.error(`  resolved extends correctly:     ${extendsOk}`);
  } else {
    console.log('self-test OK — guard catches test-hiding excludes, passes build-only ones.');
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
  /** @type {string[]} */
  const failures = [];
  for (const dir of unitDirs) {
    const offenders = offendingExcludes(dir);
    if (offenders.length > 0) {
      failures.push(`${relative(repoRoot, dir)}/tsconfig.json excludes ${offenders.join(', ')}`);
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
    "Move the exclusion to the unit's tsconfig.build.json, which decides what ships in dist/."
  );
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
