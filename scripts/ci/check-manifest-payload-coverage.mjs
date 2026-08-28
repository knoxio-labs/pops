#!/usr/bin/env node
/**
 * Manifest-payload coverage guard (POPS-2585).
 *
 * `bootstrapPillar` runs every pillar's manifest through
 * `validateManifestPayload` before the server is registered, and the SDK's
 * wire schema is `.strict()` at every level. A manifest the validator rejects
 * therefore does not degrade the pillar — it throws on boot and the container
 * restart-loops. POPS-2581 was exactly that: `SettingsGroup.widget` was added
 * to `@pops/types`, `plexManifest` emitted it, the hand-kept Zod mirror never
 * gained the key, and `pops-media-api` restarted 11 times in production.
 *
 * ADR-049 removed that mirror, so a field can no longer exist on one side of
 * it. What it cannot remove is everything the validator enforces beyond shape:
 * cross-field rules (a search adapter's `procedurePath` must name a procedure
 * the pillar actually serves; the contract tag must agree with the version)
 * and pattern refinements that erase to `string` in TypeScript. Those still
 * fail first at boot. So every pillar that builds a `ManifestPayload` must
 * exercise it against the validator in its own test suite — a new pillar
 * cannot ship without that net, and an existing one cannot quietly delete it.
 *
 * WHAT THIS PROVES, EXACTLY: that for each discovered builder there is a test
 * file naming both that builder and the SDK wire validator. It does NOT prove
 * the test calls one with the other, nor that the assertion is meaningful —
 * a static scan cannot. It closes "no test at all", which is the state
 * purchases, ai and finance were in when POPS-2585 was filed.
 *
 * Two derivations, both from disk, so neither side is a hand-kept list:
 *
 *   1. BUILDERS — an exported `build<Something>Manifest` in a pillar's source
 *      whose declaration is annotated `ManifestPayload`.
 *   2. REGISTRARS — a pillar whose source calls `bootstrapPillar(`.
 *
 * A registrar with no discovered builder is a violation, not a skip: it means
 * the builder matcher has gone blind (renamed builder, inferred return type,
 * a shape this guard does not model) and the coverage check above it is
 * scanning nothing. The shell is the reverse case and legitimately so — it
 * owns `buildShellManifest` and registers through its own CLI rather than
 * `bootstrapPillar` — so builders without a registrar are not violations.
 *
 * Discovery that finds nothing is a violation too. An empty pillar walk means
 * this guard cannot see the tree, which is indistinguishable from a clean
 * tree if it is allowed to exit 0 (ADR-045).
 *
 * Usage:
 *   node scripts/ci/check-manifest-payload-coverage.mjs
 *   node scripts/ci/check-manifest-payload-coverage.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one gap. Exit 2 = usage error.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Directory names never worth walking into: build output and dependencies. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', 'coverage', 'target']);

/** Extensions a pillar's TypeScript source can carry. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/**
 * An exported manifest builder. The declaration must name the symbol
 * `build<Something>Manifest` AND be annotated `ManifestPayload`, so a
 * `buildSettingsManifest` returning a `SettingsManifest` is not mistaken for
 * a wire payload builder.
 */
const BUILDER_DECLARATION =
  /export\s+(?:async\s+)?(?:function|const|let|var)\s+(build[A-Za-z0-9_]*Manifest)\b[^\n]*\bManifestPayload\b/gu;

/** The SDK entry points a test can reach the wire validator through. */
const VALIDATOR_SYMBOLS = ['validateManifestPayload', 'ManifestPayloadSchema'];

const BOOTSTRAP_CALL = /\bbootstrapPillar\s*\(/u;

/**
 * Recursively list every source file under `dir`, as repo-relative paths.
 *
 * Deliberately unguarded: a directory that cannot be read throws rather than
 * yielding an empty list, so a discovery failure cannot present as a clean
 * scan (ADR-045).
 *
 * @param {string} dir  Absolute path.
 * @param {string} root Absolute repo root, for relativising.
 * @returns {string[]}
 */
export function listSourceFiles(dir, root) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...listSourceFiles(join(dir, entry.name), root));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    out.push(relative(root, join(dir, entry.name)).split(sep).join('/'));
  }
  return out;
}

