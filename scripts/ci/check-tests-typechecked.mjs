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
 *      file actually on disk under the unit is matched against every project
 *      the `typecheck` script invokes, using `include`/`exclude`/`files`
 *      resolved with `node:fs`'s own glob engine (`globSync`) rather than a
 *      hand-rolled matcher. Comparing real files rather than reasoning about
 *      the globs in the abstract is what catches a narrowed `include` — no
 *      `exclude` involved at all — without a second layer of pattern
 *      guessing. Separately, and independent of any include/exclude
 *      resolution: two files whose module specifier collides once a
 *      recognized extension is stripped (`Foo.test.ts` next to
 *      `Foo.test.tsx`) are flagged outright, because TypeScript's own
 *      Program construction silently keeps only one of the two — a real
 *      glob match on both proves nothing, since the loss happens after
 *      matching succeeds.
 *
 * `check-tests-typechecked.mjs` runs in `agent-review.yml`'s zero-dependency
 * job, straight after checkout with no `pnpm install` (ADR-045's stated
 * exception) — so it cannot `import 'typescript'` to resolve a project's
 * effective file set. `node:fs`'s built-in `globSync` (stable since Node 22,
 * no install required) is the real engine used instead; it does not know
 * about the same-stem collision above, because that is not a matching
 * question — the dedicated disk scan next to it is.
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
  globSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
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
 * @typedef {{ raw: string; recognized: boolean; projectPath: string | null }} TypecheckInvocation
 */

/**
 * Parse a single command as `tsc --noEmit [-p <project>]` (or `--project`),
 * tolerant of flag order — `tsc -p tsconfig.json --noEmit` type-checks the
 * exact same project as `tsc --noEmit -p tsconfig.json`, and a script author
 * has no reason to prefer one order over the other. Deliberately does NOT
 * tolerate other flags (`--pretty false` and the like): an invocation this
 * guard cannot account for is a shape it does not model, which ADR-045 says
 * to report rather than wave through.
 *
 * @param {string} command
 * @returns {{ recognized: boolean; projectArg: string | null }}
 */
function parseTscNoEmitCommand(command) {
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens[0] !== 'tsc') return { recognized: false, projectArg: null };

  let hasNoEmit = false;
  /** @type {string | undefined} */
  let projectArg;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--noEmit') {
      hasNoEmit = true;
    } else if (token === '-p' || token === '--project') {
      const next = tokens[i + 1];
      if (next === undefined) return { recognized: false, projectArg: null };
      projectArg = next;
      i += 1;
    } else {
      return { recognized: false, projectArg: null };
    }
  }
  return hasNoEmit
    ? { recognized: true, projectArg: projectArg ?? null }
    : { recognized: false, projectArg: null };
}

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
/**
 * Resolve a `-p`/`--project` argument the way `tsc` itself does: a path to
 * an existing directory means "the `tsconfig.json` inside it" (so `-p .`
 * and `-p scripts` both name a directory, not a config file directly),
 * anything else is used as the config path as given.
 *
 * @param {string} unitDir
 * @param {string | null} projectArg
 * @returns {string}
 */
function resolveTscProjectPath(unitDir, projectArg) {
  if (!projectArg) return join(unitDir, 'tsconfig.json');
  const resolved = resolve(unitDir, projectArg);
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    return join(resolved, 'tsconfig.json');
  }
  return resolved;
}

