#!/usr/bin/env node
/**
 * Composite/references guard.
 *
 * `pillars/documents`, `pillars/mcp` and `pillars/orchestrator` once shipped
 * `tsconfig.build.json` files missing `"composite": true` and a matching
 * `"references"` entry for the `@pops/*` libs their own source imports —
 * `tsc -b` could not resolve those libs' declarations and the pillars'
 * Docker builds broke. The only thing that ever caught it was
 * `quality.yml`'s "Exports discipline" job running `tsc -b` over whatever
 * changed-file scope a PR happens to narrow to: a PR touching one of these
 * pillars alongside anything else (another unit, a lib) broadens that scope
 * enough that the narrow failure path never fires, so the regression passes
 * silently. This is the parallel invariant `check-tests-typechecked.mjs`
 * enforces for `__tests__`/`.test.ts` exclusions, applied to the
 * `composite`/`references` relationship instead.
 *
 * For every `pillars/<id>/tsconfig.build.json`:
 *   - if that pillar's own `src` imports a `@pops/<name>` package that is
 *     itself a composite project — a `libs/<lib>` that owns BOTH a
 *     `package.json` (for the import name) AND a `tsconfig.build.json` (the
 *     reference target) — the pillar's `tsconfig.build.json` must resolve
 *     `compilerOptions.composite` to `true` (own value, or inherited through
 *     `extends` — `tsc` merges `compilerOptions` across the chain) and carry
 *     a `"references"` entry whose `path` resolves to that lib's
 *     `tsconfig.build.json`;
 *   - UNLESS the pillar's `tsconfig.build.json` is a `files: []`-only
 *     aggregator with no `include` (`pillars/shell/tsconfig.build.json` is
 *     the real one this guard was told to check) — it compiles nothing of
 *     its own, so it needs neither `composite` nor a matching reference.
 *     Recognition is intentionally exact (the pillar's own file, this shape
 *     only): a variant the guard does not model must fail loud, not pass
 *     quiet (ADR-045).
 *
 * A `@pops/<name>` import that resolves to a lib with no `tsconfig.build.json`
 * of its own (`locales`, `navigation`, `overlay-ego`, `ui` today) is not a
 * composite-project dependency at all — there is no reference target for
 * `tsc -b` to need, and every pillar that imports one of those already
 * confirms it by never referencing them. Only a lib that owns both halves is
 * a candidate.
 *
 * Imports are read straight off disk via the shared, statement-anchored
 * scanner in `import-scan.mjs` (also used by `check-lib-no-pillar-import.mjs`
 * and `check-contract-isolation.mjs`), not inferred from `package.json`
 * dependencies — a declared-but-unused workspace dependency should not force
 * a reference `tsc -b` does not need. Test files (`__tests__/`, `.test.*`,
 * `.spec.*`) are excluded from the scan via `isTestPath`: every observed
 * `tsconfig.build.json` already excludes them from the build, so an import
 * that exists only in a test is not something `tsc -b` needs a reference for
 * either.
 *
 * Usage:
 *   node scripts/ci/check-composite-references.mjs
 *   node scripts/ci/check-composite-references.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one pillar imports a lib it does not
 * declare composite/references for. Exit 2 = usage error.
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

import { extractSpecifiers, isTestPath } from './import-scan.mjs';

const EXTENSIONED_PATH = /\.[cm]?[tj]s$|\.json$/;
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Strip `//` and block comments so a JSONC tsconfig parses. String literals
 * are tracked so a `//` inside one (a URL, a glob) survives. Copied from
 * `check-tests-typechecked.mjs` rather than imported — that file is a guard,
 * not a shared library, and duplicating ~50 lines of a pure string function
 * is cheaper than coupling two independent guards' load-bearing behavior.
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
 * Parse a tsconfig-shaped JSONC file.
 *
 * @param {string} configPath
 * @returns {{ config: Record<string, unknown> | null; error: string | null }}
 */
