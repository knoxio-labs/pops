#!/usr/bin/env node
/**
 * Title-icon consistency gate.
 *
 * Convention (AGENTS.md Design Context, "Domain identity"): within one app,
 * top-level pages either ALL pass an `icon` to `PageHeader`, or NONE do — a
 * mix reads as an accident of who wrote which page, not a decision. When an
 * icon is present, it should be the same icon the app's own nav rail already
 * uses for that page, so the header doesn't introduce a second, disagreeing
 * icon for the same destination. Nothing enforced either half; this does.
 *
 * "Top-level pages" are exactly the entries in an app's `navConfig.items` —
 * the nav rail already names them, so this reuses that list instead of
 * guessing from file layout (a page can sit flat under `pages/` without being
 * a nav destination, e.g. a drill-down form).
 *
 * HOW IT RESOLVES A NAV ITEM TO A PAGE FILE: `routes.tsx` in every pillar app
 * exports both `navConfig` and a react-router `routes: RouteObject[]` from
 * the same file. For each nav item's `path`, the gate finds the matching
 * top-level `routes` entry (by `path`, or `index: true` for the empty path),
 * reads the JSX component tag its `element` renders, and resolves that tag
 * back to a file through the file's own `const X = lazy(() => import('./Y'))`
 * declarations. This is a text scan, not a bundler resolution — it trusts the
 * codebase's own lazy-import convention rather than a module graph.
 *
 * A nav item the gate cannot resolve to a page (route missing, non-lazy
 * import, no matching component declaration) is SKIPPED, not flagged —
 * ambiguity here should never manufacture a false violation. A page with no
 * `<PageHeader` call at all is likewise skipped: nothing says it must render
 * one (a print view, a custom layout), and the all-or-none rule is about
 * PageHeader icon usage specifically, not page structure.
 *
 * Usage:
 *   node scripts/check-title-icon-consistency.mjs              check the real tree
 *   node scripts/check-title-icon-consistency.mjs --self-test   prove the gate reports
 *
 * Exit 0 = every app is consistent. Exit 1 = a violation or a failed
 * self-test. Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * Extract the balanced-bracket span starting at the first `open` character
 * found at or after `fromIndex`, honouring `'`/`"`/`` ` `` string literals so
 * a bracket inside a string never miscounts depth. Returns the substring
 * INCLUDING both delimiters, or undefined if `open` never appears or never
 * balances.
 *
 * @param {string} text
 * @param {number} fromIndex
 * @param {string} open
 * @param {string} close
 * @returns {string | undefined}
 */
function balancedSpan(text, fromIndex, open, close) {
  const start = text.indexOf(open, fromIndex);
  if (start === -1) return undefined;
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

/**
 * Split a balanced `[ ... ]` array's TOP-LEVEL `{ ... }` object entries —
 * nested objects (e.g. a route's `children`) are not split out separately.
 * @param {string} arraySpan Including the outer `[` `]`.
 * @returns {string[]}
 */
function topLevelObjects(arraySpan) {
  /** @type {string[]} */
  const objects = [];
  let i = 0;
  while (i < arraySpan.length) {
    if (arraySpan[i] === '{') {
      const span = balancedSpan(arraySpan, i, '{', '}');
      if (span === undefined) break;
      objects.push(span);
      i += span.length;
      continue;
    }
    i++;
  }
  return objects;
}

/**
 * Split a balanced `{ ... }` object's OWN top-level `key: value` entries —
 * a route object's `children: [ { index: true, ... }, ... ]` never leaks its
 * `index`/`path`/`element` keys up into the parent's map, because those keys
 * live inside a nested array this never descends into.
 * @param {string} objectSpan Including the outer `{` `}`.
 * @returns {Map<string, string>}
 */
function topLevelProperties(objectSpan) {
  const inner = objectSpan.slice(1, -1);
  /** @type {Map<string, string>} */
  const props = new Map();
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  let entryStart = 0;
  const flush = (end) => {
    const entry = inner.slice(entryStart, end);
    const keyMatch = /^\s*(\w+)\s*:\s*/.exec(entry);
    if (keyMatch !== null) props.set(keyMatch[1], entry.slice(keyMatch[0].length).trim());
  };
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      flush(i);
      entryStart = i + 1;
    }
  }
  flush(inner.length);
  return props;
}

/**
 * @typedef {object} NavItem
 * @property {string} path   Normalized: no leading slash, '' for the index route.
 * @property {string} icon
 */

/**
 * Parse `navConfig.items` out of a `routes.tsx` source.
 * @param {string} source
 * @returns {NavItem[]}
 */
