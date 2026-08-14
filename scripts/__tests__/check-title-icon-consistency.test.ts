import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  analyzeApp,
  parseLazyImports,
  parseNavConfigItems,
  parseRouteComponents,
  reportApp,
  resolvePageHeaderIconUsage,
} from '../check-title-icon-consistency.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ROUTES_SOURCE = `
  const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
  const ListPage = lazy(() => import('./pages/ListPage').then((m) => ({ default: m.ListPage })));
  const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
  const InsurancePage = lazy(() => import('./pages/InsurancePage').then((m) => ({ default: m.InsurancePage })));
  const DetailPage = lazy(() => import('./pages/DetailPage').then((m) => ({ default: m.DetailPage })));

  export const navConfig = {
    id: 'demo',
    items: [
      { path: '', label: 'Home', icon: 'LayoutDashboard' },
      { path: '/list', label: 'List', icon: 'ListChecks' },
      {
        path: '/reports',
        label: 'Reports',
        icon: 'BarChart3',
      },
    ],
  };

  export const routes = [
    { index: true, element: <HomePage /> },
    { path: 'list', element: <ListPage /> },
    { path: 'list/:id', element: <DetailPage /> },
    {
      path: 'reports',
      children: [
        { index: true, element: <ReportsPage /> },
        { path: 'insurance', element: <InsurancePage /> },
      ],
    },
  ];
