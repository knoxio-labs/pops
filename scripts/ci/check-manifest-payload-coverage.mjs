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
 * WHAT THIS PROVES, EXACTLY: that for each discovered builder there is a
 * vitest-collected test file, IN THAT BUILDER'S OWN PILLAR, naming both the
 * builder and the SDK wire validator. It does NOT prove the test calls one
 * with the other, that the assertion is meaningful, or that the test even
 * runs — a `describe.skip` or a commented-out body still satisfies it. A
 * static scan cannot do better. It closes "no test at all", which is the
 * state purchases, ai and finance were in when POPS-2585 was filed.
 *
 * WHAT IT CANNOT SEE — stated plainly, because a guard whose stated breadth
 * exceeds its real breadth is worse than no guard (ADR-045):
 *
 *   - Non-TypeScript pillars. `pillars/contacts` is Rust: it hand-writes a
 *     `ManifestPayload`-shaped `serde_json::Value` and posts it to the
 *     registry, and nothing here or anywhere else runs that through the Zod
 *     schema before boot. Both derivations below lose it at the same step
 *     (the extension filter), so the registrar cross-check cannot fire on it
 *     either. Tracked as POPS-2592; do not read this guard's OK as covering
 *     it.
 *   - A pillar that registers through neither `bootstrapPillar(` nor a
 *     discoverable builder. The shell registers through its own CLI, so it is
 *     covered by builder discovery alone, with no cross-check behind it.
 *
 * Two derivations, both from disk:
 *
 *   1. BUILDERS — every `build<Something>Manifest` identifier appearing in a
 *      non-test pillar source file that also mentions `ManifestPayload`.
 *      Deliberately NOT a declaration-shape match: an enumerated matcher over
 *      `function` / `const` / `export default` / re-export / wrapped-signature
 *      forms misses whichever spelling its author did not think of, silently
 *      and permanently (ADR-045). Reading the file for two co-occurring facts
 *      is blind to syntax, so oxfmt wrapping a signature cannot hide a builder.
 *      The failure direction is loud: an over-collected name reports as an
 *      uncovered builder, never as a silent pass.
 *   2. REGISTRARS — a pillar whose source calls `bootstrapPillar(`.
 *
 * A registrar with no discovered builder is a violation, not a skip: it means
 * builder discovery has gone blind for that pillar and the coverage check
 * above it is scanning nothing. Note the limit of that net — it is an
 * existence check per pillar, so it fires only when EVERY builder in a
 * registrar pillar is invisible. A pillar's second builder going missing is
 * caught by this guard's own suite, which pins the discovered set by name,
 * not by this cross-check.
 *
 * Discovery that finds nothing is a violation too, and so is a directory
 * entry the walk cannot classify: an entry silently dropped from both the
 * file list and the error path is the exact defect ADR-045's context section
 * describes, and here it would remove a pillar from both derived sets at once.
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
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'target']);

/** Extensions a pillar's TypeScript source can carry. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

/** The type whose presence marks a file as dealing in wire manifests. */
const PAYLOAD_TYPE = 'ManifestPayload';

/** A manifest builder's name, wherever it appears. */
const BUILDER_NAME = /\b(build[A-Za-z0-9_]*Manifest)\b/gu;

/** The SDK entry points a test can reach the wire validator through. */
const VALIDATOR_SYMBOLS = ['validateManifestPayload', 'ManifestPayloadSchema'];

