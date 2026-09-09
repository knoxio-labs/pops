#!/usr/bin/env node
/**
 * Pillar-UI reachability guard (P7-T08 / RD-10, widened by POPS-3217).
 *
 * There are two ways an in-repo pillar's UI reaches the shell, and this guard
 * asserts that every pillar app uses ONE of them.
 *
 *   1. **The static bundle map.** The shell imports the published
 *      `@pops/app-<pillar>` package in `bundle-map.tsx` and mounts its routes
 *      at build time (ADR-002).
 *   2. **The runtime loader.** The pillar's wire manifest advertises an
 *      `assetsBaseUrl` and its `pages`, and the shell `import()`s the built
 *      bundle at that URL (`pillars/shell/src/app/external-ui.tsx`). The
 *      shell's build knows nothing about the package.
 *
 * Either is fine; neither is not. Both failure modes are silent in exactly the
 * same way — the pillar's UI simply does not appear, with no error anywhere —
 * which is why one guard covers both rather than the second arrangement
 * quietly opting a pillar out of the first one's check.
 *
 * The `pages` half of (2) is load-bearing rather than belt-and-braces: the
 * loader builds a pillar's routes from `pages` ALONE, so a manifest with an
 * `assetsBaseUrl` and no pages advertises a bundle nothing will ever mount a
 * route from.
 *
 * What it does:
 *   1. Discover every in-repo pillar app by walking `pillars/<x>/app/package.json`
 *      and reading its `name` (expected `@pops/app-<pillar>`). This is the set
 *      the bundle map MUST reference. Discovered from disk — never a hardcoded
 *      pillar list, which is the exact static-rot this whole phase kills.
 *   2. Locate the shell's `bundle-map.tsx` and extract the `@pops/app-*`
 *      package specifiers it imports, via the shared statement-anchored
 *      specifier extractor (`scripts/ci/import-scan.mjs`) so a package name
 *      inside a comment or string literal does NOT count.
 *   3. For a package the bundle map does not reference, read the pillar's wire
 *      manifest (`pillars/<x>/src/api/manifest.ts`) and check it declares both
 *      `assetsBaseUrl` and a non-empty `pages`. Comments are stripped first,
 *      so a mention in prose does not count.
 *   4. Exit non-zero listing any pillar reachable by neither route; exit 0
 *      when every one is reachable by one of them.
 *
 * It deliberately ignores non-`@pops/app-*` imports the bundle map also
 * pulls in (e.g. `@pops/overlay-ego`, a frontend-only lib that is not a
 * pillar app and lives in `libs/`, not `pillars/<x>/app`). The contract this
 * guard enforces is one-directional: every pillar app must be referenced;
 * the bundle map may reference other things too.
 *
 * The `import.meta.glob` over `pillars/<x>/app/src` alternative is rejected
 * by design: it reaches behind the `@pops/app-*` contract into `src/`
 * (ISO-R3 violation). This guard exists precisely to keep the static,
 * contract-respecting bundle map honest without that hack.
 *
 * Usage:
 *   node scripts/check-bundle-map-coverage.mjs              check the real tree
 *   node scripts/check-bundle-map-coverage.mjs --self-test  prove the guard catches a gap
 *
 * Exit code 0 on full coverage. Non-zero on any uncovered pillar app, on a
 * failed self-test, or on usage / discovery errors.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractSpecifiers, stripComments } from './ci/import-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/** Package-name prefix every in-repo pillar app must carry. */
const APP_PACKAGE_PREFIX = '@pops/app-';

/**
 * Candidate locations for the shell's static bundle map, relative to the
 * repo root, in priority order. The first that exists wins. The shell's
 * post-relocation home is `pillars/shell`; the legacy `apps/pops-shell`
 * path is kept as a fallback so the guard does not silently no-op if the
 * relocation order shifts.
 */
const BUNDLE_MAP_CANDIDATES = [
  'pillars/shell/src/app/bundle-map.tsx',
  'apps/pops-shell/src/app/bundle-map.tsx',
];

/**
 * @typedef {object} PillarApp
 * @property {string} pkgName  npm package name, e.g. `@pops/app-finance`.
 * @property {string} pkgPath  Repo-relative `package.json` path that declared it.
 * @property {string} pillarId Directory name under `pillars/`.
 */