export function readTypecheckInvocations(unitDir) {
  const pkgPath = join(unitDir, 'package.json');
  if (!existsSync(pkgPath)) return { script: null, invocations: [] };
  /** @type {{ scripts?: Record<string, unknown> }} */
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const script = pkg.scripts?.typecheck;
  if (typeof script !== 'string' || script.trim() === '') return { script: null, invocations: [] };

  const invocations = script.split('&&').map((part) => {
    const raw = part.trim();
    const { recognized, projectArg } = parseTscNoEmitCommand(raw);
    if (!recognized) return { raw, recognized: false, projectPath: null };
    const projectPath = resolveTscProjectPath(unitDir, projectArg);
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
 * Resolve whether a tsconfig array field (`include` or `files`) is declared
 * anywhere in the config's own JSON or its `extends` chain, and its value
 * when it is — an own declaration (even an empty array) fully replaces
 * whatever a base would otherwise contribute, mirroring tsc's real
 * inheritance rule. Presence has to be tracked separately from "resolved to
 * an empty array" here (unlike {@link resolveEffectiveExclude}): a config
 * that declares `files` but no `include` (the `tsconfig.build.json` shape —
 * `{ "files": [], "references": [...] }`) type-checks only its explicit
 * `files` entries, never defaulting to "everything", while a config that
 * declares neither defaults to `**\/*` the way `tsc` itself does.
 *
 * @param {string} configPath
 * @param {'include' | 'files'} field
 * @param {Set<string>} [seen] Visited config paths, guards an extends cycle.
 * @returns {{ present: boolean; value: unknown[] }}
 */
function resolveArrayFieldPresence(configPath, field, seen = new Set()) {
  if (seen.has(configPath) || !existsSync(configPath)) return { present: false, value: [] };
  seen.add(configPath);
  /** @type {Record<string, unknown>} */
  const config = JSON.parse(stripJsonComments(readFileSync(configPath, 'utf8')));
  if (Array.isArray(config[field])) return { present: true, value: config[field] };

  let bases = /** @type {unknown[]} */ ([]);
  if (Array.isArray(config.extends)) bases = config.extends;
  else if (typeof config.extends === 'string') bases = [config.extends];

  for (const base of bases) {
    if (typeof base !== 'string' || !base.startsWith('.')) continue;
    const baseFile = EXTENSIONED_PATH.test(base) ? base : `${base}.json`;
    const resolved = resolveArrayFieldPresence(resolve(dirname(configPath), baseFile), field, seen);
    if (resolved.present) return resolved;
  }
  return { present: false, value: [] };
}

const BARE_GLOB_ENTRY = /^[^*?]+$/;

/**
 * Match one `include`/`exclude` entry against real files under `dir`, using
 * `node:fs`'s own glob engine — the real implementation this guard can reach
 * without `pnpm install` (ADR-045). A bare entry with no glob metacharacters
 * is resolved the way tsc resolves one: a single existing file is that file
 * literally; anything else (a directory, or a path that doesn't exist yet)
 * is treated as a directory reference and matched recursively.
 *
 * @param {string} dir
 * @param {string} pattern
 * @returns {{ files: string[]; error: string | null }}
 */
function matchTsconfigGlob(dir, pattern) {
  let expanded = pattern;
  if (BARE_GLOB_ENTRY.test(pattern)) {
    const abs = resolve(dir, pattern);
    if (existsSync(abs) && !statSync(abs).isDirectory()) {
      return { files: [pattern], error: null };
    }
    expanded = `${pattern}/**/*`;
  }
  try {
    return { files: globSync(expanded, { cwd: dir }), error: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { files: [], error: `unresolvable pattern "${pattern}" in ${dir}: ${reason}` };
  }
}

/**
 * Resolve the set of files a tsconfig project actually type-checks —
 * `extends`, `include`, `exclude` and `files` all matched against the real
 * filesystem via `node:fs`'s `globSync` rather than a hand-rolled pattern
 * matcher. A `files` entry is always covered regardless of `exclude` (tsc
 * never filters `files` through `exclude`); an `include` match is dropped
 * when `exclude` also matches it.
 *
 * Does NOT model tsc's *implicit* default excludes (`node_modules`,
 * `bower_components`, `jspm_packages`) when a config declares no `exclude`
 * of its own — every unit's `include` here is scoped under `src`/`scripts`/
 * an equivalent subdirectory, never a bare `**\/*` that would actually reach
 * a nested `node_modules`, and {@link findTestFilesOnDisk} independently
 * skips `node_modules`/`dist`/`.git` while walking for on-disk test-file
 * candidates — so this omission cannot currently turn a real gap into a
 * false pass. If a unit's `include` ever widens enough to make that not
 * true, this is the assumption to revisit.
 *
 * @param {string} configPath
 * @returns {{ files: Set<string>; errors: string[] }} Absolute file paths;
 *   `errors` is non-empty when the config or a glob in it could not be read,
 *   in which case `files` reflects whatever still resolved (often nothing).
 */
export function resolveProjectFileSet(configPath) {
  if (!existsSync(configPath)) {
    return { files: new Set(), errors: [`${configPath} does not exist`] };
  }

  let includeField, filesField, excludeGlobs;
  try {
    includeField = resolveArrayFieldPresence(configPath, 'include');
    filesField = resolveArrayFieldPresence(configPath, 'files');
    excludeGlobs = resolveEffectiveExclude(configPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { files: new Set(), errors: [`${configPath} is not valid JSON: ${reason}`] };
  }

  const unitDir = dirname(configPath);
  let includeGlobs;
  if (includeField.present) includeGlobs = includeField.value;
  else if (filesField.present) includeGlobs = [];
  else includeGlobs = ['**/*'];

  /** @type {string[]} */
  const errors = [];
  const covered = new Set();
  for (const file of filesField.value) {
    if (typeof file === 'string') covered.add(resolve(unitDir, file));
  }

  const includedAbs = new Set();
  for (const pattern of includeGlobs) {
    if (typeof pattern !== 'string') continue;
    const { files, error } = matchTsconfigGlob(unitDir, pattern);
    if (error) errors.push(error);
    for (const rel of files) includedAbs.add(resolve(unitDir, rel));
  }
  const excludedAbs = new Set();
  for (const pattern of excludeGlobs) {
    if (typeof pattern !== 'string') continue;
    const { files, error } = matchTsconfigGlob(unitDir, pattern);
    if (error) errors.push(error);
    for (const rel of files) excludedAbs.add(resolve(unitDir, rel));
  }
  for (const file of includedAbs) {
    if (!excludedAbs.has(file)) covered.add(file);
  }

  return { files: covered, errors };
}

const TEST_FILE_EXTENSION = /\.[cm]?tsx?$/;
const SKIPPED_DIR_NAMES = new Set(['node_modules', 'dist', '.git']);

/**
 * Every TypeScript file actually on disk under a unit that {@link hidesTests}
 * would flag if it appeared in an `exclude` glob instead — `*.test.*`,
 * `*.spec.*`, `__tests__`, and the `test-helpers`/`test-utils` support-module
 * pattern. Stops descending into another discovered unit's own directory
 * (e.g. scanning `pillars/<id>` must not sweep up `pillars/<id>/app`'s tests
 * — that's a separately-discovered, separately gated unit) so a unit's
 * coverage is judged only against files that are really its own.
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

const RECOGNIZED_TS_EXTENSIONS = ['.d.ts', '.tsx', '.ts', '.cts', '.mts'];

/**
 * The module specifier a file resolves to once a single recognized
 * TypeScript extension is stripped. Tried longest-first so a declaration
 * file's stem is computed from `.d.ts`, not a spurious `.ts` match.
 *
 * @param {string} filePath
 * @returns {string}
 */
function moduleStem(filePath) {
  for (const ext of RECOGNIZED_TS_EXTENSIONS) {
    if (filePath.endsWith(ext)) return filePath.slice(0, -ext.length);
  }
  return filePath;
}

/**
 * Test files whose module specifier collides with a sibling's once a
 * recognized extension is stripped — `Foo.test.ts` next to `Foo.test.tsx`.
 * TypeScript's own file-list construction keeps only one of a colliding
 * group with no config error, regardless of which `include` pattern or
 * project revealed them both, so this runs independently of
 * {@link resolveProjectFileSet}: a real glob match on both files proves
 * nothing here, because the loss happens after matching succeeds, inside the
 * compiler's Program construction. Flags every file in a colliding group
 * rather than guessing which one `tsc` would keep — the fix (rename one of
 * them) is the same regardless of which survives.
 *
 * @param {string} unitDir
 * @param {ReadonlySet<string>} allUnitDirs Every discovered unit dir, including `unitDir` itself.
 * @returns {string[]} Absolute paths of test files in a colliding group.
 */
export function findStemCollisionTestFiles(unitDir, allUnitDirs) {
  /** @type {Map<string, string[]>} */
  const byStem = new Map();
  for (const file of findTestFilesOnDisk(unitDir, allUnitDirs)) {
    const stem = moduleStem(file);
    const bucket = byStem.get(stem);
    if (bucket) bucket.push(file);
    else byStem.set(stem, [file]);
  }
  /** @type {string[]} */
  const victims = [];
  for (const group of byStem.values()) {
    if (group.length > 1) victims.push(...group);
  }
  return victims;
}

/**
 * Test files that sit on disk under a unit but that no `tsc --noEmit`
 * invocation in its `typecheck` script actually resolves — a narrowed
 * `include`, a missing second project for a tree like `scripts/` or `e2e/`,
 * or a `include`/`exclude` glob {@link resolveProjectFileSet} could not read
 * all surface here the same way, plus the same-stem collision
 * {@link findStemCollisionTestFiles} catches independently of any glob.
 *
 * @param {string} unitDir
 * @param {ReadonlySet<string>} allUnitDirs Every discovered unit dir, including `unitDir` itself.
 * @returns {{ files: string[]; errors: string[] }} Absolute paths of on-disk
 *   test files no invoked project covers (including same-stem victims), and
 *   any glob/config errors encountered while resolving those projects.
 */
export function findUncoveredTestFiles(unitDir, allUnitDirs) {
  const { invocations } = readTypecheckInvocations(unitDir);
  const covered = new Set();
  /** @type {string[]} */
  const errors = [];
  for (const inv of invocations) {
    if (!inv.recognized || !inv.projectPath) continue;
    const resolved = resolveProjectFileSet(inv.projectPath);
    errors.push(...resolved.errors);
    for (const file of resolved.files) covered.add(file);
  }
  const globUncovered = findTestFilesOnDisk(unitDir, allUnitDirs).filter(
    (file) => !covered.has(resolve(file))
  );
  const stemCollisions = findStemCollisionTestFiles(unitDir, allUnitDirs);
  return { files: [...new Set([...globUncovered, ...stemCollisions])], errors };
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
 * TypeScript same-stem-collision case (`Foo.test.ts` next to `Foo.test.tsx`,
 * both flagged since which one `tsc` keeps is unspecified); a script
 * retargeted at a `tsconfig.build.json`-shaped config (`files: []`, no
 * `include`) resolves to zero coverage rather than defaulting to
 * "everything"; and — the required degenerate case per ADR-045 — a config
 * that fails to parse reports an error and treats the unit as uncovered
 * rather than crashing or silently passing.
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

    writeUnit('retargeted', { files: [] });
    mkdirSync(join(root, 'retargeted/src/__tests__'), { recursive: true });
    writeFileSync(join(root, 'retargeted/src/__tests__/index.test.ts'), 'export {};\n');

    mkdirSync(join(root, 'malformed/src/__tests__'), { recursive: true });
    writeFileSync(join(root, 'malformed/tsconfig.json'), '{ this is not json');
    writeFileSync(
      join(root, 'malformed/package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } })
    );
    writeFileSync(join(root, 'malformed/src/__tests__/index.test.ts'), 'export {};\n');

    const allUnitDirs = new Set(
      ['covered', 'narrowed', 'same-stem', 'retargeted', 'malformed'].map((dir) => join(root, dir))
    );

    const coveredResult = findUncoveredTestFiles(join(root, 'covered'), allUnitDirs);
    const narrowedResult = findUncoveredTestFiles(join(root, 'narrowed'), allUnitDirs);
    const sameStemResult = findUncoveredTestFiles(join(root, 'same-stem'), allUnitDirs);
    const retargetedResult = findUncoveredTestFiles(join(root, 'retargeted'), allUnitDirs);
    const malformedResult = findUncoveredTestFiles(join(root, 'malformed'), allUnitDirs);

    return (
      coveredResult.files.length === 0 &&
      coveredResult.errors.length === 0 &&
      narrowedResult.files.length === 1 &&
      (narrowedResult.files[0]?.endsWith(join('src', '__tests__', 'index.test.ts')) ?? false) &&
      sameStemResult.files.length === 2 &&
      sameStemResult.files.some((f) => f.endsWith('Foo.test.ts')) &&
      sameStemResult.files.some((f) => f.endsWith('Foo.test.tsx')) &&
      retargetedResult.files.length === 1 &&
      malformedResult.files.length === 1 &&
      malformedResult.errors.length === 1
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Prove a repo where discovery finds nothing is reported as a failure, not
 * folded into a vacuously empty (therefore "clean") failure list (ADR-045).
 *
 * @returns {boolean}
 */
function checkEmptyDiscoveryIsReported() {
  const root = mkdtempSync(join(tmpdir(), 'tests-typechecked-selftest-empty-'));
  try {
    const { unitCount, failures } = scanRepo(root);
    return unitCount === 0 && failures.length === 1;
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
  const emptyDiscoveryOk = checkEmptyDiscoveryIsReported();

  const ok =
    catchesHidden &&
    passesAllowed &&
    commentsOk &&
    extendsOk &&
    typecheckScriptOk &&
    uncoveredTestFilesOk &&
    emptyDiscoveryOk;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  caught every test-hiding glob:      ${catchesHidden}`);
    console.error(`  passed legitimate excludes:         ${passesAllowed}`);
    console.error(`  stripped JSONC comments:            ${commentsOk}`);
    console.error(`  resolved extends correctly:         ${extendsOk}`);
    console.error(`  detected typecheck script coverage: ${typecheckScriptOk}`);
    console.error(`  detected uncovered test files:      ${uncoveredTestFilesOk}`);
    console.error(`  reported an empty discovery:        ${emptyDiscoveryOk}`);
  } else {
    console.log(
      'self-test OK — guard catches test-hiding excludes, retargeted typecheck scripts, ' +
        'narrowed includes (incl. same-stem .ts/.tsx collisions), and empty discovery, passes ' +
        'legitimate shapes.'
    );
  }
  return ok;
}

/**
 * Scan every discovered unit under `root` for all three test-hiding shapes.
 * Separated from `main` so a caller (the self-test, or a future test file)
 * can assert on the result directly instead of parsing `main`'s stdout or
 * spawning a subprocess to observe its exit code.
 *
 * Discovery asserts a floor rather than looping silently over whatever it
 * finds (ADR-045): zero discovered units is reported as its own failure, not
 * folded into an empty, therefore vacuously "clean", failure list.
 *
 * @param {string} root
 * @returns {{ unitCount: number; failures: string[] }}
 */
export function scanRepo(root) {
  const unitDirs = discoverUnitDirs(root);
  const unitDirSet = new Set(unitDirs);
  /** @type {string[]} */
  const failures = [];

  if (unitDirs.length === 0) {
    failures.push(
      'discovered zero unit type-check projects under libs/ and pillars/ — that is not the ' +
        'same as every unit being clean. Either both roots are genuinely empty (unlikely) or ' +
        'discoverUnitDirs no longer finds what it used to.'
    );
    return { unitCount: 0, failures };
  }

  for (const dir of unitDirs) {
    const unitLabel = relative(root, dir);

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
    if (uncovered.files.length > 0) {
      const files = uncovered.files.map((file) => relative(root, file)).join(', ');
      failures.push(`${unitLabel} has test files no invoked tsc project resolves: ${files}`);
    }
    for (const error of uncovered.errors) {
      failures.push(`${unitLabel}: ${error}`);
    }
  }

  return { unitCount: unitDirs.length, failures };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-tests-typechecked.mjs [--self-test]\n' +
        "Fails if a unit's tsconfig.json excludes its own test files from tsc, if its " +
        'include never reaches a real test file on disk, or if its typecheck script ' +
        'never runs tsc --noEmit against its own tsconfig.json.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { unitCount, failures } = scanRepo(repoRoot);
  console.log(`Scanned ${unitCount} unit type-check project(s).`);
  if (failures.length === 0) {
    console.log('OK — every unit type-checks its own tests.');
    process.exit(0);
  }
  console.error(
    'FAIL — these units leave test files unchecked by `tsc --noEmit`, whether by an ' +
      "exclude, a narrowed include, or a typecheck script that doesn't run against the unit's " +
      'own tsconfig.json:'
  );
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