const BOOTSTRAP_CALL = /\bbootstrapPillar\s*\(/u;

/**
 * @typedef {object} Scan
 * @property {string[]} files         Repo-relative source paths.
 * @property {string[]} unclassified  Entries the walk could not classify.
 */

/**
 * Recursively list every source file under `dir`, as repo-relative paths,
 * alongside every entry the walk could not classify as a file or a directory
 * (a symlink, a socket, a device).
 *
 * Deliberately unguarded: a directory that cannot be read throws rather than
 * yielding an empty list. And an entry that is neither file nor directory is
 * RETURNED rather than dropped — dropping it would remove a pillar from the
 * builder set and the registrar set simultaneously, which is invisible to the
 * cross-check between them (ADR-045).
 *
 * @param {string} dir  Absolute path.
 * @param {string} root Absolute repo root, for relativising.
 * @returns {Scan}
 */
export function listSourceFiles(dir, root) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const unclassified = [];
  const rel = (name) => relative(root, join(dir, name)).split(sep).join('/');

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const nested = listSourceFiles(join(dir, entry.name), root);
      files.push(...nested.files);
      unclassified.push(...nested.unclassified);
      continue;
    }
    if (entry.isFile()) {
      if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) files.push(rel(entry.name));
      continue;
    }
    unclassified.push(rel(entry.name));
  }
  return { files, unclassified };
}

/**
 * True for a file vitest actually collects. Living in a `__tests__` directory
 * is NOT enough: a `__tests__/helpers.ts` is never collected, so treating it
 * as a test would let a fixture satisfy a builder's coverage while no test
 * exercised it.
 *
 * @param {string} relPath Repo-relative, forward-slashed.
 * @returns {boolean}
 */
export function isTestFile(relPath) {
  const name = relPath.split('/').pop() ?? '';
  return /\.(?:test|spec)\.[cm]?tsx?$/u.test(name);
}

/**
 * @typedef {object} Builder
 * @property {string} pillar
 * @property {string} builder
 * @property {string} file
 */

/**
 * Every manifest builder in the tree: a `build<Something>Manifest` name in a
 * non-test pillar source file that also mentions `ManifestPayload`.
 *
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
    if (!source.includes(PAYLOAD_TYPE)) continue;
    for (const builder of new Set([...source.matchAll(BUILDER_NAME)].map((m) => m[1]))) {
      if (builder !== undefined) out.push({ pillar: pillarOf(file), builder, file });
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
 * Builder names each pillar's own tests name alongside the SDK wire validator,
 * keyed by pillar.
 *
 * Both must appear in the SAME file: a suite that imports the validator for
 * one purpose and mentions a builder in an unrelated file proves nothing.
 * Keying by pillar matters too — without it a fixture in one pillar named
 * after another pillar's builder would satisfy that builder's coverage, and
 * the guard's own error message ("add a test under pillars/<id>") would be
 * describing a rule it did not enforce.
 *
 * @param {string[]} files
 * @param {(relPath: string) => string} read
 * @returns {Map<string, Set<string>>}
 */