/**
 * Discover every in-repo pillar app from disk by walking
 * `pillars/<x>/app/package.json` and reading its `name`. The result is the set
 * of `@pops/app-*` packages the bundle map must reference. No hardcoded list.
 *
 * A `pillars/<x>/app/package.json` whose `name` does not start with
 * `@pops/app-` is a malformed app and is reported loudly rather than skipped —
 * the convention (`@pops/app-<pillar>`) is what the shell relies on.
 *
 * @returns {PillarApp[]}
 */
function discoverPillarApps() {
  const pillarsRoot = join(repoRoot, 'pillars');
  if (!existsSync(pillarsRoot)) return [];
  /** @type {PillarApp[]} */
  const out = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join('pillars', entry.name, 'app', 'package.json');
    if (!existsSync(join(repoRoot, pkgPath))) continue;
    /** @type {{ name?: unknown }} */
    const pkg = JSON.parse(readFileSync(join(repoRoot, pkgPath), 'utf8'));
    if (typeof pkg.name !== 'string') {
      throw new Error(`${pkgPath} has no string \`name\` field`);
    }
    if (!pkg.name.startsWith(APP_PACKAGE_PREFIX)) {
      throw new Error(
        `${pkgPath} declares name "${pkg.name}" — every pillar app must be ` +
          `named "${APP_PACKAGE_PREFIX}<pillar>" so the shell can static-import it.`
      );
    }
    out.push({ pkgName: pkg.name, pkgPath, pillarId: entry.name });
  }
  return out.toSorted((a, b) => a.pkgName.localeCompare(b.pkgName));
}

/**
 * Locate the shell bundle map on disk and return its repo-relative path.
 *
 * @returns {string}
 */
function locateBundleMap() {
  for (const candidate of BUNDLE_MAP_CANDIDATES) {
    if (existsSync(join(repoRoot, candidate))) return candidate;
  }
  throw new Error(
    `bundle-map.tsx not found. Looked in: ${BUNDLE_MAP_CANDIDATES.join(', ')}. ` +
      `If the shell moved, add its path to BUNDLE_MAP_CANDIDATES.`
  );
}

/**
 * The set of `@pops/app-*` package specifiers a bundle-map source actually
 * imports. Uses the shared statement-anchored extractor so a specifier that
 * merely appears inside a comment or string literal is NOT counted.
 *
 * @param {string} src
 * @returns {Set<string>}
 */
export function referencedAppPackages(src) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const specifier of extractSpecifiers(src)) {
    if (specifier.startsWith(APP_PACKAGE_PREFIX)) out.add(specifier);
  }
  return out;
}

/**
 * Does a pillar's wire-manifest source advertise a loader-mounted UI — both an
 * `assetsBaseUrl` and a non-empty `pages`?
 *
 * Read as text because this guard installs nothing (ADR-045 Tier A) and the
 * manifest is TypeScript. Comments are stripped first and each key is anchored
 * to an object-property position, so the words appearing in a docstring or a
 * string literal — which they do, at length, in exactly these files — cannot
 * be mistaken for a declaration.
 *
 * `pages: []` reads as absent: an empty page list is a pillar with no routes
 * for the loader to mount, which is the same nothing as declaring none.
 *
 * @param {string} src Manifest source.
 * @returns {{ assetsBaseUrl: boolean, pages: boolean }}
 */
export function advertisesLoaderMountedUi(src) {
  const code = stripComments(src);
  // Anchored to the start of a line, not merely to a word boundary. These
  // files discuss `pages` and `assetsBaseUrl` at length in prose and in string
  // literals, and `stripComments` removes the prose but not the strings; an
  // object property, which is what this is looking for, is what oxfmt puts at
  // the start of a line.
  const declares = (/** @type {string} */ key) => new RegExp(`^\\s*${key}\\s*:`, 'm').test(code);
  const emptyPages = /^\s*pages\s*:\s*\[\s*\]/m.test(code);
  return {
    assetsBaseUrl: declares('assetsBaseUrl'),
    pages: declares('pages') && !emptyPages,
  };
}

/**
 * @typedef {object} CoverageResult
 * @property {string[]} missing  Pillar-app package names reachable by neither route.
 * @property {string[]} covered  Pillar-app package names reachable by one of them.
 * @property {string[]} viaLoader Of the covered, those mounted through the loader.
 * @property {string[]} reasons  One line per missing app saying what it lacks.
 */

