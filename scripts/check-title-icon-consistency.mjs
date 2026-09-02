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
 * Every run prints the per-app coverage it achieved, and fails if that
 * coverage collapses — an app that declares nav items but resolves none of
 * them, or a tree-wide total below the floor, means the gate is inspecting
 * nothing and must say so rather than print OK (ADR-045).
 *
 * Exit 0 = every app is consistent. Exit 1 = a violation, collapsed coverage
 * or a failed self-test. Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * Walk `text` from `fromIndex`, yielding only the characters that are real
 * code: everything inside a `'`/`"`/`` ` `` string literal, a `//` line
 * comment or a `/* *\/` block comment is consumed and skipped. Comments have
 * to be skipped BEFORE quotes are honoured, or a lone apostrophe in prose
 * (`the Ingredients tab's detail panel`) opens a string state that never
 * closes and desynchronises every caller downstream of it.
 *
 * @param {string} text
 * @param {number} [fromIndex]
 * @returns {Generator<{ index: number; ch: string }>}
 */
function* scanCode(text, fromIndex = 0) {
  /** @type {string | null} */
  let quote = null;
  /** @type {'line' | 'block' | null} */
  let comment = null;
  for (let i = fromIndex; i < text.length; i++) {
    const ch = text[i];
    if (comment === 'line') {
      if (ch === '\n') comment = null;
      continue;
    }
    if (comment === 'block') {
      if (ch === '*' && text[i + 1] === '/') {
        i++;
        comment = null;
      }
      continue;
    }
    if (quote !== null) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      comment = 'line';
      i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      comment = 'block';
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    yield { index: i, ch };
  }
}

/**
 * Extract the balanced-bracket span starting at the first `open` character
 * found at or after `fromIndex` that is neither in a string nor in a comment.
 * Returns the substring INCLUDING both delimiters, or undefined if `open`
 * never appears or never balances.
 *
 * @param {string} text
 * @param {number} fromIndex
 * @param {string} open
 * @param {string} close
 * @returns {string | undefined}
 */
