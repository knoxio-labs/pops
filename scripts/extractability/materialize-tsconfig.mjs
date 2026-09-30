#!/usr/bin/env node
/**
 * EX-2 helper — make a sandboxed unit's tsconfig self-contained.
 *
 * In the monorepo a unit's tsconfig.json extends a repo-root base
 * (`../../tsconfig.base.json`). Once the unit is copied out for isolation that
 * base is no longer reachable, so the extends must be MATERIALISED: the full
 * extends chain is resolved (via the TS config parser) and the effective
 * compilerOptions are inlined into the copied tsconfig, with any out-of-unit
 * `extends` removed. Local (in-unit) `extends` are preserved as-is.
 *
 * This mirrors exactly what a real extracted repo carries: its own complete
 * tsconfig, not a dangling reference to a monorepo root. It does NOT change any
 * actual compiler setting — it just freezes the resolved values in place.
 *
 * Every `tsconfig*.json` in the unit is recognised. A config present in the
 * ORIGINAL unit but missing from the SANDBOX copy — renamed, deleted, or an
 * incomplete copy — is a hard failure, not a silent skip: a config the copy
 * lost is one nothing downstream will resolve. A config that exists but fails
 * to parse is also a named error, never a swallowed `null`.
 *
 * Usage:
 *   node scripts/extractability/materialize-tsconfig.mjs <sandbox-unit-dir> <original-unit-dir>
 *   node scripts/extractability/materialize-tsconfig.mjs --self-test
 *
 * Exit codes: 0 = materialised (or genuinely had nothing to materialise), and
 *   said which; 1 = a tsconfig could not be read or accounted for; 2 =
 *   bad invocation, or a self-test assertion failed.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { toStringArray } from './lib.mjs';

const CONFIG_FILE = /^tsconfig.*\.json$/u;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'target', '.git']);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @param {string[]} argv */
export function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const [sandboxDir, originalDir] = argv;
  if (!sandboxDir || !originalDir) {
    process.stderr.write(
      'usage: materialize-tsconfig.mjs <sandbox-unit-dir> <original-unit-dir> | --self-test\n'
    );
    return 2;
  }

  const originalNames = findTsconfigNames(originalDir);
  const sandboxNames = findTsconfigNames(sandboxDir);
  const names = [...new Set([...originalNames, ...sandboxNames])].toSorted();
  let materialised = 0;
  let considered = 0;
  /** @type {string[]} */
  const problems = [];

  for (const name of names) {
    const sandboxConfig = join(sandboxDir, name);
    const originalConfig = join(originalDir, name);

    if (!sandboxNames.has(name)) {
      problems.push(
        `${name}: present in ${originalDir} but missing from the sandbox copy at ${sandboxConfig} — ` +
          'renamed, deleted, or the copy that produced the sandbox is incomplete'
      );
      continue;
    }
    if (!originalNames.has(name)) {
      problems.push(
        `${name}: present in the sandbox copy at ${sandboxConfig} but missing from ${originalDir} — ` +
          'cannot resolve its real extends chain without the unit it was copied from'
      );
      continue;
    }

    considered += 1;
    try {
      let touched = materialiseOne(sandboxConfig, originalConfig, sandboxDir);
      touched = stripExternalReferences(sandboxConfig, sandboxDir) || touched;
      if (touched) materialised += 1;
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`materialize-tsconfig: FAILED for ${sandboxDir}\n`);
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    return 1;
  }

  if (considered === 0) {
    process.stdout.write(
      `materialize-tsconfig: ${originalDir} has no tsconfig*.json — nothing to materialise\n`
    );
    return 0;
  }

  process.stdout.write(
    `materialised ${materialised} of ${considered} tsconfig file(s) in ${sandboxDir}\n`
  );
  return 0;
}

/** @param {string} unitDir @returns {Set<string>} Relative config paths */
function findTsconfigNames(unitDir) {
  /** @type {Set<string>} */
  const names = new Set();
  const walk = (/** @type {string} */ directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(join(directory, entry.name));
        }
      } else if (entry.isFile() && CONFIG_FILE.test(entry.name)) {
        names.add(relative(unitDir, join(directory, entry.name)));
      }
    }
  };
  walk(unitDir);
  return names;
}

