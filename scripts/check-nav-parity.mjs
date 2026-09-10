#!/usr/bin/env node
/**
 * Nav parity gate (POPS-3357).
 *
 * Every pillar declares its navigation TWICE: once as `navConfig` in
 * `pillars/<id>/app/src/nav.ts` (runtime shape, PascalCase `IconName`), and
 * once as a `NavConfigDescriptor` in `pillars/<id>/src/api/manifest.ts` (wire
 * shape, kebab-case icon ids). Only one of them is what a user sees. Since
 * POPS-3227 removed the static bundle map, the shell builds every pillar's
 * rail and page nav from the WIRE copy (`navConfigFromDescriptor` in
 * `pillars/shell/src/app/external-ui.tsx`); the app copy is what the design
 * playground draws and what the app's own `ModuleManifest` carries.
 *
 * Nothing made the two agree. `pillars/<id>/src/contract/pages.ts` is shared
 * by both sides precisely so the PAGE surface cannot drift — its own docstring
 * argues the case — but nav was left as two literals, and both had drifted by
 * the time this gate was written: finance's wire nav was missing Accounts, Tag
 * Rules and Settings (three pages that mounted fine and had no link), and
 * media's rail colour said `indigo` in the app and `violet` on the wire. Both
 * failures are silent in the same way — the app looks fine to whoever edited
 * it, and the shell renders something else.
 *
 * What it does:
 *   1. Discover every pillar that has BOTH files, from disk — never a
 *      hardcoded pillar list (POPS-1629: a matrix derived independently of the
 *      thing it gates is how a rename removes a pillar from its own guard).
 *   2. Parse both declarations and compare them field by field: the nav
 *      header (id, label, labelKey, basePath, color, icon) and every item
 *      (label, labelKey, icon), in both directions, so an item present on one
 *      side only is a violation whichever side it is on.
 *   3. Icons compare modulo spelling: the wire's kebab id is converted to the
 *      PascalCase the app uses, the same way the shell's `resolveNavIcon`
 *      does. Everything else compares exactly.
 *
 * A pillar whose nav cannot be parsed is a FAILURE, not a skip: a rename that
 * makes this gate stop seeing a declaration must be loud, or the gate reports
 * OK over a repo it can no longer read (ADR-045).
 *
 * Usage:
 *   node scripts/check-nav-parity.mjs              check the real tree
 *   node scripts/check-nav-parity.mjs --self-test  prove the gate reports
 *
 * Exit 0 = every pillar's two nav declarations agree. Exit 1 = a mismatch,
 * an unparseable declaration, collapsed coverage or a failed self-test.
 * Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { balancedSpan, topLevelObjects, topLevelProperties } from './ci/js-object-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/** Nav fields compared verbatim between the two declarations. */
const HEADER_FIELDS = ['id', 'label', 'labelKey', 'basePath', 'color'];

/**
 * Item fields compared verbatim; `icon` is compared separately, modulo case.
 * @type {ReadonlyArray<'label' | 'labelKey'>}
 */
const ITEM_FIELDS = ['label', 'labelKey'];

/**
 * The wire spells icons in kebab-case and the app in PascalCase, so a raw
 * comparison would report every icon as a mismatch. This is the same
 * conversion the shell applies in `resolveNavIcon` — `building-2` becomes
 * `Building2` — so the gate compares what the shell actually renders against
 * what the app declares, not two spellings of it.
 *
 * @param {string} icon
 * @returns {string}
 */