function readJsonc(configPath) {
  let source;
  try {
    source = readFileSync(configPath, 'utf8');
  } catch (err) {
    return { config: null, error: `${configPath} could not be read: ${describeError(err)}` };
  }
  try {
    return { config: JSON.parse(stripJsonComments(source)), error: null };
  } catch (err) {
    return { config: null, error: `${configPath} is not valid JSON: ${describeError(err)}` };
  }
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function describeError(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Every `pillars/<id>/tsconfig.build.json` on disk.
 *
 * @param {string} root
 * @returns {Array<{ id: string; dir: string; configPath: string }>}
 */
export function discoverPillarBuildConfigs(root) {
  const pillarsRoot = join(root, 'pillars');
  if (!existsSync(pillarsRoot)) return [];
  /** @type {Array<{ id: string; dir: string; configPath: string }>} */
  const out = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(pillarsRoot, entry.name);
    const configPath = join(dir, 'tsconfig.build.json');
    if (existsSync(configPath)) out.push({ id: entry.name, dir, configPath });
  }
  return out.toSorted((a, b) => a.id.localeCompare(b.id));
}

/**
 * @typedef {{ lib: string; configPath: string }} LibTarget
 */

/**
 * Every `@pops/<name>` package that is a real composite-project reference
 * target: a `libs/<lib>` that owns BOTH a `package.json` (so it has a
 * publishable import name) AND a `tsconfig.build.json` (so `tsc -b` has
 * something to build and reference). A lib missing either half — no
 * `package.json` (the Rust `pops-ai`/`pops-settings` twins) or no
 * `tsconfig.build.json` (`locales`, `navigation`, `overlay-ego`, `ui` today)
 * — is not a candidate: there is no reference path for a pillar to declare.
 *
 * @param {string} root
 * @returns {{ targets: Map<string, LibTarget>; errors: string[] }}
 */
export function discoverLibReferenceTargets(root) {
  const libsRoot = join(root, 'libs');
  /** @type {Map<string, LibTarget>} */
  const targets = new Map();
  /** @type {string[]} */
  const errors = [];
  if (!existsSync(libsRoot)) return { targets, errors };

  for (const entry of readdirSync(libsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(libsRoot, entry.name);
    const pkgPath = join(dir, 'package.json');
    const configPath = join(dir, 'tsconfig.build.json');
    if (!existsSync(pkgPath) || !existsSync(configPath)) continue;

    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch (err) {
      errors.push(`libs/${entry.name}/package.json is not valid JSON: ${describeError(err)}`);
      continue;
    }
    if (typeof pkg.name !== 'string' || pkg.name === '') {
      errors.push(`libs/${entry.name}/package.json declares no "name" — cannot map its imports`);
      continue;
    }
    targets.set(pkg.name, { lib: entry.name, configPath });
  }
  return { targets, errors };
}

/**
 * A `tsconfig.build.json` that compiles nothing of its own: `"files": []`
 * with no `"include"` (`pillars/shell/tsconfig.build.json`'s shape). Checked
 * against the file's own declared shape only — no `extends` resolution — so
 * a shape this guard does not model is a violation rather than a silent
 * exemption (ADR-045).
 *
 * @param {Record<string, unknown>} config
 * @returns {boolean}
 */
export function isFilesOnlyAggregator(config) {
  return Array.isArray(config.files) && config.files.length === 0 && config.include === undefined;
}

/**
 * Resolve `compilerOptions.composite`, following `extends` when the pillar's
 * own file leaves it unset — `tsc` merges `compilerOptions` object fields
 * across an extends chain (own value wins over an inherited one), unlike the
 * full-replacement rule for array fields such as `include`/`exclude`.
 *
 * @param {string} configPath
 * @param {Set<string>} [seen] Visited config paths, guards an extends cycle.
 * @returns {{ composite: boolean; error: string | null }}
 */
export function resolveEffectiveComposite(configPath, seen = new Set()) {
  if (seen.has(configPath)) return { composite: false, error: null };
  seen.add(configPath);
  if (!existsSync(configPath)) return { composite: false, error: null };

  const { config, error } = readJsonc(configPath);
  if (error || !config) return { composite: false, error };

  const own = config.compilerOptions;
  if (own && typeof own === 'object' && typeof own.composite === 'boolean') {
    return { composite: own.composite, error: null };
  }

  let bases = /** @type {unknown[]} */ ([]);
  if (Array.isArray(config.extends)) bases = config.extends;
  else if (typeof config.extends === 'string') bases = [config.extends];

  for (const base of bases) {
    if (typeof base !== 'string' || !base.startsWith('.')) continue;
    const baseFile = EXTENSIONED_PATH.test(base) ? base : `${base}.json`;
    const resolved = resolveEffectiveComposite(resolve(dirname(configPath), baseFile), seen);
    if (resolved.error) return resolved;
    if (resolved.composite) return resolved;
  }
  return { composite: false, error: null };
}

/**
 * The base `@pops/<name>` a module specifier targets, stripping any subpath
 * (`@pops/pillar-sdk/server` -> `@pops/pillar-sdk`) so it matches a lib's
 * published package name regardless of which export the pillar imports.
 *
 * @param {string} specifier
 * @returns {string}
 */
export function basePackageName(specifier) {
  const parts = specifier.split('/');
  return parts.slice(0, 2).join('/');
}

/**
 * Every `@pops/*` base package name a pillar's own (non-test) `src` imports,
 * scanned straight off disk with the shared statement-anchored specifier
 * extractor.
 *
 * @param {string} srcDir
 * @returns {Set<string>}
 */
export function findPopsPackageImports(srcDir) {
  /** @type {Set<string>} */
  const found = new Set();
  if (!existsSync(srcDir)) return found;

  function walk(dir) {
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const dot = entry.name.lastIndexOf('.');
      if (dot < 0 || !SOURCE_EXT.has(entry.name.slice(dot))) continue;
      const full = join(dir, entry.name);
      if (isTestPath(relative(srcDir, full))) continue;

      const source = readFileSync(full, 'utf8');
      for (const specifier of extractSpecifiers(source)) {
        if (!specifier.startsWith('@pops/')) continue;
        found.add(basePackageName(specifier));
      }
    }
  }
  walk(srcDir);
  return found;
}

/**
 * @typedef {{ id: string; missingComposite: boolean; missingReferences: string[] }} PillarViolation
 */

/**
 * Assert one pillar's `tsconfig.build.json` declares composite/references for
 * every lib its source imports. Returns `null` when the pillar is exempt (a
 * files-only aggregator) or needs no reference (no matching lib import).
 *
 * @param {{ id: string; dir: string; configPath: string }} pillar
 * @param {Map<string, LibTarget>} libTargets
 * @returns {{ violation: PillarViolation | null; error: string | null }}
 */
export function checkPillar(pillar, libTargets) {
  const { config, error } = readJsonc(pillar.configPath);
  if (error || !config) return { violation: null, error };

  if (isFilesOnlyAggregator(config)) return { violation: null, error: null };

  const imported = findPopsPackageImports(join(pillar.dir, 'src'));
  /** @type {LibTarget[]} */
  const neededLibs = [];
  for (const pkgName of imported) {
    const target = libTargets.get(pkgName);
    if (target) neededLibs.push(target);
  }
  if (neededLibs.length === 0) return { violation: null, error: null };

  const { composite, error: compositeError } = resolveEffectiveComposite(pillar.configPath);
  if (compositeError) return { violation: null, error: compositeError };

  const declaredRefs = new Set(
    (Array.isArray(config.references) ? config.references : [])
      .filter((ref) => ref && typeof ref === 'object' && typeof ref.path === 'string')
      .map((ref) => resolve(pillar.dir, ref.path))
  );
  const missingReferences = [...new Set(neededLibs.filter((t) => !declaredRefs.has(t.configPath)))]
    .map((t) => t.lib)
    .toSorted((a, b) => a.localeCompare(b));

  if (!composite || missingReferences.length > 0) {
    return {
      violation: { id: pillar.id, missingComposite: !composite, missingReferences },
      error: null,
    };
  }
  return { violation: null, error: null };
}

/**
 * Scan every discovered pillar. Discovery asserts a floor rather than looping
 * silently over whatever it finds (ADR-045): zero pillars or zero candidate
 * libs is reported as its own failure, not folded into an empty — therefore
 * vacuously "clean" — failure list.
 *
 * @param {string} root
 * @returns {{ pillarCount: number; failures: string[] }}
 */
export function scanRepo(root) {
  const pillars = discoverPillarBuildConfigs(root);
  const { targets: libTargets, errors: libErrors } = discoverLibReferenceTargets(root);
  /** @type {string[]} */
  const failures = [...libErrors];

  if (pillars.length === 0) {
    failures.push(
      'discovered zero pillars/<id>/tsconfig.build.json files — that is not the same as every ' +
        'pillar being clean. Either pillars/ is genuinely empty of build configs (unlikely) or ' +
        'discoverPillarBuildConfigs no longer finds what it used to.'
    );
    return { pillarCount: 0, failures };
  }
  if (libTargets.size === 0) {
    failures.push(
      'discovered zero libs/<lib> owning both a package.json and a tsconfig.build.json — ' +
        'nothing to check a reference against. Either every composite lib genuinely lost its ' +
        'build config (unlikely) or discoverLibReferenceTargets no longer finds what it used to.'
    );
    return { pillarCount: pillars.length, failures };
  }

  for (const pillar of pillars) {
    const { violation, error } = checkPillar(pillar, libTargets);
    if (error) {
      failures.push(error);
      continue;
    }
    if (!violation) continue;

    if (violation.missingComposite) {
      failures.push(
        `pillars/${violation.id}/tsconfig.build.json imports a composite @pops/* lib but does ` +
          'not resolve "compilerOptions.composite" to true'
      );
    }
    if (violation.missingReferences.length > 0) {
      failures.push(
        `pillars/${violation.id}/tsconfig.build.json imports ${violation.missingReferences
          .map((lib) => `libs/${lib}`)
          .join(', ')} but has no "references" entry pointing at its tsconfig.build.json`
      );
    }
  }

  return { pillarCount: pillars.length, failures };
}

/**
 * Write a minimal fixture tree: a set of candidate libs (each with a
 * `package.json` name and a `tsconfig.build.json`) and a set of pillars whose
 * `src` imports some of them, with a `tsconfig.build.json` shaped however the
 * caller wants.
 *
 * @param {string} root
 * @param {Record<string, { pkgName: string }>} libs Lib dir name -> package name.
 * @param {Record<string, { imports: string[]; config: Record<string, unknown>; skipSrc?: boolean }>} pillars
 */
function writeFixture(root, libs, pillars) {
  for (const [lib, { pkgName }] of Object.entries(libs)) {
    const dir = join(root, 'libs', lib);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: pkgName }));
    writeFileSync(
      join(dir, 'tsconfig.build.json'),
      JSON.stringify({ compilerOptions: { composite: true } })
    );
  }
  for (const [id, { imports, config, skipSrc }] of Object.entries(pillars)) {
    const dir = join(root, 'pillars', id);
    if (!skipSrc) {
      mkdirSync(join(dir, 'src'), { recursive: true });
      const importLines = imports.map((spec, i) => `import { x${i} } from '${spec}';`).join('\n');
      writeFileSync(join(dir, 'src', 'index.ts'), `${importLines}\nexport {};\n`);
    } else {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(dir, 'tsconfig.build.json'), JSON.stringify(config));
  }
}