/**
 * @param {string} sandboxConfig path to the copied tsconfig (rewritten in place)
 * @param {string} originalConfig path to the in-repo tsconfig (used to resolve the real chain)
 * @returns {boolean} whether an out-of-unit extends was inlined
 */
function materialiseOne(sandboxConfig, originalConfig, sandboxUnitDir) {
  const raw = readConfigJson(sandboxConfig);

  const extendsList = toStringArray(raw.extends);

  // Determine which extends targets point outside the unit (the ones that won't
  // exist in the sandbox). Local relative extends to a sibling in-unit config
  // are kept untouched.
  const configDir = dirname(sandboxConfig);
  const outOfUnit = extendsList.filter((ext) => isOutsideUnit(sandboxUnitDir, configDir, ext));
  if (outOfUnit.length === 0) return false;

  // Resolve the fully-merged compilerOptions from the ORIGINAL location (where
  // the chain is intact), then inline them.
  const resolved = ts.parseJsonConfigFileContent(
    readConfigJson(originalConfig),
    ts.sys,
    dirname(originalConfig)
  );

  const inlinedOptions = serialisableCompilerOptions(resolved.options, dirname(originalConfig));

  // Keep only in-unit extends; merge inherited options UNDER the unit's own
  // explicit options so local overrides still win.
  const keptExtends = extendsList.filter((ext) => !isOutsideUnit(sandboxUnitDir, configDir, ext));
  const ownOptions =
    raw.compilerOptions && typeof raw.compilerOptions === 'object' ? raw.compilerOptions : {};
  raw.compilerOptions = { ...inlinedOptions, ...ownOptions };
  if (keptExtends.length === 0) delete raw.extends;
  else raw.extends = keptExtends.length === 1 ? keptExtends[0] : keptExtends;

  writeFileSync(sandboxConfig, `${JSON.stringify(raw, null, 2)}\n`);
  return true;
}

/**
 * Drops TS project `references` whose path resolves outside the unit. In an
 * extracted repo a sibling unit is consumed as an installed package (its packed
 * `.d.ts`), not as a composite project reference — so those references can't and
 * shouldn't resolve. In-unit references (rare) are kept.
 * @param {string} sandboxConfig
 * @returns {boolean} whether any reference was removed
 */
function stripExternalReferences(sandboxConfig, sandboxUnitDir) {
  const raw = readConfigJson(sandboxConfig);
  if (!Array.isArray(raw.references)) return false;
  const configDir = dirname(sandboxConfig);
  const kept = raw.references.filter(
    (r) => r && typeof r.path === 'string' && !isOutsideUnit(sandboxUnitDir, configDir, r.path)
  );
  if (kept.length === raw.references.length) return false;
  if (kept.length === 0) delete raw.references;
  else raw.references = kept;
  writeFileSync(sandboxConfig, `${JSON.stringify(raw, null, 2)}\n`);
  return true;
}

/** @param {string} unitDir @param {string} configDir @param {string} targetPath */
function isOutsideUnit(unitDir, configDir, targetPath) {
  if (!targetPath.startsWith('.')) return true;
  const target = resolve(configDir, targetPath);
  return target !== unitDir && !target.startsWith(unitDir + '/');
}

/**
 * Reads and parses a tsconfig file through the TypeScript config parser.
 * Never swallows a failure into `null`: a file that exists but does not parse
 * is exactly the case this guard exists to catch, so it throws a named error —
 * which file, and why — instead.
 * @param {string} file
 * @returns {Record<string, unknown>}
 */