export function findValidatedBuilders(files, read) {
  /** @type {Map<string, Set<string>>} */
  const out = new Map();
  for (const file of files) {
    if (!isTestFile(file)) continue;
    const source = read(file);
    if (!VALIDATOR_SYMBOLS.some((symbol) => source.includes(symbol))) continue;
    const pillar = pillarOf(file);
    const names = out.get(pillar) ?? new Set();
    for (const match of source.matchAll(BUILDER_NAME)) {
      const name = match[1];
      if (name !== undefined) names.add(name);
    }
    out.set(pillar, names);
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
 * @property {Builder[]} uncovered      Builders their own pillar's tests do not name beside the validator.
 * @property {string[]} blindRegistrars Pillars that register with no discovered builder.
 */

/**
 * Pure diff — exported for tests.
 *
 * @param {Builder[]} builders
 * @param {string[]} registrars
 * @param {Map<string, Set<string>>} validated
 * @returns {Gaps}
 */
export function findGaps(builders, registrars, validated) {
  const withBuilder = new Set(builders.map((entry) => entry.pillar));
  return {
    uncovered: builders.filter((entry) => !validated.get(entry.pillar)?.has(entry.builder)),
    blindRegistrars: registrars.filter((pillar) => !withBuilder.has(pillar)),
  };
}

/**
 * Walk `pillars/` and read every pillar source file.
 *
 * @param {string} root Absolute repo root.
 * @returns {{ files: string[], unclassified: string[], read: (relPath: string) => string }}
 */
export function scanPillars(root) {
  const pillarsRoot = join(root, 'pillars');
  if (!statSync(pillarsRoot).isDirectory()) {
    throw new Error(`check-manifest-payload-coverage: ${pillarsRoot} is not a directory`);
  }
  const { files, unclassified } = listSourceFiles(pillarsRoot, root);
  return { files, unclassified, read: (relPath) => readFileSync(join(root, relPath), 'utf8') };
}

/**
 * Self-test: drive the pure core over inputs it must flag and inputs it must
 * not, so a matcher that stops matching fails here rather than reporting a
 * clean tree.
 *
 * Scope: synthetic source strings only, and only the properties named in the
 * success line below. It does not touch the real tree, and it is not evidence
 * that discovery finds everything a real pillar can spell — that is what the
 * suite's real-tree pin and the guard's own CI step are for.
 *
 * @returns {boolean}
 */
function selfTest() {
  /** @param {Record<string, string>} tree */
  const reader = (tree) => (relPath) => tree[relPath] ?? '';

  // Declaration forms an enumerated matcher misses: a signature wrapped over
  // lines, a default export, a re-export, and an inferred return type.
  const wrapped =
    'export function buildWeatherManifest(\n  version: string,\n  baseUrl: string\n): ManifestPayload {\n  return payload;\n}\n';
  const defaulted =
    'const x: ManifestPayload = payload;\nexport default function buildTideManifest(v) {\n  return x;\n}\n';
  const settingsSource =
    'export function buildWeatherSettingsManifest(): SettingsManifest {\n  return x;\n}\n';
  const coveredTest =
    "import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';\nvalidateManifestPayload(buildWeatherManifest('0.1.0'));\n";
  const schemaOnlyTest =
    "import { ManifestPayloadSchema } from '@pops/pillar-sdk/manifest-schema';\nManifestPayloadSchema.parse(buildTideManifest('0.1.0'));\n";
  const uselessTest = "expect(buildWeatherManifest('0.1.0').pillar).toBe('weather');\n";

  const tree = {
    'pillars/weather/src/api/manifest.ts': wrapped,
    'pillars/weather/src/api/settings.ts': settingsSource,
    'pillars/weather/src/api/server.ts': 'await bootstrapPillar({ manifest });\n',
    'pillars/tide/src/api/manifest.ts': defaulted,
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

  const coveredFiles = [
    ...files,
    'pillars/weather/src/api/__tests__/manifest.test.ts',
    'pillars/tide/t.test.ts',
  ];
  const coveredRead = reader({
    ...tree,
    'pillars/weather/src/api/__tests__/manifest.test.ts': coveredTest,
    'pillars/tide/t.test.ts': schemaOnlyTest,
  });
  const clean = findGaps(builders, registrars, findValidatedBuilders(coveredFiles, coveredRead));
  const cleanPasses = clean.uncovered.length === 0 && clean.blindRegistrars.length === 0;

  const missing = findGaps(builders, registrars, findValidatedBuilders(files, read));
  const catchesMissingTest = missing.uncovered.length === 2 && missing.blindRegistrars.length === 0;

  const uselessGaps = findGaps(
    builders,
    registrars,
    findValidatedBuilders(
      [...files, 'pillars/weather/src/api/__tests__/manifest.test.ts'],
      reader({ ...tree, 'pillars/weather/src/api/__tests__/manifest.test.ts': uselessTest })
    )
  );
  const catchesTestWithoutValidator = uselessGaps.uncovered.some(
    (entry) => entry.builder === 'buildWeatherManifest'
  );

  // A test in ANOTHER pillar, and a `__tests__` helper vitest never collects,
  // must both fail to cover a builder.
  const foreignGaps = findGaps(
    builders,
    registrars,
    findValidatedBuilders(
      [...files, 'pillars/tide/src/api/__tests__/other.test.ts'],
      reader({ ...tree, 'pillars/tide/src/api/__tests__/other.test.ts': coveredTest })
    )
  );
  const rejectsForeignPillarTest = foreignGaps.uncovered.some(
    (entry) => entry.builder === 'buildWeatherManifest'
  );

  const helperGaps = findGaps(
    builders,
    registrars,
    findValidatedBuilders(
      [...files, 'pillars/weather/src/api/__tests__/helpers.ts'],
      reader({ ...tree, 'pillars/weather/src/api/__tests__/helpers.ts': coveredTest })
    )
  );
  const rejectsUncollectedHelper = helperGaps.uncovered.some(
    (entry) => entry.builder === 'buildWeatherManifest'
  );

  const renamedTree = {
    'pillars/weather/src/api/manifest.ts':
      'export function assembleManifest(): ManifestPayload {\n  return x;\n}\n',
    'pillars/weather/src/api/server.ts': 'await bootstrapPillar({ manifest });\n',
  };
  const renamedFiles = Object.keys(renamedTree);
  const renamedRead = reader(renamedTree);
  const blind = findGaps(
    findBuilders(renamedFiles, renamedRead),
    findRegistrars(renamedFiles, renamedRead),
    new Map()
  );
  const catchesBlindMatcher = blind.blindRegistrars.join(',') === 'weather';

  const ignoresSettingsBuilder = !builders.some((b) => b.builder.includes('Settings'));

  const ok =
    foundBoth &&
    foundRegistrars &&
    cleanPasses &&
    catchesMissingTest &&
    catchesTestWithoutValidator &&
    rejectsForeignPillarTest &&
    rejectsUncollectedHelper &&
    catchesBlindMatcher &&
    ignoresSettingsBuilder;

  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  finds a wrapped signature + a default export: ${foundBoth}`);
    console.error(`  finds bootstrapPillar callers:                ${foundRegistrars}`);
    console.error(`  clean synthetic tree passes:                  ${cleanPasses}`);
    console.error(`  catches a builder with no test:               ${catchesMissingTest}`);
    console.error(`  catches a test that skips the schema:         ${catchesTestWithoutValidator}`);
    console.error(`  rejects coverage from another pillar's test:  ${rejectsForeignPillarTest}`);
    console.error(`  rejects an uncollected __tests__ helper:      ${rejectsUncollectedHelper}`);
    console.error(`  catches a renamed (unseen) builder:           ${catchesBlindMatcher}`);
    console.error(`  ignores a SettingsManifest builder:           ${ignoresSettingsBuilder}`);
    return false;
  }
  console.log(
    'self-test OK — over synthetic sources the guard finds a builder whose signature is ' +
      'wrapped over lines and one exported as a default, reports an untested builder, a test ' +
      'that never reaches the wire schema, coverage claimed by another pillar, coverage ' +
      'claimed by an uncollected __tests__ helper, and a registrar whose builder it cannot ' +
      'see; and passes a clean fixture.'
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

  const { files, unclassified, read } = scanPillars(repoRoot);
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
  if (uncovered.length === 0 && blindRegistrars.length === 0 && unclassified.length === 0) {
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
      `FAIL — pillars/${pillar} calls bootstrapPillar() but no source file of its own both ` +
        'mentions ManifestPayload and names a build<Name>Manifest. Either follow that naming ' +
        'convention or extend discovery in this guard — as written, its manifest is unchecked.'
    );
  }
  for (const entry of unclassified) {
    console.error(
      `FAIL — ${entry} is neither a file nor a directory (a symlink?). This walk will not ` +
        'guess: an entry it silently dropped would leave a pillar out of both derived sets at ' +
        'once, which the cross-check between them cannot see.'
    );
  }
  process.exit(1);
}

if (import.meta.main) {
  main();
}