function balancedSpan(text, fromIndex, open, close) {
  let start = -1;
  let depth = 0;
  for (const { index, ch } of scanCode(text, fromIndex)) {
    if (start === -1) {
      if (ch !== open) continue;
      start = index;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
}

/**
 * The source of a JSX element's OWN opening tag, from `<Tag` at `tagIndex`
 * through the `>` that closes it — the `>` characters inside a prop
 * expression (`icon={<X />}`, `onBack={() => go(-1)}`) sit at brace depth > 0
 * and never terminate it. Returns undefined if the tag never closes.
 *
 * @param {string} source
 * @param {number} tagIndex Index of the tag's `<`.
 * @returns {string | undefined}
 */
function jsxOpeningTag(source, tagIndex) {
  let braceDepth = 0;
  for (const { index, ch } of scanCode(source, tagIndex)) {
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    else if (ch === '>' && braceDepth === 0) return source.slice(tagIndex, index + 1);
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
  let entryStart = 0;
  const flush = (end) => {
    const entry = inner
      .slice(entryStart, end)
      .replace(/^(?:\s*(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/))*/, '');
    const keyMatch = /^\s*(\w+)\s*:\s*/.exec(entry);
    if (keyMatch !== null) props.set(keyMatch[1], entry.slice(keyMatch[0].length).trim());
  };
  for (const { index, ch } of scanCode(inner)) {
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      flush(index);
      entryStart = index + 1;
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

/**
 * Does this page's (first) `<PageHeader` call pass an `icon`, and if so what
 * JSX tag does the icon expression render?
 *
 * The search is bounded by PageHeader's OWN opening tag, never by a character
 * window: `icon` is a conventional prop on other components too (`EmptyState
 * icon={...}` is used all over this repo), and a neighbouring element's icon
 * attributed to PageHeader would fabricate an all-or-none violation on a page
 * that passes no icon at all. A PageHeader whose opening tag does not close
 * is reported as absent, so the page is skipped rather than judged.
 *
 * @param {string} source
 * @returns {PageHeaderUsage}
 */
export function resolvePageHeaderIconUsage(source) {
  const match = /<PageHeader\b/.exec(source);
  if (match === null) return { hasPageHeader: false, hasIcon: false, iconTag: null };
  const openingTag = jsxOpeningTag(source, match.index);
  if (openingTag === undefined) return { hasPageHeader: false, hasIcon: false, iconTag: null };
  const iconMatch = /\bicon=\{/.exec(openingTag);
  if (iconMatch === null) return { hasPageHeader: true, hasIcon: false, iconTag: null };
  const rest = openingTag.slice(iconMatch.index);
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
 * @typedef {object} AppReport
 * @property {string} app
 * @property {number} navItems      Entries in the app's `navConfig.items`.
 * @property {number} resolved      Of those, the ones resolved to a page file.
 * @property {number} withPageHeader Of the resolved, the ones rendering a PageHeader.
 * @property {number} withIcon      Of those, the ones passing an icon.
 * @property {Violation[]} violations
 */

/**
 * Analyze one app's route table against a page-file reader, reporting both
 * the violations and how much the gate actually saw — a gate that silently
 * resolves nothing must be able to say so (ADR-045).
 * @param {string} appId
 * @param {string} routesSource
 * @param {(path: string) => string | undefined} readPage Given the page's
 *   import path (as written in the lazy import, e.g. `./pages/X`), returns
 *   that file's source, or undefined if it cannot be read.
 * @param {string} [navSource] The app's `nav.ts`, where `navConfig` lives.
 *   Defaults to the routes source, which is where it lived before the design
 *   playground needed to read a nav without pulling the page table in with
 *   it — an app that still declares both in one file parses unchanged.
 * @returns {AppReport}
 */
export function reportApp(appId, routesSource, readPage, navSource = routesSource) {
  const navItems = parseNavConfigItems(navSource);
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
    resolved.push({
      path: item.path,
      icon: item.icon,
      usage: resolvePageHeaderIconUsage(pageSource),
    });
  }

  const withPageHeader = resolved.filter((r) => r.usage.hasPageHeader);
  const withIcon = withPageHeader.filter((r) => r.usage.hasIcon);
  const withoutIcon = withPageHeader.filter((r) => !r.usage.hasIcon);
  const counts = {
    app: appId,
    navItems: navItems.length,
    resolved: resolved.length,
    withPageHeader: withPageHeader.length,
    withIcon: withIcon.length,
  };
  if (withPageHeader.length === 0) return { ...counts, violations: [] };

  /** @type {Violation[]} */
  const violations = [];

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

  return { ...counts, violations };
}

/**
 * The violations half of {@link reportApp}.
 * @param {string} appId
 * @param {string} routesSource
 * @param {(path: string) => string | undefined} readPage
 * @param {string} [navSource]
 * @returns {Violation[]}
 */
export function analyzeApp(appId, routesSource, readPage, navSource = routesSource) {
  return reportApp(appId, routesSource, readPage, navSource).violations;
}

/**
 * @param {string} appId
 * @param {string} routesFile Absolute path to the app's `routes.tsx`.
 * @returns {AppReport}
 */
function reportAppFile(appId, routesFile) {
  const routesSource = readFileSync(routesFile, 'utf8');
  const appSrcDir = dirname(routesFile);
  const navFile = join(appSrcDir, 'nav.ts');
  const navSource = existsSync(navFile) ? readFileSync(navFile, 'utf8') : routesSource;
  return reportApp(
    appId,
    routesSource,
    (importPath) => {
      for (const ext of ['.tsx', '.ts']) {
        const candidate = join(appSrcDir, `${importPath}${ext}`);
        if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
      }
      return undefined;
    },
    navSource
  );
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

/**
 * A floor on what the gate actually READ. Counting `routes.tsx` files proves
 * nothing: a parser that resolves none of their nav items still finds every
 * file and still prints OK. The real tree resolves 46 nav items; 40 leaves
 * room for a page to stop being a nav destination while still failing loudly
 * if a whole app's worth of items goes dark.
 */
const MIN_RESOLVED_NAV_ITEMS = 40;

/**
 * Render the per-app coverage the gate saw, so "OK" is always accompanied by
 * evidence of how much was actually inspected.
 * @param {AppReport[]} reports
 */
function printCoverage(reports) {
  for (const r of reports) {
    console.log(
      `  ${r.app.padEnd(12)} nav ${r.navItems}, resolved ${r.resolved}, ` +
        `with PageHeader ${r.withPageHeader}, with icon ${r.withIcon}`
    );
  }
}

function run() {
  const routesFiles = discoverRoutesFiles();
  if (routesFiles.length < MIN_APPS) {
    console.error(
      `✗ title-icon gate: found only ${routesFiles.length} app routes.tsx file(s), below the ` +
        `floor of ${MIN_APPS}. Discovery is broken — this is not a clean tree.`
    );
    return false;
  }

  const reports = routesFiles.map(({ appId, file }) => reportAppFile(appId, file));
  const violations = reports.flatMap((r) => r.violations);

  console.log(`Checked ${routesFiles.length} pillar app(s) for title-icon consistency.`);
  printCoverage(reports);

  const totalResolved = reports.reduce((sum, r) => sum + r.resolved, 0);
  const dark = reports.filter((r) => r.navItems > 0 && r.resolved === 0);
  if (dark.length > 0) {
    console.error(
      `✗ title-icon gate: ${dark.map((r) => r.app).join(', ')} declare nav items but resolved ` +
        `none of them to a page. The gate is checking nothing there — fix resolution, not this floor.`
    );
    return false;
  }
  if (totalResolved < MIN_RESOLVED_NAV_ITEMS) {
    console.error(
      `✗ title-icon gate: resolved only ${totalResolved} nav item(s), below the floor of ` +
        `${MIN_RESOLVED_NAV_ITEMS}. Coverage collapsed — the gate is no longer proving anything.`
    );
    return false;
  }

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
    "does not read a neighbouring component's icon as PageHeader's": !resolvePageHeaderIconUsage(
      '<PageHeader title="X" />\n<EmptyState icon={<FileText className="h-8 w-8" />} />'
    ).hasIcon,
    'parses routes whose comments contain an apostrophe':
      parseRouteComponents(
        `export const routes = [\n  // the Ingredients tab's detail panel.\n  { index: true, element: <HomePage /> },\n];`
      ).get('') === 'HomePage',
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