/**
 * Pure core: assert every discovered pillar-app package is reachable — through
 * the bundle map, or through the runtime loader. Pure (no I/O) so the self-test
 * can drive it over in-memory fixtures.
 *
 * @param {PillarApp[]} apps        Discovered pillar apps.
 * @param {Set<string>} referenced  `@pops/app-*` specifiers the bundle map imports.
 * @param {(app: PillarApp) => { assetsBaseUrl: boolean, pages: boolean, found?: boolean }} loaderUiOf
 *   What the pillar's wire manifest advertises. `found: false` means no wire
 *   manifest could be located at all, which is reported as its own failure
 *   rather than as a manifest that declares nothing — the two need different
 *   fixes, and conflating them sent a reader looking for a missing
 *   `assetsBaseUrl` in a file that was there and correct (POPS-3220).
 * @returns {CoverageResult}
 */
export function evaluateCoverage(apps, referenced, loaderUiOf) {
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const covered = [];
  /** @type {string[]} */
  const viaLoader = [];
  /** @type {string[]} */
  const reasons = [];

  for (const app of apps) {
    if (referenced.has(app.pkgName)) {
      covered.push(app.pkgName);
      continue;
    }
    const wire = loaderUiOf(app);
    if (wire.assetsBaseUrl && wire.pages) {
      covered.push(app.pkgName);
      viaLoader.push(app.pkgName);
      continue;
    }
    missing.push(app.pkgName);
    if (wire.found === false) {
      reasons.push(
        `${app.pkgName} — absent from the bundle map, and no wire manifest could be ` +
          `found for pillar '${app.pillarId}' (looked for src/api/manifest.ts, ` +
          `src/api/${app.pillarId}-manifest.ts, and any src/api/*.ts building a ` +
          `ManifestPayload)`
      );
      continue;
    }
    const lacks = [];
    if (!wire.assetsBaseUrl) lacks.push('an assetsBaseUrl');
    if (!wire.pages) lacks.push('a non-empty pages');
    reasons.push(
      `${app.pkgName} — absent from the bundle map, and its wire manifest ` +
        `declares ${lacks.length === 2 ? 'neither ' : 'no '}${lacks.join(' nor ')}`
    );
  }

  return { missing, covered, viaLoader, reasons };
}

/**
 * Find the file that builds a pillar's wire `ManifestPayload`.
 *
 * `src/api/manifest.ts` is the convention and nearly every pillar follows it,
 * but `ai` names its builder `src/api/ai-manifest.ts`. The old lookup hardcoded
 * the conventional path and returned "declares nothing" when it was absent, so
 * a correct manifest under a different name read exactly like a missing
 * `assetsBaseUrl` — and the reader was sent to look for a declaration that was
 * already there (POPS-3220).
 *
 * Falls back to scanning `src/api/*.ts` for the payload type rather than
 * enumerating more names, so the next pillar to pick its own filename is found
 * too. Returns `undefined` when there is genuinely nothing, which the caller
 * reports as its own failure.
 *
 * @typedef {object} ManifestFs
 * @property {(path: string) => boolean} existsSync
 * @property {(path: string) => string[]} readdirSync
 * @property {(path: string, encoding: 'utf8') => string} readFileSync
 *
 * @param {string} pillarId
 * @param {ManifestFs} [files]  Injected so the self-test can drive layouts
 *   that do not exist on disk.
 * @returns {string | undefined} Absolute path, or undefined if none exists.
 */
export function locatePillarManifest(
  pillarId,
  files = /** @type {ManifestFs} */ ({ existsSync, readFileSync, readdirSync })
) {
  const apiDir = join(repoRoot, 'pillars', pillarId, 'src/api');
  for (const name of ['manifest.ts', `${pillarId}-manifest.ts`]) {
    const candidate = join(apiDir, name);
    if (files.existsSync(candidate)) return candidate;
  }
  if (!files.existsSync(apiDir)) return undefined;
  for (const entry of files.readdirSync(apiDir)) {
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    const candidate = join(apiDir, entry);
    if (files.readFileSync(candidate, 'utf8').includes('ManifestPayload')) return candidate;
  }
  return undefined;
}

/**
 * Drive the guard against the real tree.
 *
 * @returns {boolean} true on full coverage.
 */