function readConfigJson(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(
      `${file}: could not be read — ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  const parsed = ts.parseConfigFileTextToJson(file, text);
  if (parsed.error) {
    throw new Error(
      `${file}: does not parse as JSON — ${ts.flattenDiagnosticMessageText(parsed.error.messageText, ' ')}`
    );
  }
  if (!parsed.config || typeof parsed.config !== 'object') {
    throw new Error(`${file}: parsed to a non-object value`);
  }
  return parsed.config;
}

/**
 * Reduces resolved ts.CompilerOptions back to a JSON-serialisable, path-free
 * subset suitable for inlining. Drops path-bearing and project-internal options
 * (the sandbox sets its own outDir/rootDir via the unit's existing config) and
 * normalises enum-valued options back to their string form.
 *
 * @param {import('typescript').CompilerOptions} options
 * @param {string} _baseDir
 */
function serialisableCompilerOptions(options, _baseDir) {
  /** @type {Record<string, unknown>} */
  const out = {};
  const drop = new Set([
    'configFilePath',
    // `pathsBasePath` is an INTERNAL field TS injects alongside a resolved
    // `paths`/`baseUrl` — it is not a writable tsconfig option, so emitting it
    // makes tsc reject the materialised config (TS5023 "Unknown compiler
    // option"). Dropped together with the path-bearing options below.
    'pathsBasePath',
    'outDir',
    'rootDir',
    'baseUrl',
    'paths',
    'project',
    'tsBuildInfoFile',
    'composite',
    'declarationDir',
  ]);
  for (const [key, value] of Object.entries(options)) {
    if (drop.has(key)) continue;
    if (value === undefined) continue;
    const normalised = normaliseOption(key, value);
    if (normalised !== undefined) out[key] = normalised;
  }
  return out;
}

/** @param {string} key @param {unknown} value */
function normaliseOption(key, value) {
  if (key === 'target' && typeof value === 'number') return ts.ScriptTarget[value]?.toLowerCase();
  if (key === 'module' && typeof value === 'number') return ts.ModuleKind[value];
  if (key === 'moduleResolution' && typeof value === 'number')
    return ts.ModuleResolutionKind[value];
  if (key === 'jsx' && typeof value === 'number') return ts.JsxEmit[value];
  if (key === 'lib' && Array.isArray(value)) return value;
  if (Array.isArray(value) || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  return undefined;
}

/**
 * Builds a fixture tree exercising the cases this guard must tell
 * apart, shared between `--self-test` and the Vitest suite so the two fixture
 * sets cannot drift apart:
 *
 *   - `withRealExtends`         — a genuine out-of-unit extends that must be
 *                                 inlined, under `tsconfig.json`.
 *   - `withoutTsconfig`         — no tsconfig in either copy (fine).
 *   - `renamedInSandbox`        — `tsconfig.json`: the original has one, the
 *                                 sandbox copy does not — a rename, a delete,
 *                                 or an incomplete copy.
 *   - `malformed`               — `tsconfig.json`, present in both copies,
 *                                 but truncated JSON.
 *   - `renamedBuildJsonInSandbox` / `malformedBuildJson` — the same two
 *                                 failure modes under `tsconfig.build.json`.
 *
 * @param {string} rootDir an empty directory to build the tree under
 */
export function buildFixtures(rootDir) {
  const baseConfig = join(rootDir, 'base', 'tsconfig.base.json');
  mkdirSync(dirname(baseConfig), { recursive: true });
  writeFileSync(
    baseConfig,
    JSON.stringify({ compilerOptions: { strict: true, target: 'es2022', skipLibCheck: true } })
  );

  const realExtends = JSON.stringify({
    extends: '../../base/tsconfig.base.json',
    compilerOptions: { module: 'nodenext' },
  });
  const truncated = '{ "extends": "../../base/tsconfig.base.json", "compilerOptions": {';

  /**
   * @param {string} scenario
   * @param {{ original?: string, sandbox?: string }} content
   * @param {string} [name]
   */
  const pair = (scenario, content, name = 'tsconfig.json') => {
    const originalDir = join(rootDir, 'original', scenario);
    const sandboxDir = join(rootDir, 'sandbox', scenario);
    mkdirSync(originalDir, { recursive: true });
    mkdirSync(sandboxDir, { recursive: true });
    if (content.original !== undefined) {
      writeFileSync(join(originalDir, name), content.original);
    }
    if (content.sandbox !== undefined) {
      writeFileSync(join(sandboxDir, name), content.sandbox);
    }
    return { originalDir, sandboxDir };
  };

  return {
    withRealExtends: pair('with-real-extends', { original: realExtends, sandbox: realExtends }),
    withoutTsconfig: pair('without-tsconfig', {}),
    renamedInSandbox: pair('renamed-in-sandbox', { original: realExtends }),
    malformed: pair('malformed', { original: truncated, sandbox: truncated }),
    renamedBuildJsonInSandbox: pair(
      'renamed-build-json-in-sandbox',
      { original: realExtends },
      'tsconfig.build.json'
    ),
    malformedBuildJson: pair(
      'malformed-build-json',
      { original: truncated, sandbox: truncated },
      'tsconfig.build.json'
    ),
  };
}

/**
 * Self-test: proves the guard is loud, not merely quiet-and-green. Runs `main`
 * itself — not just the internal helpers — against the fixtures above, so the
 * assertions cover the same exit codes a CI job would see. Per ADR-045 the
 * positive case alone is not sufficient, so this also asserts both failure
 * modes are caught and the "genuinely none" case is not conflated with them.
 * @returns {number} 0 = pass, 2 = an assertion failed.
 */
function selfTest() {
  /** @type {string[]} */
  const failures = [];
  /** @param {boolean} cond @param {string} msg */
  const assert = (cond, msg) => {
    if (!cond) failures.push(msg);
  };

  const tempRoot = join(repoRoot, 'tmp');
  mkdirSync(tempRoot, { recursive: true });
  const root = mkdtempSync(join(tempRoot, 'materialize-tsconfig-selftest-'));
  try {
    const fixtures = buildFixtures(root);

    const realExtendsExit = main([
      fixtures.withRealExtends.sandboxDir,
      fixtures.withRealExtends.originalDir,
    ]);
    assert(
      realExtendsExit === 0,
      `expected exit 0 materialising a genuine out-of-unit extends, got ${realExtendsExit}`
    );
    const written = JSON.parse(
      readFileSync(join(fixtures.withRealExtends.sandboxDir, 'tsconfig.json'), 'utf8')
    );
    assert(
      written.extends === undefined,
      'out-of-unit extends was not removed after materialising'
    );
    assert(
      written.compilerOptions?.strict === true,
      'inherited compilerOptions were not inlined from the base'
    );
    assert(
      written.compilerOptions?.module === 'nodenext',
      "the unit's own compilerOptions did not survive the merge"
    );

    const noneExit = main([
      fixtures.withoutTsconfig.sandboxDir,
      fixtures.withoutTsconfig.originalDir,
    ]);
    assert(
      noneExit === 0,
      `expected exit 0 for a unit with genuinely no tsconfig, got ${noneExit}`
    );

    const renamedExit = main([
      fixtures.renamedInSandbox.sandboxDir,
      fixtures.renamedInSandbox.originalDir,
    ]);
    assert(
      renamedExit === 1,
      `expected exit 1 when the original has a tsconfig the sandbox copy lost, got ${renamedExit}`
    );

    const malformedExit = main([fixtures.malformed.sandboxDir, fixtures.malformed.originalDir]);
    assert(
      malformedExit === 1,
      `expected exit 1 for a tsconfig that fails to parse, got ${malformedExit}`
    );

    // The same two failure modes again under tsconfig.build.json.
    const renamedBuildJsonExit = main([
      fixtures.renamedBuildJsonInSandbox.sandboxDir,
      fixtures.renamedBuildJsonInSandbox.originalDir,
    ]);
    assert(
      renamedBuildJsonExit === 1,
      `expected exit 1 when the original has a tsconfig.build.json the sandbox copy lost, got ${renamedBuildJsonExit}`
    );

    const malformedBuildJsonExit = main([
      fixtures.malformedBuildJson.sandboxDir,
      fixtures.malformedBuildJson.originalDir,
    ]);
    assert(
      malformedBuildJsonExit === 1,
      `expected exit 1 for a tsconfig.build.json that fails to parse, got ${malformedBuildJsonExit}`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    process.stderr.write(`✗ materialize-tsconfig self-test: ${failures.length} failure(s)\n`);
    for (const f of failures) process.stderr.write(`    - ${f}\n`);
    return 2;
  }
  process.stdout.write(
    '✔ materialize-tsconfig self-test passed — inlines a real extends, tells "genuinely none" ' +
      'apart from "lost after copying" and from "does not parse".\n'
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
