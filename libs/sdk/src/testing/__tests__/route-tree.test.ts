import { describe, expect, it } from 'vitest';

import { pageTreeMismatches, type RouteTreeNode } from '../route-tree.js';

import type { PageDescriptor } from '../../manifest-schema/index.js';

const Landing = () => null;
const Layout = () => null;
const TabA = () => null;
const TabB = () => null;

const components = { landing: Landing, layout: Layout, 'tab-a': TabA, 'tab-b': TabB };

/** What `<X />` is at runtime, as far as the comparison reads it. */
const el = (type: unknown) => ({ type });

const pages: PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'landing' },
  {
    path: 'data',
    bundleSlot: 'layout',
    children: [
      { path: 'a', bundleSlot: 'tab-a' },
      { path: 'b', bundleSlot: 'tab-b' },
    ],
  },
];

function routes(): RouteTreeNode[] {
  return [
    { index: true, element: el(Landing) },
    {
      path: 'data',
      element: el(Layout),
      children: [
        { path: 'a', element: el(TabA) },
        { path: 'b', element: el(TabB) },
      ],
    },
  ];
}

describe('pageTreeMismatches', () => {
  it('reports nothing when the two trees agree', () => {
    expect(pageTreeMismatches(pages, routes(), components)).toEqual([]);
  });

  it('reports a nested route the wire does not publish', () => {
    const table = routes();
    const data = table[1];
    const mounted = [...(data?.children ?? []), { path: 'c', element: el(TabB) }];
    table[1] = { ...data, children: mounted };
    expect(pageTreeMismatches(pages, table, components)).toEqual([
      '/data: 2 page(s) on the wire, 3 route(s) mounted',
    ]);
  });

  it('reports a slot bound to a different page than the route mounts', () => {
    const table = routes();
    table[1] = {
      ...table[1],
      children: [
        { path: 'a', element: el(TabB) },
        { path: 'b', element: el(TabB) },
      ],
    };
    expect(pageTreeMismatches(pages, table, components)).toEqual([
      "/data/a: slot 'tab-a' does not render the component the route mounts",
    ]);
  });

  it('reports a path spelled differently', () => {
    const table = routes();
    table[1] = { ...table[1], path: 'datum' };
    expect(pageTreeMismatches(pages, table, components)).toEqual([
      "/data: path 'data' on the wire, 'datum' in routes",
    ]);
  });

  it('reports an index route published as a pathed one', () => {
    const table = routes();
    table[0] = { path: '', element: el(Landing) };
    expect(pageTreeMismatches(pages, table, components)).toEqual([
      '/(index): index is true on the wire, false in routes',
    ]);
  });

  it('reports a tab flattened out of its layout', () => {
    const table: RouteTreeNode[] = [
      { index: true, element: el(Landing) },
      { path: 'data', element: el(Layout), children: [{ path: 'a', element: el(TabA) }] },
      { path: 'data/b', element: el(TabB) },
    ];
    expect(pageTreeMismatches(pages, table, components)).toEqual([
      '/: 2 page(s) on the wire, 3 route(s) mounted',
      '/data: 2 page(s) on the wire, 1 route(s) mounted',
    ]);
  });

  it('reports a slot the component map does not carry', () => {
    const partial = { landing: Landing, layout: Layout, 'tab-a': TabA };
    expect(pageTreeMismatches(pages, routes(), partial)).toEqual([
      "/data/b: slot 'tab-b' does not render the component the route mounts",
    ]);
  });
});