`;

describe('parseNavConfigItems', () => {
  it('extracts path and icon for every item, normalizing the leading slash', () => {
    expect(parseNavConfigItems(ROUTES_SOURCE)).toEqual([
      { path: '', icon: 'LayoutDashboard' },
      { path: 'list', icon: 'ListChecks' },
      { path: 'reports', icon: 'BarChart3' },
    ]);
  });

  it('returns an empty array when there is no navConfig', () => {
    expect(parseNavConfigItems('export const routes = [];')).toEqual([]);
  });
});

describe('parseRouteComponents', () => {
  it('maps the index route to the empty path', () => {
    expect(parseRouteComponents(ROUTES_SOURCE).get('')).toBe('HomePage');
  });

  it('maps a plain top-level route by its own element', () => {
    expect(parseRouteComponents(ROUTES_SOURCE).get('list')).toBe('ListPage');
  });

  it('does NOT let a nested child route leak its index/element up to the parent path', () => {
    // Regression: `reports` has no OWN `element` — only its `children[0]`
    // does. A naive whole-object scan for `index: true` finds the CHILD's
    // `index: true` and wrongly claims `reports` (and even overwrites the
    // real index route) — this must resolve `reports` through the single
    // unambiguous index child instead, and leave the real index route alone.
    const components = parseRouteComponents(ROUTES_SOURCE);
    expect(components.get('')).toBe('HomePage');
    expect(components.get('reports')).toBe('ReportsPage');
  });

  it('does not resolve a nested non-index child as its own path entry', () => {
    expect(parseRouteComponents(ROUTES_SOURCE).has('insurance')).toBe(false);
  });

  it('keeps parsing past an apostrophe inside a // comment', () => {
    // Regression: an apostrophe in prose is not a string delimiter. Treating
    // it as one opens a quote state that never closes and silently drops
    // every route after it — which is how the food app went unchecked.
    const source = `
      const HomePage = lazy(() => import('./pages/HomePage'));
      const TagsPage = lazy(() => import('./pages/TagsPage'));

      export const routes = [
        { index: true, element: <HomePage /> },
        // Read-only vocabulary view; the chip editor lives inside
        // the Ingredients tab's detail panel.
        { path: 'tags', element: <TagsPage /> },
      ];
    `;
    const components = parseRouteComponents(source);
    expect(components.get('')).toBe('HomePage');
    expect(components.get('tags')).toBe('TagsPage');
  });

  it('keeps parsing past an apostrophe inside a block comment', () => {
    const source = `
      export const routes = [
        { index: true, element: <HomePage /> },
        /* the tab's panel */
        { path: 'tags', element: <TagsPage /> },
      ];
    `;
    expect(parseRouteComponents(source).get('tags')).toBe('TagsPage');
  });

  it("resolves every nav item of the real food app's routes.tsx", () => {
    // The gate silently checked nothing here: all nine nav items were skipped
    // as unresolvable. Pinned against the real file, not a fixture, because a
    // fixture cannot notice the tree drifting back into an unparsed shape.
    const source = readFileSync(join(repoRoot, 'pillars/food/app/src/routes.tsx'), 'utf8');
    const navItems = parseNavConfigItems(source);
    const components = parseRouteComponents(source);
    expect(navItems).toHaveLength(9);
    expect(navItems.filter((item) => components.has(item.path))).toHaveLength(9);
  });
});

describe('parseLazyImports', () => {
  it('maps every lazily-imported component to its import path', () => {
    const imports = parseLazyImports(ROUTES_SOURCE);
    expect(imports.get('HomePage')).toBe('./pages/HomePage');
    expect(imports.get('ReportsPage')).toBe('./pages/ReportsPage');
  });
});

describe('resolvePageHeaderIconUsage', () => {
  it('reports no PageHeader when the page renders none', () => {
    expect(resolvePageHeaderIconUsage('<div>no header</div>')).toEqual({
      hasPageHeader: false,
      hasIcon: false,
      iconTag: null,
    });
  });

  it('reports a PageHeader with no icon prop', () => {
    expect(resolvePageHeaderIconUsage('<PageHeader title="X" actions={y} />')).toEqual({
      hasPageHeader: true,
      hasIcon: false,
      iconTag: null,
    });
  });

  it('extracts a directly-passed icon tag', () => {
    const usage = resolvePageHeaderIconUsage(
      '<PageHeader title="X" icon={<MapPin className="h-6 w-6" />} />'
    );
    expect(usage).toEqual({ hasPageHeader: true, hasIcon: true, iconTag: 'MapPin' });
  });

  it('extracts an icon tag nested inside a wrapper element', () => {
    const usage = resolvePageHeaderIconUsage(
      '<PageHeader title="X" icon={<div className="p-2 rounded-xl"><FileText className="h-4 w-4" /></div>} />'
    );
    expect(usage.iconTag).toBe('FileText');
  });

  it("does not attribute a sibling component's icon prop to PageHeader", () => {
    // `icon` is a convention on other components too (EmptyState). Reading
    // one as PageHeader's turns an icon-free page into a fabricated
    // all-or-none violation for the whole app.
    const usage = resolvePageHeaderIconUsage(
      '<PageHeader title={t("reports")} />\n<EmptyState icon={<FileText className="h-8 w-8" />} title="none" />'
    );
    expect(usage).toEqual({ hasPageHeader: true, hasIcon: false, iconTag: null });
  });

  it("does not attribute a child's icon prop to PageHeader", () => {
    const usage = resolvePageHeaderIconUsage(
      '<PageHeader title="X">\n  <EmptyState icon={<FileText />} />\n</PageHeader>'
    );
    expect(usage.hasIcon).toBe(false);
  });

  it('still finds an icon that follows an arrow-function prop on the same tag', () => {
    const usage = resolvePageHeaderIconUsage(
      '<PageHeader title="X" onBack={() => navigate(-1)} icon={<MapPin className="h-6 w-6" />} />'
    );
    expect(usage).toEqual({ hasPageHeader: true, hasIcon: true, iconTag: 'MapPin' });
  });

  it('finds an icon on a multi-line PageHeader that renders children', () => {
    const usage = resolvePageHeaderIconUsage(
      [
        '<PageHeader',
        '  title="X"',
        '  icon={<MapPin className="h-6 w-6" />}',
        '>',
        '  <EmptyState icon={<FileText />} />',
        '</PageHeader>',
      ].join('\n')
    );
    expect(usage).toEqual({ hasPageHeader: true, hasIcon: true, iconTag: 'MapPin' });
  });

  it('skips a PageHeader whose opening tag never closes rather than judging it', () => {
    expect(resolvePageHeaderIconUsage('<PageHeader title="X" icon={<MapPin />}')).toEqual({
      hasPageHeader: false,
      hasIcon: false,
      iconTag: null,
    });
  });
});

describe('analyzeApp', () => {
  type PageSources = Record<string, string | undefined>;

  const pages: PageSources = {
    './pages/HomePage':
      '<PageHeader title="Home" icon={<LayoutDashboard className="h-6 w-6" />} />',
    './pages/ListPage': '<PageHeader title="List" icon={<ListChecks className="h-6 w-6" />} />',
    './pages/ReportsPage':
      '<PageHeader title="Reports" icon={<BarChart3 className="h-6 w-6" />} />',
  };

  it('reports nothing when every resolvable top-level page is consistent and matches nav', () => {
    expect(analyzeApp('demo', ROUTES_SOURCE, (p) => pages[p])).toEqual([]);
  });

  it('flags a mix of icon and no-icon pages within the same app', () => {
    const mixed: PageSources = {
      ...pages,
      './pages/ReportsPage': '<PageHeader title="Reports" />',
    };
    const violations = analyzeApp('demo', ROUTES_SOURCE, (p) => mixed[p]);
    expect(violations).toContainEqual({
      kind: 'inconsistent',
      app: 'demo',
      withIcon: ['(index)', 'list'],
      withoutIcon: ['reports'],
    });
  });

  it('flags an icon that does not match its nav entry', () => {
    const wrong: PageSources = {
      ...pages,
      './pages/ListPage': '<PageHeader title="List" icon={<Database className="h-6 w-6" />} />',
    };
    const violations = analyzeApp('demo', ROUTES_SOURCE, (p) => wrong[p]);
    expect(violations).toContainEqual({
      kind: 'mismatch',
      app: 'demo',
      path: 'list',
      navIcon: 'ListChecks',
      pageIcon: 'Database',
    });
  });

  it('skips a page the reader cannot resolve rather than flagging it', () => {
    const missing: PageSources = { ...pages, './pages/ListPage': undefined };
    const violations = analyzeApp('demo', ROUTES_SOURCE, (p) => missing[p]);
    expect(violations).toEqual([]);
  });

  it('skips a page with no PageHeader at all', () => {
    const noHeader: PageSources = { ...pages, './pages/ReportsPage': '<div>custom layout</div>' };
    expect(analyzeApp('demo', ROUTES_SOURCE, (p) => noHeader[p])).toEqual([]);
  });

  it('returns nothing when no nav item resolves to a page at all', () => {
    expect(analyzeApp('demo', ROUTES_SOURCE, () => undefined)).toEqual([]);
  });
});

describe('reportApp', () => {
  const pages: Record<string, string | undefined> = {
    './pages/HomePage':
      '<PageHeader title="Home" icon={<LayoutDashboard className="h-6 w-6" />} />',
    './pages/ListPage': '<PageHeader title="List" icon={<ListChecks className="h-6 w-6" />} />',
    './pages/ReportsPage': '<div>custom layout</div>',
  };

  it('reports how much it saw, separating resolution from PageHeader usage', () => {
    const report = reportApp('demo', ROUTES_SOURCE, (p) => pages[p]);
    expect(report).toMatchObject({
      app: 'demo',
      navItems: 3,
      resolved: 3,
      withPageHeader: 2,
      withIcon: 2,
      violations: [],
    });
  });

  it('reports zero coverage when nothing resolves, instead of looking clean', () => {
    const report = reportApp('demo', ROUTES_SOURCE, () => undefined);
    expect(report).toMatchObject({ navItems: 3, resolved: 0, withPageHeader: 0, withIcon: 0 });
  });
});
