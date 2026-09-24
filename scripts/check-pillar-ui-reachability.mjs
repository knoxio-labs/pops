#!/usr/bin/env node
/**
 * Pillar-UI reachability guard (P7-T08 / RD-10, widened by POPS-3217,
 * inverted by POPS-3227).
 *
 * There is now exactly one way an in-repo pillar's UI reaches the shell, and
 * this guard asserts every pillar app uses it: the pillar's wire manifest
 * advertises an `assetsBaseUrl`, its `pages`, and a `nav` with non-empty
 * `items`, and the shell `import()`s the built bundle at that URL
 * (`pillars/shell/src/app/external-ui.tsx`). The shell's build knows nothing
 * about the package.
 *
 * Until POPS-3227 there was a second route — a static import of the published
 * `@pops/app-<pillar>` package in the shell's `bundle-map.tsx` (ADR-002) —
 * and this guard accepted either. That map is gone, so the guard is inverted:
 * being on the wire is no longer an alternative, it is the requirement.
 *
 * All three fields are load-bearing rather than belt-and-braces: the loader
 * builds a pillar's routes from `pages` ALONE, and the shell builds the app
 * rail from `nav` ALONE (`navConfigFromDescriptor`), so a manifest missing
 * either advertises a bundle nothing will ever mount a route from, or a route
 * nothing links to. Any omission fails the same silent way — the pillar's UI
 * does not appear, or is unreachable from the rail, with no error anywhere —
 * which is why this is a guard and not a runtime check.
 *
 * What it does:
 *   1. Discover every in-repo pillar app by walking `pillars/<x>/app/package.json`
 *      and reading its `name` (expected `@pops/app-<pillar>`). Discovered from
 *      disk — never a hardcoded pillar list, which is the exact static-rot this
 *      whole phase kills.
 *   2. Read each pillar's wire manifest (`pillars/<x>/src/api/manifest.ts`) and
 *      check it declares `assetsBaseUrl`, a non-empty `pages`, and a `nav`
 *      with non-empty `items`. Comments are stripped first, so a mention in
 *      prose does not count.
 *   3. Exit non-zero listing any pillar the shell cannot reach; exit 0 when
 *      every one is reachable.
 *
 * Usage:
 *   node scripts/check-pillar-ui-reachability.mjs              check the real tree
 *   node scripts/check-pillar-ui-reachability.mjs --self-test  prove the guard catches a gap
 *
 * Exit code 0 on full coverage. Non-zero on any unreachable pillar app, on a
 * failed self-test, or on usage / discovery errors.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripComments } from './ci/import-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/** Package-name prefix every in-repo pillar app must carry. */
const APP_PACKAGE_PREFIX = '@pops/app-';

/**
 * @typedef {object} PillarApp
 * @property {string} pkgName  npm package name, e.g. `@pops/app-finance`.
 * @property {string} pkgPath  Repo-relative `package.json` path that declared it.
 * @property {string} pillarId Directory name under `pillars/`.
 */

/**
 * Discover every in-repo pillar app from disk by walking
 * `pillars/<x>/app/package.json` and reading its `name`. The result is the set
 * of pillars whose UI must be reachable. No hardcoded list.
 *
 * A `pillars/<x>/app/package.json` whose `name` does not start with
 * `@pops/app-` is a malformed app and is reported loudly rather than skipped —
 * the convention (`@pops/app-<pillar>`) is what the build and the published
 * bundle path rely on.
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
          `named "${APP_PACKAGE_PREFIX}<pillar>".`
      );
    }
    out.push({ pkgName: pkg.name, pkgPath, pillarId: entry.name });
  }
  return out.toSorted((a, b) => a.pkgName.localeCompare(b.pkgName));
}

/**
 * Does a pillar's wire-manifest source advertise a loader-mounted UI — an
 * `assetsBaseUrl`, a non-empty `pages`, and a `nav` with non-empty `items`?
 *
 * Read as text because this guard installs nothing (ADR-045 Tier A) and the
 * manifest is TypeScript. Comments are stripped first and each key is anchored
 * to an object-property position, so the words appearing in a docstring or a
 * string literal — which they do, at length, in exactly these files — cannot
 * be mistaken for a declaration.
 *
 * `pages: []` reads as absent: an empty page list is a pillar with no routes
 * for the loader to mount, which is the same nothing as declaring none. Same
 * for `items: []` on `nav`: the shell builds the app rail from `nav.items`
 * ALONE, so a `nav` with no items is a rail entry with nothing to click.
 *
 * @param {string} src Manifest source.
 * @returns {{ assetsBaseUrl: boolean, pages: boolean, nav: boolean }}
 */
