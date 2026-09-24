#!/usr/bin/env node
/**
 * Pillar-locales guard (POPS-4630).
 *
 * Since #5148, a pillar's translations are no longer bundled centrally: each
 * `pillars/<x>/app` owns `src/locales/en-AU.json` and `src/locales/pt-BR.json`,
 * an `src/locales/index.ts` that assembles them into the `RemotePillarI18n` the
 * shell registers, and an `src/locales/locales.test.ts` that proves the two
 * catalogues stay in parity via `localeCatalogueProblems` from
 * `@pops/pillar-sdk/testing`.
 *
 * Nothing enumerates the apps that are supposed to carry this. A new
 * `pillars/<x>/app` that copies an `en-AU.json` but never adds `pt-BR.json`,
 * or that never wires a `locales.test.ts` calling the parity helper, passes
 * CI silently: the loss shows up only as raw keys or missing strings in the
 * Portuguese build, with no error anywhere.
 *
 * What it does:
 *   1. Discover every in-repo pillar app by walking `pillars/<x>/app/package.json`
 *      and reading its `name` (expected `@pops/app-<pillar>`). Discovered from
 *      disk — never a hardcoded pillar list.
 *   2. For every discovered app that has an `src/locales/` directory, assert
 *      it has both `en-AU.json` and `pt-BR.json`, an `index.ts`, and a
 *      `locales.test.ts` whose comment-stripped source calls
 *      `localeCatalogueProblems`. An app with no `src/locales/` at all is
 *      outside this guard's scope — it is reported, not silently skipped.
 *   3. Exit non-zero listing any app with an incomplete `src/locales/`; exit 0
 *      when every one that has the directory is complete.
 *
 * Usage:
 *   node scripts/check-pillar-locales.mjs              check the real tree
 *   node scripts/check-pillar-locales.mjs --self-test   prove the guard catches a gap
 *
 * Exit code 0 on full coverage. Non-zero on any incomplete `src/locales/`, on
 * a failed self-test, or on usage / discovery errors.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
 * of pillars whose `src/locales/`, if any, must be complete. No hardcoded
 * list.
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
 * Does a `locales.test.ts`'s comment-stripped source actually call
 * `localeCatalogueProblems`, rather than merely mention it? These files also
 * import the name, so the check looks for a call, not just the identifier
 * appearing somewhere — an import with no call still leaves the two catalogues
 * unchecked for parity.
 *
 * @param {string} src `locales.test.ts` source.
 * @returns {boolean}
 */