export function parseNavConfigItems(source) {
  const navStart = source.indexOf('navConfig');
  if (navStart === -1) return [];
  const navSpan = balancedSpan(source, navStart, '{', '}');
  if (navSpan === undefined) return [];
  const itemsKey = navSpan.indexOf('items');
  if (itemsKey === -1) return [];
  const itemsSpan = balancedSpan(navSpan, itemsKey, '[', ']');
  if (itemsSpan === undefined) return [];

  /** @type {NavItem[]} */
  const items = [];
  for (const obj of topLevelObjects(itemsSpan)) {
    const pathMatch = /path:\s*['"]([^'"]*)['"]/.exec(obj);
    const iconMatch = /icon:\s*['"]([^'"]*)['"]/.exec(obj);
    if (pathMatch === null || iconMatch === null) continue;
    items.push({ path: pathMatch[1].replace(/^\//, ''), icon: iconMatch[1] });
  }
  return items;
}

/**
 * Parse the top-level `routes: RouteObject[]` entries into a normalized
 * path -> JSX element tag name map.
 * @param {string} source
 * @returns {Map<string, string>}
 */
export function parseRouteComponents(source) {
  const routesKey = /export const routes[^=]*=/.exec(source);
  /** @type {Map<string, string>} */
  const map = new Map();
  if (routesKey === null) return map;
  const arraySpan = balancedSpan(source, routesKey.index + routesKey[0].length, '[', ']');
  if (arraySpan === undefined) return map;

  for (const obj of topLevelObjects(arraySpan)) {
    const props = topLevelProperties(obj);
    const isIndex = props.get('index') === 'true';
    const pathValue = /^['"]([^'"]*)['"]/.exec(props.get('path') ?? '')?.[1];
    const path = isIndex ? '' : pathValue;
    if (path === undefined) continue;

    let elementMatch = /^<([A-Z]\w*)/.exec(props.get('element') ?? '');
    // A route with `children` and no OWN `element` — e.g. `reports` nesting
    // `{ index: true, element: <ReportDashboardPage /> }` so a future sibling
    // like `reports/insurance` has somewhere to attach — resolves through
    // that nested index child instead. Anything less specific than that
    // single unambiguous case is left unresolved rather than guessed at.
    if (elementMatch === null && props.has('children')) {
      const childrenSpan = balancedSpan(props.get('children') ?? '', 0, '[', ']');
      const childObjs = childrenSpan === undefined ? [] : topLevelObjects(childrenSpan);
      const indexChildren = childObjs
        .map((c) => topLevelProperties(c))
        .filter((c) => c.get('index') === 'true');
      if (indexChildren.length === 1) {
        elementMatch = /^<([A-Z]\w*)/.exec(indexChildren[0].get('element') ?? '');
      }
    }
    if (elementMatch === null) continue;
    // The path is used exactly as written — it already matches a normalized
    // navConfig item path 1:1 (both strip the leading slash), and reducing
    // it to a prefix would collide two genuinely different sibling routes
    // that merely share one (e.g. `list` and `list/:id`).
    map.set(path, elementMatch[1]);
  }
  return map;
}

/**
 * Parse `const X = lazy(() => import('./path')...)` declarations into a
 * component-name -> import-path map.
 * @param {string} source
 * @returns {Map<string, string>}
 */
export function parseLazyImports(source) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const re = /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*[\s\S]*?import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(re)) map.set(match[1], match[2]);
  return map;
}

/**
 * @typedef {object} PageHeaderUsage
 * @property {boolean} hasPageHeader
 * @property {boolean} hasIcon
 * @property {string | null} iconTag
 */

/** How many characters after `<PageHeader` we search for its `icon` prop. */
const PAGE_HEADER_WINDOW = 600;

/**
 * Does this page's (first) `<PageHeader` call pass an `icon`, and if so what
 * JSX tag does the icon expression render?
 * @param {string} source
 * @returns {PageHeaderUsage}
 */
export function resolvePageHeaderIconUsage(source) {
  const match = /<PageHeader\b/.exec(source);
  if (match === null) return { hasPageHeader: false, hasIcon: false, iconTag: null };
  const window = source.slice(match.index, match.index + PAGE_HEADER_WINDOW);
  const iconMatch = /icon=\{/.exec(window);
  if (iconMatch === null) return { hasPageHeader: true, hasIcon: false, iconTag: null };
  const rest = window.slice(iconMatch.index);
  // The icon expression's first capitalized JSX tag — a lowercase wrapper
  // (`<div>`) never matches, so this lands on the actual icon component even
  // when it is nested inside one.
  const tagMatch = /<([A-Z]\w*)/.exec(rest);
  return { hasPageHeader: true, hasIcon: true, iconTag: tagMatch?.[1] ?? null };
}

/**
 * @typedef {object} Violation
 * @property {'inconsistent' | 'mismatch'} kind
 * @property {string} app
 * @property {string} [path]
 * @property {string} [navIcon]
 * @property {string} [pageIcon]
 * @property {string[]} [withIcon]
 * @property {string[]} [withoutIcon]
 */

/**
 * Analyze one app's `routes.tsx` source against a page-file reader.
 * @param {string} appId
 * @param {string} routesSource
 * @param {(path: string) => string | undefined} readPage Given the page's
 *   import path (as written in the lazy import, e.g. `./pages/X`), returns
 *   that file's source, or undefined if it cannot be read.
 * @returns {Violation[]}
 */
export function analyzeApp(appId, routesSource, readPage) {
  const navItems = parseNavConfigItems(routesSource);
  const routeComponents = parseRouteComponents(routesSource);
  const lazyImports = parseLazyImports(routesSource);

  /** @type {Array<{ path: string; icon: string; usage: PageHeaderUsage }>} */
  const resolved = [];
  for (const item of navItems) {
    const component = routeComponents.get(item.path);
    if (component === undefined) continue;
    const importPath = lazyImports.get(component);
    if (importPath === undefined) continue;
    const pageSource = readPage(importPath);
    if (pageSource === undefined) continue;
    const usage = resolvePageHeaderIconUsage(pageSource);
    if (!usage.hasPageHeader) continue;
    resolved.push({ path: item.path, icon: item.icon, usage });
  }

  if (resolved.length === 0) return [];

  /** @type {Violation[]} */
  const violations = [];
  const withIcon = resolved.filter((r) => r.usage.hasIcon);
  const withoutIcon = resolved.filter((r) => !r.usage.hasIcon);

  if (withIcon.length > 0 && withoutIcon.length > 0) {
    violations.push({
      kind: 'inconsistent',
      app: appId,
      withIcon: withIcon.map((r) => r.path || '(index)'),
      withoutIcon: withoutIcon.map((r) => r.path || '(index)'),
    });
  }

  for (const r of withIcon) {
    if (r.usage.iconTag !== null && r.usage.iconTag !== r.icon) {
      violations.push({
        kind: 'mismatch',
        app: appId,
        path: r.path || '(index)',
        navIcon: r.icon,
        pageIcon: r.usage.iconTag,
      });
    }
  }

  return violations;
}

/**
 * @param {string} appId
 * @param {string} routesFile Absolute path to the app's `routes.tsx`.
 * @returns {Violation[]}
 */
function analyzeAppFile(appId, routesFile) {
  const routesSource = readFileSync(routesFile, 'utf8');
  const appSrcDir = dirname(routesFile);
  return analyzeApp(appId, routesSource, (importPath) => {
    for (const ext of ['.tsx', '.ts']) {
      const candidate = join(appSrcDir, `${importPath}${ext}`);
      if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
    }
    return undefined;
  });
}

/** Every `pillars/<id>/app/src/routes.tsx` that exists on disk. */
function discoverRoutesFiles() {
  /** @type {Array<{ appId: string; file: string }>} */
  const found = [];
  const pillarsDir = join(repoRoot, 'pillars');
  for (const entry of readdirSync(pillarsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const routesFile = join(pillarsDir, entry.name, 'app', 'src', 'routes.tsx');
    if (existsSync(routesFile) && statSync(routesFile).isFile()) {
      found.push({ appId: entry.name, file: routesFile });
    }
  }
  return found.toSorted((a, b) => a.appId.localeCompare(b.appId));
}

/** A floor on discovery — this repo has several nav-bearing pillar apps. */
const MIN_APPS = 5;

function run() {
  const routesFiles = discoverRoutesFiles();
  if (routesFiles.length < MIN_APPS) {
    console.error(
      `✗ title-icon gate: found only ${routesFiles.length} app routes.tsx file(s), below the ` +
        `floor of ${MIN_APPS}. Discovery is broken — this is not a clean tree.`
    );
    return false;
  }

  /** @type {Violation[]} */
  const violations = [];
  for (const { appId, file } of routesFiles) violations.push(...analyzeAppFile(appId, file));

  console.log(`Checked ${routesFiles.length} pillar app(s) for title-icon consistency.`);
  if (violations.length === 0) {
    console.log('OK — every app is all-or-none on PageHeader icons, and every icon matches nav.');
    return true;
  }

  console.error(`FAIL — ${violations.length} title-icon violation(s):`);
  for (const v of violations) {
    if (v.kind === 'inconsistent') {
      console.error(
        `  XX  ${v.app}: mixes icon usage — with icon: [${v.withIcon?.join(', ')}], ` +
          `without: [${v.withoutIcon?.join(', ')}]`
      );
    } else {
      console.error(
        `  XX  ${v.app} ${v.path}: PageHeader icon <${v.pageIcon}> does not match nav icon ` +
          `'${v.navIcon}'`
      );
    }
  }
  return false;
}

/**
 * Synthetic fixtures proving the gate flags a mixed app, flags a mismatched
 * icon, and stays silent on a consistent, matching app or an unresolvable
 * item.
 * @returns {boolean}
 */
function selfTest() {
  const routesSource = `
    const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
    const ListPage = lazy(() => import('./pages/ListPage').then((m) => ({ default: m.ListPage })));
    const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
    const UnresolvedPage = lazy(() => import('./pages/UnresolvedPage').then((m) => ({ default: m.UnresolvedPage })));

    export const navConfig = {
      id: 'x',
      items: [
        { path: '', label: 'Home', icon: 'LayoutDashboard' },
        { path: '/list', label: 'List', icon: 'ListChecks' },
        { path: '/settings', label: 'Settings', icon: 'Settings' },
        { path: '/gone', label: 'Gone', icon: 'Trash' },
      ],
    };

    export const routes = [
      { index: true, element: <HomePage /> },
      { path: 'list', element: <ListPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ];
  `;

  const pages = {
    './pages/HomePage':
      '<PageHeader title="Home" icon={<LayoutDashboard className="h-6 w-6" />} />',
    './pages/ListPage': '<PageHeader title="List" icon={<ListChecks className="h-6 w-6" />} />',
    './pages/SettingsPage': '<PageHeader title="Settings" />',
  };
  const consistentMismatch = analyzeApp('x', routesSource, (p) => pages[p]);

  const allWithIcon = {
    ...pages,
    './pages/SettingsPage':
      '<PageHeader title="Settings" icon={<Settings className="h-6 w-6" />} />',
  };
  const clean = analyzeApp('x', routesSource, (p) => allWithIcon[p]);

  const mismatchedIcon = {
    ...allWithIcon,
    './pages/ListPage': '<PageHeader title="List" icon={<Database className="h-6 w-6" />} />',
  };
  const withMismatch = analyzeApp('x', routesSource, (p) => mismatchedIcon[p]);

  const noPageHeaderAnywhere = analyzeApp('x', routesSource, () => '<div>no header here</div>');

  const checks = {
    'flags a mixed app (some icons, some none)': consistentMismatch.some(
      (v) => v.kind === 'inconsistent' && v.app === 'x'
    ),
    'the inconsistent violation names both buckets': consistentMismatch.some(
      (v) =>
        v.kind === 'inconsistent' &&
        v.withIcon?.includes('list') &&
        v.withoutIcon?.includes('settings')
    ),
    'a fully-consistent, matching app reports nothing': clean.length === 0,
    'flags an icon that disagrees with the nav icon': withMismatch.some(
      (v) => v.kind === 'mismatch' && v.path === 'list' && v.pageIcon === 'Database'
    ),
    'a nav item with no matching route is skipped, not flagged': !consistentMismatch.some(
      (v) => 'path' in v && v.path === 'gone'
    ),
    'a page with no PageHeader at all reports nothing': noPageHeaderAnywhere.length === 0,
    'parses nav items with normalized (no leading slash) paths': parseNavConfigItems(
      routesSource
    ).some((i) => i.path === 'list'),
    'parses route components keyed by normalized path':
      parseRouteComponents(routesSource).get('list') === 'ListPage',
    'parses the index route as the empty path':
      parseRouteComponents(routesSource).get('') === 'HomePage',
    'parses lazy import paths':
      parseLazyImports(routesSource).get('HomePage') === './pages/HomePage',
    'resolves an icon tag nested inside a wrapper element':
      resolvePageHeaderIconUsage(
        '<PageHeader icon={<div className="p-2"><FileText className="h-4 w-4" /></div>} />'
      ).iconTag === 'FileText',
    'reports no icon when PageHeader carries none': !resolvePageHeaderIconUsage(
      '<PageHeader title="X" />'
    ).hasIcon,
  };

  const routesFiles = discoverRoutesFiles();
  if (routesFiles.length === 0) {
    console.error('✗ self-test: discoverRoutesFiles() found no pillar app routes.tsx files.');
    return false;
  }

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      `self-test OK — gate flags mixed icon usage and mismatched icons, and stays silent on a ` +
        `consistent app and unresolvable items (found ${routesFiles.length} real app(s)).`
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
      'Usage: node scripts/check-title-icon-consistency.mjs [--self-test]\n' +
        'Asserts that within one pillar app, top-level (navConfig) pages either all pass an\n' +
        'icon to PageHeader or none do, and that a present icon matches the nav icon.'
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