/**
 * True for a file vitest would collect as a test, or a helper living beside
 * one. Test files are excluded from builder discovery and are the only files
 * consulted for coverage.
 *
 * @param {string} relPath Repo-relative, forward-slashed.
 * @returns {boolean}
 */
export function isTestFile(relPath) {
  const segments = relPath.split('/');
  if (segments.includes('__tests__')) return true;
  const name = segments[segments.length - 1] ?? '';
  return /\.(?:test|spec)\.tsx?$/u.test(name);
}

/**
 * Every exported `ManifestPayload` builder in the tree, keyed by pillar.
 *
 * @typedef {object} Builder
 * @property {string} pillar
 * @property {string} builder
 * @property {string} file
 */

/**
 * @param {string[]} files    Repo-relative pillar source paths.
 * @param {(relPath: string) => string} read  Reads a repo-relative path.
 * @returns {Builder[]}
 */
export function findBuilders(files, read) {
  /** @type {Builder[]} */
  const out = [];
  for (const file of files) {
    if (isTestFile(file)) continue;
    const source = read(file);
    for (const match of source.matchAll(BUILDER_DECLARATION)) {
      const builder = match[1];
      if (builder === undefined) continue;
      out.push({ pillar: pillarOf(file), builder, file });
    }
  }
  return out.toSorted((a, b) => a.builder.localeCompare(b.builder));
}

/**
 * Pillar ids whose source calls `bootstrapPillar(` — the independent
 * derivation of "this pillar puts a manifest on the wire at boot".
 *
 * @param {string[]} files
 * @param {(relPath: string) => string} read
 * @returns {string[]}
 */
export function findRegistrars(files, read) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const file of files) {
    if (isTestFile(file)) continue;
    if (BOOTSTRAP_CALL.test(read(file))) out.add(pillarOf(file));
  }
  return [...out].toSorted((a, b) => a.localeCompare(b));
}

/**
 * Builder names that some test file names alongside the SDK wire validator.
 *
 * Both must appear in the SAME file: a suite that imports the validator for
 * one purpose and mentions a builder in an unrelated file proves nothing
 * about that builder.
 *
 * @param {string[]} files
 * @param {(relPath: string) => string} read
 * @returns {Set<string>}
 */
export function findValidatedBuilders(files, read) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const file of files) {
    if (!isTestFile(file)) continue;
    const source = read(file);
    if (!VALIDATOR_SYMBOLS.some((symbol) => source.includes(symbol))) continue;
    for (const match of source.matchAll(/\b(build[A-Za-z0-9_]*Manifest)\b/gu)) {
      const name = match[1];
      if (name !== undefined) out.add(name);
    }
  }
  return out;
}

/**
 * @param {string} relPath Repo-relative path under `pillars/`.
 * @returns {string} The pillar id segment.
 */
function pillarOf(relPath) {
  const segments = relPath.split('/');
  return segments[1] ?? '';
}

/**
 * @typedef {object} Gaps
 * @property {Builder[]} uncovered      Builders no test names beside the validator.
 * @property {string[]} blindRegistrars Pillars that register with no discovered builder.
 */

/**
 * Pure diff — exported for tests.
 *
 * @param {Builder[]} builders
 * @param {string[]} registrars
 * @param {Set<string>} validated
 * @returns {Gaps}
 */
export function findGaps(builders, registrars, validated) {
  const withBuilder = new Set(builders.map((entry) => entry.pillar));
  return {
    uncovered: builders.filter((entry) => !validated.has(entry.builder)),
    blindRegistrars: registrars.filter((pillar) => !withBuilder.has(pillar)),
  };
}