export function advertisesLoaderMountedUi(src) {
  const code = stripComments(src);
  // Anchored to the start of a line, not merely to a word boundary. These
  // files discuss `pages`, `assetsBaseUrl` and `nav` at length in prose and in
  // string literals, and `stripComments` removes the prose but not the
  // strings; an object property, which is what this is looking for, is what
  // oxfmt puts at the start of a line.
  const declares = (/** @type {string} */ key) => new RegExp(`^\\s*${key}\\s*:`, 'm').test(code);
  const emptyPages = /^\s*pages\s*:\s*\[\s*\]/m.test(code);
  // `items` is also matched right after a `{ ...FOO_NAV,` spread, not only at
  // the start of a line: the pillar's own `NavConfigDescriptor` projection is
  // `{ ...FOO_NAV, items: [...FOO_NAV.items] }`, which oxfmt keeps on one line
  // when it fits under the print width, putting `items` mid-line rather than
  // at its start. That spread prefix is specific enough not to false-positive
  // on the word appearing in prose or in a string literal, unlike a bare
  // "after any comma" match would.
  const itemsAfterSpread = /\{\s*\.\.\.[\w$]+\s*,\s*items\s*:/;
  const declaresItems = /^\s*items\s*:/m.test(code) || itemsAfterSpread.test(code);
  const emptyItems =
    /^\s*items\s*:\s*\[\s*\]/m.test(code) ||
    /\{\s*\.\.\.[\w$]+\s*,\s*items\s*:\s*\[\s*\]/.test(code);
  return {
    assetsBaseUrl: declares('assetsBaseUrl'),
    pages: declares('pages') && !emptyPages,
    nav: declares('nav') && declaresItems && !emptyItems,
  };
}

/**
 * @typedef {object} ReachabilityResult
 * @property {string[]} missing  Pillar-app package names the shell cannot reach.
 * @property {string[]} covered  Pillar-app package names the loader will mount.
 * @property {string[]} reasons  One line per missing app saying what it lacks.
 */

/**
 * Pure core: assert every discovered pillar app is reachable through the
 * runtime loader. Pure (no I/O) so the self-test can drive it over in-memory
 * fixtures.
 *
 * @param {PillarApp[]} apps  Discovered pillar apps.
 * @param {(app: PillarApp) => { assetsBaseUrl: boolean, pages: boolean, nav: boolean, found?: boolean }} loaderUiOf
 *   What the pillar's wire manifest advertises. `found: false` means no wire
 *   manifest could be located at all, which is reported as its own failure
 *   rather than as a manifest that declares nothing — the two need different
 *   fixes, and conflating them sent a reader looking for a missing
 *   `assetsBaseUrl` in a file that was there and correct (POPS-3220).
 * @returns {ReachabilityResult}
 */
export function evaluateReachability(apps, loaderUiOf) {
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const covered = [];
  /** @type {string[]} */
  const reasons = [];

  for (const app of apps) {
    const wire = loaderUiOf(app);
    if (wire.assetsBaseUrl && wire.pages && wire.nav) {
      covered.push(app.pkgName);
      continue;
    }
    missing.push(app.pkgName);
    if (wire.found === false) {
      reasons.push(
        `${app.pkgName} — no wire manifest could be found for pillar ` +
          `'${app.pillarId}' (looked for src/api/manifest.ts, ` +
          `src/api/${app.pillarId}-manifest.ts, and any src/api/*.ts building a ` +
          `ManifestPayload)`
      );
      continue;
    }
    // Every fragment reads after a bare `no`, so one cause and several produce
    // the same sentence shape. The article-carrying form this replaced said
    // "declares no an assetsBaseUrl" for a single cause — and the form before
    // THAT said "declares no a non-empty pages", so the pages-only case has
    // been ungrammatical the whole time and only the assetsBaseUrl-only case
    // ever read correctly.
    const lacks = [];
    if (!wire.assetsBaseUrl) lacks.push('assetsBaseUrl');
    if (!wire.pages) lacks.push('non-empty pages');
    if (!wire.nav) lacks.push('nav with non-empty items');
    reasons.push(`${app.pkgName} — its wire manifest declares no ${lacks.join(' and no ')}`);
  }

  return { missing, covered, reasons };
}

/**
 * Find the file that builds a pillar's wire `ManifestPayload`.
 *
 * `src/api/manifest.ts` is the convention and every pillar follows it today.
 * The fallbacks are not for a pillar that currently deviates; they are because
 * the lookup used to hardcode that path and return "declares nothing" when it
 * was absent, so a correct manifest under a different name read exactly like a
 * missing `assetsBaseUrl` and the reader was sent to look for a declaration
 * that was already there. `ai` was that pillar and has since been renamed onto
 * the convention — what this guards against is the failure mode, not the one
 * file (POPS-3220).
 *
 * The last resort scans `src/api/*.ts` for the payload type rather than
 * enumerating more names, so a pillar that picks its own filename is found
 * without this list having to grow. Returns `undefined` when there is
 * genuinely nothing, which the caller reports as its own failure rather than
 * as a manifest declaring nothing.
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
  const { missing, covered, reasons } = evaluateReachability(apps, (app) => {
    const manifestPath = locatePillarManifest(app.pillarId);
    if (manifestPath === undefined) {
      return { assetsBaseUrl: false, pages: false, nav: false, found: false };
    }
    return { ...advertisesLoaderMountedUi(readFileSync(manifestPath, 'utf8')), found: true };
  });

  console.log(`Discovered ${apps.length} pillar app(s).`);
  for (const name of covered) console.log(`  OK  ${name}`);

  if (missing.length === 0) {
    console.log('OK — every pillar app reaches the shell through the runtime loader.');
    return true;
  }

  console.error(`FAIL — ${missing.length} pillar app(s) the shell cannot reach:`);
  for (const reason of reasons) console.error(`  XX  ${reason}`);
  console.error(
    `  A pillar's UI arrives one way: an \`assetsBaseUrl\` + \`pages\` + \`nav\` in ` +
      `its wire manifest, which the shell loads at runtime. Without all three, the ` +
      `UI silently fails to mount or is unreachable from the app rail.`
  );
  return false;
}

/**
 * Synthetic fixtures proving the guard catches a gap and passes a complete
 * tree. Mirrors the `--self-test` convention in check-exports.mjs /
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

  const noWireUi = () => ({ assetsBaseUrl: false, pages: false, nav: false });
  const loaderMounted = () => ({ assetsBaseUrl: true, pages: true, nav: true });

  const complete = evaluateReachability(apps, loaderMounted);
  const bothMissing = evaluateReachability(apps, noWireUi);
  const onlyAlphaOnTheWire = evaluateReachability(apps, (app) =>
    app.pkgName === '@pops/app-alpha' ? loaderMounted() : noWireUi()
  );
  const halfDeclared = evaluateReachability(apps, () => ({
    assetsBaseUrl: true,
    pages: false,
    nav: true,
  }));
  // Pages and assetsBaseUrl present, nav absent: routes mount but nothing on
  // the rail links to them.
  const navMissing = evaluateReachability(apps, () => ({
    assetsBaseUrl: true,
    pages: true,
    nav: false,
  }));

  // The `{ ...BETA_NAV, items: [...BETA_NAV.items] }` shape is the real one:
  // oxfmt keeps this particular projection on one line, so `items` lands
  // mid-line rather than at the start of its own line.
  const manifestWithBoth = [
    'const BETA_WIRE_NAV = { ...BETA_NAV, items: [...BETA_NAV.items] };',
    'export function build() {',
    '  return {',
    "    assetsBaseUrl: '/beta-ui/beta.js',",
    '    pages: [...BETA_PAGES],',
    '    nav: BETA_WIRE_NAV,',
    '  };',
    '}',
  ].join('\n');

  const manifestWithEmptyPages = [
    'const BETA_WIRE_NAV = { ...BETA_NAV, items: [...BETA_NAV.items] };',
    'export function build() {',
    '  return {',
    "    assetsBaseUrl: '/beta-ui/beta.js',",
    '    pages: [],',
    '    nav: BETA_WIRE_NAV,',
    '  };',
    '}',
  ].join('\n');

  // `nav` is declared but its `items` list is empty: an app-rail entry with
  // nothing to click.
  const manifestWithEmptyNavItems = [
    'const BETA_WIRE_NAV = { ...BETA_NAV, items: [] };',
    'export function build() {',
    '  return {',
    "    assetsBaseUrl: '/beta-ui/beta.js',",
    '    pages: [...BETA_PAGES],',
    '    nav: BETA_WIRE_NAV,',
    '  };',
    '}',
  ].join('\n');

  // All three words appear, in a comment and in a string, and none is a
  // declaration. This is the shape these manifests actually have.
  const manifestMentioningOnly = [
    '/** Set assetsBaseUrl: when the pillar serves its own pages: and nav: list. */',
    'export function build() {',
    "  return { docs: 'assetsBaseUrl: none, pages: none, nav: none, items: none' };",
    '}',
  ].join('\n');

  // No wire manifest at all is a different failure from one that declares
  // nothing, and the guard conflated them until POPS-3220, back when `ai`
  // named its builder `ai-manifest.ts`: the hardcoded lookup missed it, and
  // the reader was told to add an `assetsBaseUrl` that was already there.
  const noManifestFound = evaluateReachability(apps, () => ({
    assetsBaseUrl: false,
    pages: false,
    nav: false,
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
  const emptyNavItems = advertisesLoaderMountedUi(manifestWithEmptyNavItems);
  const mentioned = advertisesLoaderMountedUi(manifestMentioningOnly);

  const checks = {
    'a fully wired tree passes': complete.missing.length === 0 && complete.covered.length === 2,
    'a pillar off the wire is flagged':
      bothMissing.missing.length === 2 && bothMissing.covered.length === 0,
    'only the pillar off the wire is flagged':
      onlyAlphaOnTheWire.missing.length === 1 && onlyAlphaOnTheWire.missing[0] === '@pops/app-beta',
    'assetsBaseUrl without pages is not enough': halfDeclared.missing.length === 2,
    'the failure says what the wire lacks':
      halfDeclared.reasons[0]?.includes('declares no non-empty pages') === true,
    'pages and assetsBaseUrl without nav is not enough': navMissing.missing.length === 2,
    'the failure says nav is what the wire lacks':
      navMissing.reasons[0]?.includes('declares no nav with non-empty items') === true,
    // Both shapes the message can take, because each has been ungrammatical at
    // some point and nothing asserted the wording. `halfDeclared` above drives
    // the one-field sentence; this drives the multi-field one.
    'every missing field reads as one sentence':
      bothMissing.reasons[0]?.includes(
        'declares no assetsBaseUrl and no non-empty pages and no nav with non-empty items'
      ) === true,
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
    'a manifest declaring all three reads as loader-mounted':
      both.assetsBaseUrl && both.pages && both.nav,
    'pages: [] reads as no pages': emptyPages.assetsBaseUrl && !emptyPages.pages && emptyPages.nav,
    'nav with items: [] reads as no nav':
      emptyNavItems.assetsBaseUrl && emptyNavItems.pages && !emptyNavItems.nav,
    'a mention in prose or a string is not a declaration':
      !mentioned.assetsBaseUrl && !mentioned.pages && !mentioned.nav,
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard accepts a loader-mounted app, flags one the shell ' +
        'cannot reach, and reads neither prose nor an empty page list as a declaration.'
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
      'Usage: node scripts/check-pillar-ui-reachability.mjs [--self-test]\n' +
        'Asserts every in-repo pillars/*/app package reaches the shell through the\n' +
        'runtime loader, via an assetsBaseUrl + pages in its wire manifest.'
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