export function pascalCaseIcon(icon) {
  return icon
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Unwrap a parsed property value that is a string literal. Returns undefined
 * for an absent property and for a value that is not a plain literal (an
 * identifier, a spread, a template with a substitution) — a caller comparing
 * two sides treats "not a literal" as "cannot be compared" rather than
 * inventing a value for it.
 *
 * @param {string | undefined} raw
 * @returns {string | undefined}
 */
function literal(raw) {
  if (raw === undefined) return undefined;
  const match = /^['"`]([^'"`]*)['"`]$/.exec(raw.trim());
  return match?.[1];
}

/**
 * @typedef {object} NavItem
 * @property {string} path Normalized: no leading slash, '' for the index route.
 * @property {string | undefined} label
 * @property {string | undefined} labelKey
 * @property {string | undefined} icon
 */

/**
 * @typedef {object} NavDeclaration
 * @property {Record<string, string | undefined>} header
 * @property {NavItem[]} items
 */

/**
 * Parse one nav declaration out of source text, starting at the first
 * occurrence of `anchor` (the app's `export const navConfig`, or the wire's
 * `: NavConfigDescriptor` type annotation).
 *
 * Returns null when the anchor is absent or its object never balances —
 * distinct from a declaration that parses to zero items, which is a real
 * (and reportable) state.
 *
 * @param {string} source
 * @param {RegExp} anchor
 * @returns {NavDeclaration | null}
 */
export function parseNavDeclaration(source, anchor) {
  const match = anchor.exec(source);
  if (match === null) return null;
  const span = balancedSpan(source, match.index, '{', '}');
  if (span === undefined) return null;

  const props = topLevelProperties(span);
  /** @type {Record<string, string | undefined>} */
  const header = {};
  for (const field of HEADER_FIELDS) header[field] = literal(props.get(field));
  header['icon'] = literal(props.get('icon'));

  const itemsRaw = props.get('items');
  if (itemsRaw === undefined) return null;
  const itemsSpan = balancedSpan(itemsRaw, 0, '[', ']');
  if (itemsSpan === undefined) return null;

  /** @type {NavItem[]} */
  const items = [];
  for (const object of topLevelObjects(itemsSpan)) {
    const itemProps = topLevelProperties(object);
    const path = literal(itemProps.get('path'));
    if (path === undefined) continue;
    items.push({
      path: path.replace(/^\//, ''),
      label: literal(itemProps.get('label')),
      labelKey: literal(itemProps.get('labelKey')),
      icon: literal(itemProps.get('icon')),
    });
  }
  return { header, items };
}

/** The app-side declaration's anchor. */
const APP_ANCHOR = /export const navConfig\s*=/;

/** The wire-side declaration's anchor. */
const WIRE_ANCHOR = /:\s*NavConfigDescriptor\s*=/;

/**
 * @typedef {object} Mismatch
 * @property {'header' | 'item' | 'app-only' | 'wire-only'} kind
 * @property {string} pillar
 * @property {string} field
 * @property {string | undefined} [app]
 * @property {string | undefined} [wire]
 */

/**
 * Compare one pillar's two nav declarations.
 *
 * @param {string} pillar
 * @param {NavDeclaration} app
 * @param {NavDeclaration} wire
 * @returns {Mismatch[]}
 */
export function compareNav(pillar, app, wire) {
  /** @type {Mismatch[]} */
  const mismatches = [];

  for (const field of HEADER_FIELDS) {
    if (app.header[field] !== wire.header[field]) {
      mismatches.push({
        kind: 'header',
        pillar,
        field,
        app: app.header[field],
        wire: wire.header[field],
      });
    }
  }
  const wireHeaderIcon = wire.header['icon'];
  const appHeaderIcon = app.header['icon'];
  if (appHeaderIcon !== pascalCaseIcon(wireHeaderIcon ?? '')) {
    mismatches.push({
      kind: 'header',
      pillar,
      field: 'icon',
      app: appHeaderIcon,
      wire: wireHeaderIcon,
    });
  }

  const wireByPath = new Map(wire.items.map((item) => [item.path, item]));
  for (const appItem of app.items) {
    const label = appItem.path === '' ? '(index)' : appItem.path;
    const wireItem = wireByPath.get(appItem.path);
    if (wireItem === undefined) {
      mismatches.push({ kind: 'app-only', pillar, field: label, app: appItem.label });
      continue;
    }
    for (const field of ITEM_FIELDS) {
      if (appItem[field] !== wireItem[field]) {
        mismatches.push({
          kind: 'item',
          pillar,
          field: `${label}.${field}`,
          app: appItem[field],
          wire: wireItem[field],
        });
      }
    }
    if (appItem.icon !== pascalCaseIcon(wireItem.icon ?? '')) {
      mismatches.push({
        kind: 'item',
        pillar,
        field: `${label}.icon`,
        app: appItem.icon,
        wire: wireItem.icon,
      });
    }
  }

  const appPaths = new Set(app.items.map((item) => item.path));
  for (const wireItem of wire.items) {
    if (appPaths.has(wireItem.path)) continue;
    mismatches.push({
      kind: 'wire-only',
      pillar,
      field: wireItem.path === '' ? '(index)' : wireItem.path,
      wire: wireItem.label,
    });
  }

  return mismatches;
}

/**
 * @typedef {object} PillarNavFiles
 * @property {string} pillar
 * @property {string} appFile
 * @property {string} wireFile
 */

/**
 * Every pillar carrying BOTH an app `nav.ts` and a wire manifest, read off
 * disk. A pillar with only one of the two is not this gate's business: a
 * backend-only pillar has no app nav, and an app with no wire manifest is
 * already what `check-pillar-ui-reachability.mjs` fails on.
 *
 * @returns {PillarNavFiles[]}
 */
export function discoverPillarNavFiles() {
  /** @type {PillarNavFiles[]} */
  const found = [];
  const pillarsDir = join(repoRoot, 'pillars');
  for (const entry of readdirSync(pillarsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const appFile = join(pillarsDir, entry.name, 'app', 'src', 'nav.ts');
    const wireFile = join(pillarsDir, entry.name, 'src', 'api', 'manifest.ts');
    if (!existsSync(appFile) || !existsSync(wireFile)) continue;
    found.push({ pillar: entry.name, appFile, wireFile });
  }
  return found.toSorted((a, b) => a.pillar.localeCompare(b.pillar));
}

/** A floor on discovery — this repo has several nav-bearing pillars. */
const MIN_PILLARS = 5;

/**
 * A floor on what the gate actually COMPARED. Counting files proves nothing:
 * a parser that reads zero items out of every one of them still finds every
 * file and still prints OK. The real tree compares 49 nav items; 40 leaves
 * room for a page to stop being a nav destination while still failing loudly
 * if a whole pillar's worth of items goes dark.
 */
const MIN_COMPARED_ITEMS = 40;

/**
 * @typedef {object} PillarReport
 * @property {string} pillar
 * @property {number} appItems
 * @property {number} wireItems
 * @property {string | null} parseError
 * @property {Mismatch[]} mismatches
 */

/**
 * @param {PillarNavFiles} files
 * @returns {PillarReport}
 */
function reportPillar({ pillar, appFile, wireFile }) {
  const app = parseNavDeclaration(readFileSync(appFile, 'utf8'), APP_ANCHOR);
  const wire = parseNavDeclaration(readFileSync(wireFile, 'utf8'), WIRE_ANCHOR);
  const empty = { pillar, appItems: 0, wireItems: 0, mismatches: [] };
  if (app === null) {
    return { ...empty, parseError: `no parseable navConfig in ${appFile}` };
  }
  if (wire === null) {
    return { ...empty, parseError: `no parseable NavConfigDescriptor in ${wireFile}` };
  }
  return {
    pillar,
    appItems: app.items.length,
    wireItems: wire.items.length,
    parseError: null,
    mismatches: compareNav(pillar, app, wire),
  };
}

/**
 * @param {PillarReport[]} reports
 */
function printCoverage(reports) {
  for (const report of reports) {
    const detail =
      report.parseError === null
        ? `app ${report.appItems}, wire ${report.wireItems}, mismatches ${report.mismatches.length}`
        : `UNPARSEABLE — ${report.parseError}`;
    console.log(`  ${report.pillar.padEnd(12)} ${detail}`);
  }
}

/**
 * @param {Mismatch} mismatch
 * @returns {string}
 */
function describe(mismatch) {
  switch (mismatch.kind) {
    case 'app-only':
      return `${mismatch.pillar}: nav item '${mismatch.field}' (${mismatch.app}) is declared in the app but MISSING from the wire manifest — the shell will not render a link to it`;
    case 'wire-only':
      return `${mismatch.pillar}: nav item '${mismatch.field}' (${mismatch.wire}) is on the wire but not in the app's navConfig`;
    default:
      return `${mismatch.pillar}: ${mismatch.field} — app '${mismatch.app}' vs wire '${mismatch.wire}'`;
  }
}

/** @returns {boolean} */
function run() {
  const files = discoverPillarNavFiles();
  if (files.length < MIN_PILLARS) {
    console.error(
      `✗ nav-parity gate: found only ${files.length} pillar(s) with both nav declarations, ` +
        `below the floor of ${MIN_PILLARS}. Discovery is broken — this is not a clean tree.`
    );
    return false;
  }

  const reports = files.map(reportPillar);
  console.log(`Checked ${reports.length} pillar(s) for app/wire nav parity.`);
  printCoverage(reports);

  const unparseable = reports.filter((report) => report.parseError !== null);
  if (unparseable.length > 0) {
    console.error(
      `✗ nav-parity gate: ${unparseable.length} pillar(s) whose nav could not be read. The gate ` +
        `is checking nothing there — fix the parse, not this floor:`
    );
    for (const report of unparseable) console.error(`  XX  ${report.parseError}`);
    return false;
  }

  const compared = reports.reduce((sum, report) => sum + report.appItems, 0);
  if (compared < MIN_COMPARED_ITEMS) {
    console.error(
      `✗ nav-parity gate: compared only ${compared} nav item(s), below the floor of ` +
        `${MIN_COMPARED_ITEMS}. Coverage collapsed — the gate is no longer proving anything.`
    );
    return false;
  }

  const mismatches = reports.flatMap((report) => report.mismatches);
  if (mismatches.length === 0) {
    console.log("OK — every pillar's app navConfig and wire nav descriptor agree.");
    return true;
  }

  console.error(`FAIL — ${mismatches.length} nav parity violation(s):`);
  for (const mismatch of mismatches) console.error(`  XX  ${describe(mismatch)}`);
  return false;
}

const SELF_TEST_APP = `
  export const navConfig = {
    id: 'demo',
    label: 'Demo',
    labelKey: 'demo',
    icon: 'DollarSign',
    color: 'emerald',
    basePath: '/demo',
    items: [
      { path: '', label: 'Dashboard', labelKey: 'demo.dashboard', icon: 'LayoutDashboard' },
      { path: '/things', label: 'Things', labelKey: 'demo.things', icon: 'Building2' },
      { path: '/settings', label: 'Settings', labelKey: 'demo.settings', icon: 'Settings' },
    ],
  } satisfies AppNavConfigShape;
`;

/**
 * @param {string} items
 * @param {Record<string, string>} [header]
 * @returns {string}
 */
function selfTestWire(items, header = {}) {
  const fields = {
    id: 'demo',
    label: 'Demo',
    labelKey: 'demo',
    icon: 'dollar-sign',
    color: 'emerald',
    basePath: '/demo',
    ...header,
  };
  const rendered = Object.entries(fields)
    .map(([key, value]) => `    ${key}: '${value}',`)
    .join('\n');
  return `const DEMO_NAV: NavConfigDescriptor = {\n${rendered}\n    order: 10,\n    items: [\n${items}\n    ],\n  };`;
}

const SELF_TEST_WIRE_ITEMS = [
  `      { path: '', label: 'Dashboard', labelKey: 'demo.dashboard', icon: 'layout-dashboard' },`,
  `      { path: '/things', label: 'Things', labelKey: 'demo.things', icon: 'building-2' },`,
  `      { path: '/settings', label: 'Settings', labelKey: 'demo.settings', icon: 'settings' },`,
];

/**
 * Synthetic fixtures proving the gate reports each way it can be violated,
 * and stays silent on a pillar whose two declarations agree. Every check runs
 * the gate's real exported functions over a constructed input and reads the
 * output — never a regex read back and reasoned about (ADR-045, POPS-2110).
 *
 * @returns {boolean}
 */
function selfTest() {
  /**
   * @param {string} wireSource
   * @returns {Mismatch[]}
   */
  const compare = (wireSource) => {
    const app = parseNavDeclaration(SELF_TEST_APP, APP_ANCHOR);
    const wire = parseNavDeclaration(wireSource, WIRE_ANCHOR);
    if (app === null || wire === null) return [{ kind: 'header', pillar: 'demo', field: 'PARSE' }];
    return compareNav('demo', app, wire);
  };

  const clean = compare(selfTestWire(SELF_TEST_WIRE_ITEMS.join('\n')));
  const missingItem = compare(selfTestWire(SELF_TEST_WIRE_ITEMS.slice(0, 2).join('\n')));
  const extraItem = compare(
    selfTestWire(
      [
        ...SELF_TEST_WIRE_ITEMS,
        `      { path: '/ghost', label: 'Ghost', labelKey: 'demo.ghost', icon: 'star' },`,
      ].join('\n')
    )
  );
  const wrongColor = compare(selfTestWire(SELF_TEST_WIRE_ITEMS.join('\n'), { color: 'violet' }));
  const wrongItemIcon = compare(
    selfTestWire(
      [
        SELF_TEST_WIRE_ITEMS[0] ?? '',
        `      { path: '/things', label: 'Things', labelKey: 'demo.things', icon: 'landmark' },`,
        SELF_TEST_WIRE_ITEMS[2] ?? '',
      ].join('\n')
    )
  );
  const wrongLabel = compare(
    selfTestWire(
      [
        SELF_TEST_WIRE_ITEMS[0] ?? '',
        `      { path: '/things', label: 'Stuff', labelKey: 'demo.things', icon: 'building-2' },`,
        SELF_TEST_WIRE_ITEMS[2] ?? '',
      ].join('\n')
    )
  );

  const files = discoverPillarNavFiles();
  const checks = {
    'two agreeing declarations report nothing': clean.length === 0,
    'a kebab wire icon matches its PascalCase app icon': !clean.some((m) =>
      m.field.endsWith('icon')
    ),
    'flags an item the wire is missing': missingItem.some(
      (m) => m.kind === 'app-only' && m.field === 'settings'
    ),
    'flags an item only the wire has': extraItem.some(
      (m) => m.kind === 'wire-only' && m.field === 'ghost'
    ),
    'flags a header field that disagrees': wrongColor.some(
      (m) => m.kind === 'header' && m.field === 'color' && m.wire === 'violet'
    ),
    'flags an item icon that disagrees': wrongItemIcon.some(
      (m) => m.field === 'things.icon' && m.wire === 'landmark'
    ),
    'flags an item label that disagrees': wrongLabel.some(
      (m) => m.field === 'things.label' && m.wire === 'Stuff'
    ),
    'reports an unreadable declaration rather than passing it':
      parseNavDeclaration('export const somethingElse = {};', APP_ANCHOR) === null,
    'reports a declaration whose items key is gone':
      parseNavDeclaration("export const navConfig = { id: 'x' };", APP_ANCHOR) === null,
    'ignores a nav item path written in a comment':
      parseNavDeclaration(
        `export const navConfig = {\n  // the /ghost tab's old path\n  items: [{ path: '/real', label: 'Real', icon: 'Star' }],\n};`,
        APP_ANCHOR
      )?.items.length === 1,
    'discovers the real pillar tree': files.length >= MIN_PILLARS,
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      `self-test OK — gate flags missing, extra, mis-iconed and mis-labelled nav items and ` +
        `disagreeing header fields, and stays silent on parity (found ${files.length} real pillar(s)).`
    );
  } else {
    console.error('SELF-TEST FAILED — gate did not behave as expected:');
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
      'Usage: node scripts/check-nav-parity.mjs [--self-test]\n' +
        "Asserts every pillar's app `navConfig` and wire `NavConfigDescriptor` declare the\n" +
        'same nav — the shell renders the wire copy, so an item only the app has has no link.'
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