/**
 * Walk `pillars/` and read every pillar source file.
 *
 * @param {string} root Absolute repo root.
 * @returns {{ files: string[], read: (relPath: string) => string }}
 */
export function scanPillars(root) {
  const pillarsRoot = join(root, 'pillars');
  if (!statSync(pillarsRoot).isDirectory()) {
    throw new Error(`check-manifest-payload-coverage: ${pillarsRoot} is not a directory`);
  }
  const files = listSourceFiles(pillarsRoot, root);
  return { files, read: (relPath) => readFileSync(join(root, relPath), 'utf8') };
}

/**
 * Self-test: drive the pure core over inputs it must flag and inputs it must
 * not, so a matcher that stops matching fails here rather than reporting a
 * clean tree.
 *
 * This exercises the detectors against synthetic source strings only. It does
 * NOT touch the real tree — the guard's own CI step does that.
 *
 * @returns {boolean}
 */
function selfTest() {
  /** @param {Record<string, string>} tree */
  const reader = (tree) => (relPath) => tree[relPath] ?? '';

  const builderSource = `export function buildWeatherManifest(version: string): ManifestPayload {\n  return {} as ManifestPayload;\n}\n`;
  const arrowSource = `export const buildTideManifest = (v: string): ManifestPayload => ({}) as ManifestPayload;\n`;
  const settingsSource = `export function buildWeatherSettingsManifest(): SettingsManifest {\n  return {} as SettingsManifest;\n}\n`;
  const coveredTest = `import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';\nimport { buildWeatherManifest } from '../manifest.js';\nvalidateManifestPayload(buildWeatherManifest('0.1.0'));\n`;
  const schemaOnlyTest = `import { ManifestPayloadSchema } from '@pops/pillar-sdk/manifest-schema';\nimport { buildTideManifest } from '../manifest.js';\nManifestPayloadSchema.parse(buildTideManifest('0.1.0'));\n`;
  const uselessTest = `import { buildWeatherManifest } from '../manifest.js';\nexpect(buildWeatherManifest('0.1.0').pillar).toBe('weather');\n`;

  const tree = {
    'pillars/weather/src/api/manifest.ts': builderSource,
    'pillars/weather/src/api/settings.ts': settingsSource,
    'pillars/weather/src/api/server.ts': 'await bootstrapPillar({ manifest });\n',
    'pillars/tide/src/api/manifest.ts': arrowSource,
    'pillars/tide/src/api/server.ts': 'await bootstrapPillar({ manifest });\n',
  };
  const files = Object.keys(tree);
  const read = reader(tree);

  const builders = findBuilders(files, read);
  const foundBoth =
    builders.length === 2 &&
    builders.some((b) => b.builder === 'buildWeatherManifest' && b.pillar === 'weather') &&
    builders.some((b) => b.builder === 'buildTideManifest' && b.pillar === 'tide');

  const registrars = findRegistrars(files, read);
  const foundRegistrars = registrars.join(',') === 'tide,weather';

  const covered = findGaps(
    builders,
    registrars,
    findValidatedBuilders(
      [...files, 'pillars/weather/src/api/__tests__/manifest.test.ts', 'pillars/tide/t.test.ts'],
      reader({
        ...tree,
        'pillars/weather/src/api/__tests__/manifest.test.ts': coveredTest,
        'pillars/tide/t.test.ts': schemaOnlyTest,
      })
    )
  );
  const cleanPasses = covered.uncovered.length === 0 && covered.blindRegistrars.length === 0;

  const missing = findGaps(builders, registrars, findValidatedBuilders(files, read));
  const catchesMissingTest = missing.uncovered.length === 2 && missing.blindRegistrars.length === 0;

  const namedButUnvalidated = findGaps(
    builders,
    registrars,
    findValidatedBuilders(
      [...files, 'pillars/weather/src/api/__tests__/manifest.test.ts'],
      reader({ ...tree, 'pillars/weather/src/api/__tests__/manifest.test.ts': uselessTest })
    )
  );
  const catchesTestWithoutValidator = namedButUnvalidated.uncovered.some(
    (entry) => entry.builder === 'buildWeatherManifest'
  );

  const renamedTree = {
    'pillars/weather/src/api/manifest.ts': 'export function assembleManifest(): ManifestPayload {}',
    'pillars/weather/src/api/server.ts': 'await bootstrapPillar({ manifest });\n',
  };
  const renamedFiles = Object.keys(renamedTree);
  const renamedRead = reader(renamedTree);
  const blind = findGaps(
    findBuilders(renamedFiles, renamedRead),
    findRegistrars(renamedFiles, renamedRead),
    new Set()
  );
  const catchesBlindMatcher = blind.blindRegistrars.join(',') === 'weather';

  const ignoresSettingsBuilder = !builders.some((b) => b.builder.includes('Settings'));

  const ok =
    foundBoth &&
    foundRegistrars &&
    cleanPasses &&
    catchesMissingTest &&
    catchesTestWithoutValidator &&
    catchesBlindMatcher &&
    ignoresSettingsBuilder;

  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  finds function + arrow builders:      ${foundBoth}`);
    console.error(`  finds bootstrapPillar callers:        ${foundRegistrars}`);
    console.error(`  clean synthetic tree passes:          ${cleanPasses}`);
    console.error(`  catches a builder with no test:       ${catchesMissingTest}`);
    console.error(`  catches a test that skips the schema: ${catchesTestWithoutValidator}`);
    console.error(`  catches a renamed (unseen) builder:   ${catchesBlindMatcher}`);
    console.error(`  ignores a SettingsManifest builder:   ${ignoresSettingsBuilder}`);
    return false;
  }
  console.log(
    'self-test OK — guard finds builders in both declaration forms, reports an untested ' +
      'builder, a test that never reaches the wire schema, and a registrar whose builder ' +
      'the matcher cannot see; passes a clean fixture.'
  );
  return true;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-manifest-payload-coverage.mjs [--self-test]\n' +
        "Fails if a pillar's ManifestPayload builder is not exercised against the SDK wire validator."
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { files, read } = scanPillars(repoRoot);
  const builders = findBuilders(files, read);
  const registrars = findRegistrars(files, read);
  const validated = findValidatedBuilders(files, read);

  if (files.length === 0 || builders.length === 0 || registrars.length === 0) {
    console.error(
      `FAIL — discovery found ${files.length} pillar source file(s), ${builders.length} manifest ` +
        `builder(s) and ${registrars.length} bootstrapPillar caller(s). An empty scan is a broken ` +
        'guard, not a clean tree.'
    );
    process.exit(1);
  }

  console.log(
    `Scanned ${files.length} pillar source file(s): ${builders.length} manifest builder(s), ` +
      `${registrars.length} bootstrapPillar caller(s).`
  );

  const { uncovered, blindRegistrars } = findGaps(builders, registrars, validated);
  if (uncovered.length === 0 && blindRegistrars.length === 0) {
    console.log('OK — every manifest builder is named beside the SDK wire validator in a test.');
    process.exit(0);
  }
  for (const entry of uncovered) {
    console.error(
      `FAIL — ${entry.builder} (${entry.file}) is not exercised against the manifest wire ` +
        `validator. Add a test under pillars/${entry.pillar} that calls ` +
        'validateManifestPayload() on its output — see pillars/media/src/api/__tests__/manifest-payload.test.ts.'
    );
  }
  for (const pillar of blindRegistrars) {
    console.error(
      `FAIL — pillars/${pillar} calls bootstrapPillar() but exports no build<Name>Manifest ` +
        'annotated ManifestPayload. Either rename the builder to that convention or extend ' +
        'BUILDER_DECLARATION in this guard — as written, its manifest is unchecked.'
    );
  }
  process.exit(1);
}

if (import.meta.main) {
  main();
}