function run() {
  const apps = discoverPillarApps();
  if (apps.length === 0) {
    console.error(
      'No pillar apps discovered under pillars/*/app with a package.json. Nothing to check.'
    );
    return false;
  }
  const bundleMapPath = locateBundleMap();
  const referenced = referencedAppPackages(readFileSync(join(repoRoot, bundleMapPath), 'utf8'));
  const { missing, covered, viaLoader, reasons } = evaluateCoverage(apps, referenced, (app) => {
    const manifestPath = locatePillarManifest(app.pillarId);
    if (manifestPath === undefined) {
      return { assetsBaseUrl: false, pages: false, found: false };
    }
    return { ...advertisesLoaderMountedUi(readFileSync(manifestPath, 'utf8')), found: true };
  });

  const loaderMounted = new Set(viaLoader);
  console.log(
    `Discovered ${apps.length} pillar app(s); ${bundleMapPath} references ` +
      `${referenced.size} @pops/app-* package(s).`
  );
  for (const name of covered) {
    console.log(`  OK  ${name}${loaderMounted.has(name) ? '  (runtime loader)' : ''}`);
  }

  if (missing.length === 0) {
    console.log('OK — every pillar app reaches the shell, by the map or by the loader.');
    return true;
  }

  console.error(`FAIL — ${missing.length} pillar app(s) reach the shell by neither route:`);
  for (const reason of reasons) console.error(`  XX  ${reason}`);
  console.error(
    `  A pillar's UI has to arrive one of two ways: an import plus an entry in ` +
      `${bundleMapPath}, or an \`assetsBaseUrl\` + \`pages\` in its wire manifest ` +
      `for the runtime loader. With neither, the UI silently fails to mount.`
  );
  return false;
}

/**
 * Synthetic fixtures proving the guard catches a gap and passes a complete
 * map. Mirrors the `--self-test` convention in check-exports.mjs /
 * check-pillar-schema-coverage.mjs so a regression that neuters the guard is
 * caught without a real tree break.
 *
 * @returns {boolean} true if the guard behaves correctly on the fixtures.
 */