export function referencesLocaleCatalogueProblems(src) {
  const code = stripComments(src);
  return /\blocaleCatalogueProblems\s*\(/.test(code);
}

/**
 * @typedef {object} LocaleFacts
 * @property {boolean} hasLocalesDir Does `src/locales/` exist at all?
 * @property {boolean} [enAU]        Does `src/locales/en-AU.json` exist?
 * @property {boolean} [ptBR]        Does `src/locales/pt-BR.json` exist?
 * @property {boolean} [indexTs]     Does `src/locales/index.ts` exist?
 * @property {boolean} [testFile]    Does `src/locales/locales.test.ts` exist?
 * @property {boolean} [testReferencesHelper] Does that test call `localeCatalogueProblems`?
 */

/**
 * @typedef {object} LocaleParityResult
 * @property {string[]} missing  Pillar-app package names with an incomplete `src/locales/`.
 * @property {string[]} covered  Pillar-app package names with a complete `src/locales/`.
 * @property {string[]} skipped  Pillar-app package names with no `src/locales/` at all.
 * @property {string[]} reasons  One line per missing app saying what it lacks.
 */

/**
 * Pure core: assert every discovered pillar app that has an `src/locales/`
 * directory carries both catalogues, an index, and a parity test that calls
 * the shared helper. Pure (no I/O) so the self-test can drive it over
 * in-memory fixtures.
 *
 * An app with no `src/locales/` at all is neither covered nor missing — it is
 * outside this guard's scope, and reported as `skipped` so a reader can tell
 * "nothing to check" from "checked and clean".
 *
 * @param {PillarApp[]} apps  Discovered pillar apps.
 * @param {(app: PillarApp) => LocaleFacts} factsOf  What that app's `src/locales/` contains.
 * @returns {LocaleParityResult}
 */
export function evaluateLocaleParity(apps, factsOf) {
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const covered = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const reasons = [];

  for (const app of apps) {
    const facts = factsOf(app);
    if (!facts.hasLocalesDir) {
      skipped.push(app.pkgName);
      continue;
    }
    if (facts.enAU && facts.ptBR && facts.indexTs && facts.testFile && facts.testReferencesHelper) {
      covered.push(app.pkgName);
      continue;
    }
    missing.push(app.pkgName);
    const lacks = [];
    if (!facts.enAU) lacks.push('src/locales/en-AU.json');
    if (!facts.ptBR) lacks.push('src/locales/pt-BR.json');
    if (!facts.indexTs) lacks.push('src/locales/index.ts');
    if (!facts.testFile) {
      lacks.push('src/locales/locales.test.ts');
    } else if (!facts.testReferencesHelper) {
      lacks.push('a locales.test.ts that calls localeCatalogueProblems');
    }
    reasons.push(`${app.pkgName} — its src/locales/ is missing ${lacks.join(' and ')}`);
  }

  return { missing, covered, skipped, reasons };
}

/**
 * Read an app's `src/locales/` off disk into the facts `evaluateLocaleParity`
 * needs.
 *
 * @typedef {object} LocaleFs
 * @property {(path: string) => boolean} existsSync
 * @property {(path: string, encoding: 'utf8') => string} readFileSync
 *
 * @param {PillarApp} app
 * @param {LocaleFs} [files]  Injected so the self-test can drive layouts that
 *   do not exist on disk.
 * @returns {LocaleFacts}
 */
export function localeFactsOf(app, files = /** @type {LocaleFs} */ ({ existsSync, readFileSync })) {
  const dir = join(repoRoot, 'pillars', app.pillarId, 'app', 'src', 'locales');
  if (!files.existsSync(dir)) return { hasLocalesDir: false };
  const testPath = join(dir, 'locales.test.ts');
  const testFile = files.existsSync(testPath);
  return {
    hasLocalesDir: true,
    enAU: files.existsSync(join(dir, 'en-AU.json')),
    ptBR: files.existsSync(join(dir, 'pt-BR.json')),
    indexTs: files.existsSync(join(dir, 'index.ts')),
    testFile,
    testReferencesHelper:
      testFile && referencesLocaleCatalogueProblems(files.readFileSync(testPath, 'utf8')),
  };
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
  const { missing, covered, skipped, reasons } = evaluateLocaleParity(apps, (app) =>
    localeFactsOf(app)
  );

  console.log(`Discovered ${apps.length} pillar app(s).`);
  for (const name of covered) console.log(`  OK  ${name}`);
  for (const name of skipped) console.log(`  --  ${name} (no src/locales/, nothing to check)`);

  if (missing.length === 0) {
    console.log(
      'OK — every pillar app with an src/locales/ directory ships both catalogues, an ' +
        'index, and a parity test.'
    );
    return true;
  }

  console.error(`FAIL — ${missing.length} pillar app(s) with an incomplete src/locales/:`);
  for (const reason of reasons) console.error(`  XX  ${reason}`);
  console.error(
    `  Since #5148, a pillar's translations ship as its own src/locales/en-AU.json + ` +
      `pt-BR.json, an index.ts, and a locales.test.ts that calls localeCatalogueProblems. ` +
      `Without all four, a locale gap or a missing parity test ships with nothing catching it.`
  );
  return false;
}

/**
 * Synthetic fixtures proving the guard catches a gap and passes a complete
 * tree. Mirrors the `--self-test` convention in
 * check-pillar-ui-reachability.mjs so a regression that neuters the guard is
 * caught without a real tree break.
 *
 * @returns {boolean} true if the guard behaves correctly on the fixtures.
 */
function selfTest() {
  /** @type {PillarApp} */
  const alpha = {
    pkgName: '@pops/app-alpha',
    pkgPath: 'pillars/alpha/app/package.json',
    pillarId: 'alpha',
  };
  /** @type {PillarApp} */
  const beta = {
    pkgName: '@pops/app-beta',
    pkgPath: 'pillars/beta/app/package.json',
    pillarId: 'beta',
  };
  /** @type {PillarApp[]} */
  const apps = [alpha, beta];

  const noLocalesDir = () => ({ hasLocalesDir: false });
  const complete = () => ({
    hasLocalesDir: true,
    enAU: true,
    ptBR: true,
    indexTs: true,
    testFile: true,
    testReferencesHelper: true,
  });

  const allComplete = evaluateLocaleParity(apps, complete);
  const allSkipped = evaluateLocaleParity(apps, noLocalesDir);
  const onlyAlphaHasLocales = evaluateLocaleParity(apps, (app) =>
    app.pkgName === '@pops/app-alpha' ? complete() : noLocalesDir()
  );
  const missingPtBR = evaluateLocaleParity(apps, () => ({
    ...complete(),
    ptBR: false,
  }));
  const missingEnAU = evaluateLocaleParity(apps, () => ({
    ...complete(),
    enAU: false,
  }));
  const missingIndex = evaluateLocaleParity(apps, () => ({
    ...complete(),
    indexTs: false,
  }));
  const missingTestFile = evaluateLocaleParity(apps, () => ({
    ...complete(),
    testFile: false,
    testReferencesHelper: false,
  }));
  const testDoesNotCallHelper = evaluateLocaleParity(apps, () => ({
    ...complete(),
    testReferencesHelper: false,
  }));
  const missingEverything = evaluateLocaleParity(apps, () => ({
    hasLocalesDir: true,
    enAU: false,
    ptBR: false,
    indexTs: false,
    testFile: false,
    testReferencesHelper: false,
  }));

  const testCallingHelper = [
    "import { localeCatalogueProblems } from '@pops/pillar-sdk/testing';",
    "import { i18n } from '.';",
    "it('ships parity', () => {",
    '  expect(localeCatalogueProblems(i18n.resources)).toEqual([]);',
    '});',
  ].join('\n');

  const testImportingOnly = [
    "import { localeCatalogueProblems } from '@pops/pillar-sdk/testing';",
    "it('does nothing with it', () => {",
    '  expect(true).toBe(true);',
    '});',
  ].join('\n');

  const testMentioningOnlyInProse = [
    '/** Should call localeCatalogueProblems( to prove parity, but this one forgot. */',
    "it('does nothing', () => {",
    '  expect(true).toBe(true);',
    '});',
  ].join('\n');

  const callsHelper = referencesLocaleCatalogueProblems(testCallingHelper);
  const importsOnly = referencesLocaleCatalogueProblems(testImportingOnly);
  const mentionedOnly = referencesLocaleCatalogueProblems(testMentioningOnlyInProse);

  /** @type {LocaleFs} */
  const diskWithLocales = {
    existsSync: (/** @type {string} */ path) =>
      path.endsWith('/src/locales') ||
      path.endsWith('/en-AU.json') ||
      path.endsWith('/pt-BR.json') ||
      path.endsWith('/index.ts') ||
      path.endsWith('/locales.test.ts'),
    readFileSync: () => testCallingHelper,
  };
  /** @type {LocaleFs} */
  const diskMissingPtBR = {
    existsSync: (/** @type {string} */ path) =>
      path.endsWith('/src/locales') ||
      path.endsWith('/en-AU.json') ||
      path.endsWith('/index.ts') ||
      path.endsWith('/locales.test.ts'),
    readFileSync: () => testCallingHelper,
  };
  /** @type {LocaleFs} */
  const diskNoLocalesDir = {
    existsSync: () => false,
    readFileSync: () => '',
  };

  const checks = {
    'a fully wired tree passes':
      allComplete.missing.length === 0 && allComplete.covered.length === 2,
    'an app with no src/locales/ at all is skipped, not flagged':
      allSkipped.missing.length === 0 &&
      allSkipped.covered.length === 0 &&
      allSkipped.skipped.length === 2,
    'only the app carrying locales is checked, the other is skipped':
      onlyAlphaHasLocales.covered.length === 1 &&
      onlyAlphaHasLocales.covered[0] === '@pops/app-alpha' &&
      onlyAlphaHasLocales.skipped.length === 1 &&
      onlyAlphaHasLocales.skipped[0] === '@pops/app-beta',
    'a missing pt-BR.json is flagged':
      missingPtBR.missing.length === 2 &&
      missingPtBR.reasons[0]?.includes('src/locales/pt-BR.json') === true,
    'a missing en-AU.json is flagged':
      missingEnAU.missing.length === 2 &&
      missingEnAU.reasons[0]?.includes('src/locales/en-AU.json') === true,
    'a missing index.ts is flagged':
      missingIndex.missing.length === 2 &&
      missingIndex.reasons[0]?.includes('src/locales/index.ts') === true,
    'a missing locales.test.ts is flagged, not read as "does not call the helper"':
      missingTestFile.missing.length === 2 &&
      missingTestFile.reasons[0]?.includes('src/locales/locales.test.ts') === true &&
      missingTestFile.reasons[0]?.includes('calls localeCatalogueProblems') === false,
    'a locales.test.ts that never calls the helper is flagged':
      testDoesNotCallHelper.missing.length === 2 &&
      testDoesNotCallHelper.reasons[0]?.includes(
        'a locales.test.ts that calls localeCatalogueProblems'
      ) === true,
    'every missing field reads as one sentence':
      missingEverything.reasons[0]?.includes(
        'src/locales/en-AU.json and src/locales/pt-BR.json and src/locales/index.ts and ' +
          'src/locales/locales.test.ts'
      ) === true,
    'a real call to the helper is recognised': callsHelper === true,
    'importing the helper without calling it does not count': importsOnly === false,
    'a mention in a comment is not a call': mentionedOnly === false,
    'reading a complete tree off disk passes':
      localeFactsOf(alpha, diskWithLocales).enAU === true &&
      localeFactsOf(alpha, diskWithLocales).ptBR === true &&
      localeFactsOf(alpha, diskWithLocales).indexTs === true &&
      localeFactsOf(alpha, diskWithLocales).testReferencesHelper === true,
    'reading a tree missing pt-BR.json off disk flags it':
      localeFactsOf(alpha, diskMissingPtBR).ptBR === false,
    'reading a tree with no src/locales/ off disk reports it as absent, not incomplete':
      localeFactsOf(alpha, diskNoLocalesDir).hasLocalesDir === false,
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard accepts a complete src/locales/, skips an app with none, flags ' +
        'each missing file and a test that never calls localeCatalogueProblems, and reads ' +
        'neither an import nor prose as a real call.'
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
      'Usage: node scripts/check-pillar-locales.mjs [--self-test]\n' +
        'Asserts every in-repo pillars/*/app package with an src/locales/ directory ships\n' +
        'en-AU.json, pt-BR.json, index.ts, and a locales.test.ts that calls\n' +
        'localeCatalogueProblems.'
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