/**
 * Prove the degenerate case required by ADR-045 — a fixture pillar that
 * imports a composite lib but is missing composite/references must be
 * flagged, never silently pass — plus every companion shape `checkPillar`
 * must tell apart: a compliant pillar passes; missing only `composite`,
 * only the `references` entry, or both are each reported precisely (no
 * cross-contamination between a pillar's own missing libs); the files-only
 * aggregator exemption is real (mirroring
 * `pillars/shell/tsconfig.build.json`); an import matching no candidate lib
 * needs nothing.
 *
 * @returns {boolean}
 */
function checkPillarDetection() {
  const root = mkdtempSync(join(tmpdir(), 'composite-refs-selftest-pillar-'));
  try {
    writeFixture(
      root,
      { widgets: { pkgName: '@pops/widgets' }, gadgets: { pkgName: '@pops/gadgets' } },
      {
        compliant: {
          imports: ['@pops/widgets', '@pops/gadgets/sub'],
          config: {
            compilerOptions: { composite: true },
            include: ['src'],
            references: [
              { path: '../../libs/widgets/tsconfig.build.json' },
              { path: '../../libs/gadgets/tsconfig.build.json' },
            ],
          },
        },
        'missing-both': {
          imports: ['@pops/widgets'],
          config: { include: ['src'] },
        },
        'missing-reference-only': {
          imports: ['@pops/widgets', '@pops/gadgets'],
          config: {
            compilerOptions: { composite: true },
            include: ['src'],
            references: [{ path: '../../libs/widgets/tsconfig.build.json' }],
          },
        },
        'missing-composite-only': {
          imports: ['@pops/widgets'],
          config: {
            include: ['src'],
            references: [{ path: '../../libs/widgets/tsconfig.build.json' }],
          },
        },
        aggregator: {
          imports: [],
          skipSrc: true,
          config: { files: [], references: [] },
        },
        'no-relevant-import': {
          imports: ['@pops/unrelated'],
          config: { include: ['src'] },
        },
      }
    );

    const { targets: libTargets } = discoverLibReferenceTargets(root);
    const check = (id) =>
      checkPillar(
        {
          id,
          dir: join(root, 'pillars', id),
          configPath: join(root, 'pillars', id, 'tsconfig.build.json'),
        },
        libTargets
      );

    const compliant = check('compliant');
    const missingBoth = check('missing-both');
    const missingReferenceOnly = check('missing-reference-only');
    const missingCompositeOnly = check('missing-composite-only');
    const aggregator = check('aggregator');
    const noRelevantImport = check('no-relevant-import');

    const compliantPassed = compliant.violation === null;
    const missingBothCaught =
      missingBoth.violation?.missingComposite === true &&
      missingBoth.violation?.missingReferences.includes('widgets');
    const missingReferenceCaught =
      missingReferenceOnly.violation?.missingComposite === false &&
      missingReferenceOnly.violation?.missingReferences.length === 1 &&
      missingReferenceOnly.violation?.missingReferences.includes('gadgets') &&
      !missingReferenceOnly.violation?.missingReferences.includes('widgets');
    const missingCompositeCaught =
      missingCompositeOnly.violation?.missingComposite === true &&
      missingCompositeOnly.violation?.missingReferences.length === 0;
    const aggregatorExempt = aggregator.violation === null;
    const noRelevantImportPassed = noRelevantImport.violation === null;

    const ok =
      compliantPassed &&
      missingBothCaught &&
      missingReferenceCaught &&
      missingCompositeCaught &&
      aggregatorExempt &&
      noRelevantImportPassed;

    if (!ok) {
      console.error('  compliantPassed:        ', compliantPassed);
      console.error('  missingBothCaught:      ', missingBothCaught, missingBoth.violation);
      console.error(
        '  missingReferenceCaught: ',
        missingReferenceCaught,
        missingReferenceOnly.violation
      );
      console.error(
        '  missingCompositeCaught: ',
        missingCompositeCaught,
        missingCompositeOnly.violation
      );
      console.error('  aggregatorExempt:       ', aggregatorExempt, aggregator.violation);
      console.error(
        '  noRelevantImportPassed: ',
        noRelevantImportPassed,
        noRelevantImport.violation
      );
    }
    return ok;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Prove a malformed `tsconfig.build.json` is reported as a distinct error
 * rather than crashing `scanRepo` or being silently treated as clean.
 *
 * @returns {boolean}
 */
function checkMalformedConfigIsReported() {
  const root = mkdtempSync(join(tmpdir(), 'composite-refs-selftest-malformed-'));
  try {
    writeFixture(
      root,
      { widgets: { pkgName: '@pops/widgets' } },
      {
        malformed: { imports: ['@pops/widgets'], config: {} },
      }
    );
    writeFileSync(
      join(root, 'pillars', 'malformed', 'tsconfig.build.json'),
      '{ this is not valid json'
    );

    const { failures } = scanRepo(root);
    return failures.some((f) => f.includes('malformed') && /not valid JSON/.test(f));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Prove a subpath import (`@pops/widgets/deep/path`) resolves to its base
 * package, and that an import matching no candidate lib needs nothing.
 *
 * @returns {boolean}
 */
function checkSubpathAndUnmatchedImports() {
  return (
    basePackageName('@pops/pillar-sdk/server') === '@pops/pillar-sdk' &&
    basePackageName('@pops/types') === '@pops/types' &&
    basePackageName('@pops/ui/button/index') === '@pops/ui'
  );
}

/**
 * Prove a repo where discovery finds nothing is reported as a failure, not
 * folded into a vacuously empty (therefore "clean") failure list (ADR-045).
 *
 * @returns {boolean}
 */
function checkEmptyDiscoveryIsReported() {
  const root = mkdtempSync(join(tmpdir(), 'composite-refs-selftest-empty-'));
  try {
    const noPillars = scanRepo(root);
    mkdirSync(join(root, 'pillars', 'lonely', 'src'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'lonely', 'tsconfig.build.json'), JSON.stringify({}));
    const noLibs = scanRepo(root);
    return (
      noPillars.pillarCount === 0 &&
      noPillars.failures.length === 1 &&
      noLibs.pillarCount === 1 &&
      noLibs.failures.length === 1
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Self-test: prove the guard catches the degenerate case (missing
 * composite/references while importing a real lib) and every companion shape
 * it must model correctly, and reports rather than crashes on malformed input
 * or empty discovery. CI runs this so a regression that neuters the guard is
 * caught without relying on a real tree violation.
 *
 * @returns {boolean}
 */
function selfTest() {
  const pillarDetectionOk = checkPillarDetection();
  const malformedOk = checkMalformedConfigIsReported();
  const subpathOk = checkSubpathAndUnmatchedImports();
  const emptyDiscoveryOk = checkEmptyDiscoveryIsReported();

  const ok = pillarDetectionOk && malformedOk && subpathOk && emptyDiscoveryOk;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  degenerate + positive cases: ${pillarDetectionOk}`);
    console.error(`  malformed config reported:   ${malformedOk}`);
    console.error(`  subpath import resolution:   ${subpathOk}`);
    console.error(`  reported an empty discovery:  ${emptyDiscoveryOk}`);
  } else {
    console.log(
      'self-test OK — guard flags a pillar missing composite/references for a lib it imports, ' +
        'exempts the files-only aggregator shape, resolves subpath imports, and reports rather ' +
        'than crashes on malformed config or empty discovery.'
    );
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-composite-references.mjs [--self-test]\n' +
        "Fails if a pillar's tsconfig.build.json imports a @pops/* lib that owns a " +
        'tsconfig.build.json of its own, without declaring "composite": true and a matching ' +
        '"references" entry — unless the pillar is a files-only aggregator ' +
        "(pillars/shell/tsconfig.build.json's shape)."
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { pillarCount, failures } = scanRepo(repoRoot);
  console.log(`Scanned ${pillarCount} pillars/<id>/tsconfig.build.json file(s).`);
  if (failures.length === 0) {
    console.log(
      'OK — every pillar declares composite/references for every composite lib it imports.'
    );
    process.exit(0);
  }
  console.error(
    'FAIL — these pillars import a composite @pops/* lib without the wiring `tsc -b` needs to ' +
      'resolve it:'
  );
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nSet "composite": true in the pillar\'s tsconfig.build.json compilerOptions and add a ' +
      '"references" entry pointing at the lib\'s tsconfig.build.json — or, if the pillar compiles ' +
      'nothing of its own, make it a files-only aggregator like pillars/shell/tsconfig.build.json.'
  );
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