function selfTest() {
  /** @type {PillarApp[]} */
  const apps = [
    { pkgName: '@pops/app-alpha', pkgPath: 'pillars/alpha/app/package.json', pillarId: 'alpha' },
    { pkgName: '@pops/app-beta', pkgPath: 'pillars/beta/app/package.json', pillarId: 'beta' },
  ];

  const completeMap = [
    "import { manifest as a } from '@pops/app-alpha';",
    "import { manifest as b } from '@pops/app-beta';",
    "import { manifest as e } from '@pops/overlay-ego';",
  ].join('\n');

  // beta is only present in a comment and a string literal — the statement
  // anchored extractor must NOT count either, so the gap is still caught.
  const gappedMap = [
    "import { manifest as a } from '@pops/app-alpha';",
    "// import { manifest as b } from '@pops/app-beta';",
    "const doc = 'see @pops/app-beta for the missing one';",
  ].join('\n');

  const noWireUi = () => ({ assetsBaseUrl: false, pages: false });
  const loaderMounted = () => ({ assetsBaseUrl: true, pages: true });

  const complete = evaluateCoverage(apps, referencedAppPackages(completeMap), noWireUi);
  const gapped = evaluateCoverage(apps, referencedAppPackages(gappedMap), noWireUi);
  const gappedButOnTheWire = evaluateCoverage(
    apps,
    referencedAppPackages(gappedMap),
    loaderMounted
  );
  const halfDeclared = evaluateCoverage(apps, referencedAppPackages(gappedMap), () => ({
    assetsBaseUrl: true,
    pages: false,
  }));

  const manifestWithBoth = [
    'export function build() {',
    '  return {',
    "    assetsBaseUrl: '/beta-ui/beta.js',",
    '    pages: [...BETA_PAGES],',
    '  };',
    '}',
  ].join('\n');

  const manifestWithEmptyPages = [
    'export function build() {',
    '  return {',
    "    assetsBaseUrl: '/beta-ui/beta.js',",
    '    pages: [],',
    '  };',
    '}',
  ].join('\n');

  // Both words appear, in a comment and in a string, and neither is a
  // declaration. This is the shape these manifests actually have.
  const manifestMentioningOnly = [
    '/** Set assetsBaseUrl: when the pillar serves its own pages: list. */',
    'export function build() {',
    "  return { docs: 'assetsBaseUrl: none, pages: none' };",
    '}',
  ].join('\n');

  // No wire manifest at all is a different failure from one that declares
  // nothing, and the guard conflated them until POPS-3220: `ai` names its
  // builder `ai-manifest.ts`, the hardcoded lookup missed it, and the reader
  // was told to add an `assetsBaseUrl` that was already there.
  const noManifestFound = evaluateCoverage(apps, referencedAppPackages(gappedMap), () => ({
    assetsBaseUrl: false,
    pages: false,
    found: false,
  }));

  /**
   * An `src/api` holding only a differently-named manifest, with the directory
   * scan returning nothing — so the ONLY way to find it is the explicit
   * `<pillar>-manifest.ts` name. Without that emptiness the fallback scan finds
   * the file too and the check passes whether or not the name list works,
   * which is what the first version of this test did.
   */
  /** @type {ManifestFs} */
  const fakeFs = {
    existsSync: (/** @type {string} */ path) =>
      path.endsWith('/src/api') || path.endsWith('/beta-manifest.ts'),
    readdirSync: () => [],
    readFileSync: () => 'ManifestPayload',
  };
  /** @type {ManifestFs} */
  const conventionalFs = {
    existsSync: (/** @type {string} */ path) =>
      path.endsWith('/manifest.ts') || path.endsWith('/src/api'),
    readdirSync: () => [],
    readFileSync: () => '',
  };
  /** @type {ManifestFs} */
  const scannedFs = {
    existsSync: (/** @type {string} */ path) => path.endsWith('/src/api'),
    readdirSync: () => ['routes.ts', 'oddly-named.ts'],
    readFileSync: (/** @type {string} */ path) =>
      path.endsWith('oddly-named.ts') ? 'ManifestPayload' : 'nothing',
  };
  /** @type {ManifestFs} */
  const emptyFs = {
    existsSync: (/** @type {string} */ path) => path.endsWith('/src/api'),
    readdirSync: () => ['routes.ts'],
    readFileSync: () => 'nothing here',
  };

  const both = advertisesLoaderMountedUi(manifestWithBoth);
  const emptyPages = advertisesLoaderMountedUi(manifestWithEmptyPages);
  const mentioned = advertisesLoaderMountedUi(manifestMentioningOnly);

  const checks = {
    'complete map passes (no missing)': complete.missing.length === 0,
    'complete map covers both apps': complete.covered.length === 2,
    'gap detected when the wire declares nothing either':
      gapped.missing.length === 1 && gapped.missing[0] === '@pops/app-beta',
    'commented / stringified specifier does not count': gapped.covered.length === 1,
    'non-app import ignored': !complete.covered.includes('@pops/overlay-ego'),
    'an app off the map but on the wire is covered':
      gappedButOnTheWire.missing.length === 0 &&
      gappedButOnTheWire.viaLoader.includes('@pops/app-beta'),
    'assetsBaseUrl without pages is not enough': halfDeclared.missing.length === 1,
    'the failure says what the wire lacks':
      halfDeclared.reasons[0]?.includes('a non-empty pages') === true,
    'a missing manifest is reported as missing, not as undeclared':
      noManifestFound.reasons[0]?.includes('no wire manifest could be found') === true &&
      noManifestFound.reasons[0]?.includes('assetsBaseUrl') === false,
    'the conventional manifest path is preferred':
      locatePillarManifest('beta', conventionalFs)?.endsWith('/manifest.ts') === true,
    'a <pillar>-manifest.ts is found':
      locatePillarManifest('beta', fakeFs)?.endsWith('/beta-manifest.ts') === true,
    'any src/api file building a ManifestPayload is found':
      locatePillarManifest('beta', scannedFs)?.endsWith('/oddly-named.ts') === true,
    'no manifest anywhere returns undefined': locatePillarManifest('beta', emptyFs) === undefined,
    'a manifest declaring both reads as loader-mounted': both.assetsBaseUrl && both.pages,
    'pages: [] reads as no pages': emptyPages.assetsBaseUrl && !emptyPages.pages,
    'a mention in prose or a string is not a declaration':
      !mentioned.assetsBaseUrl && !mentioned.pages,
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard accepts a mapped app and a loader-mounted one, flags ' +
        'an app reachable by neither, and ignores commented / stringified mentions.'
    );
  } else {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/check-bundle-map-coverage.mjs [--self-test]\n' +
        'Asserts every in-repo pillars/*/app package reaches the shell — through the\n' +
        'static bundle-map.tsx, or through the runtime loader via its wire manifest.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  process.exit(run() ? 0 : 1);
}

if (import.meta.main) {
  main();
}
