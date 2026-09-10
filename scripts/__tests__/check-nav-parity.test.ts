import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  compareNav,
  discoverPillarNavFiles,
  parseNavDeclaration,
  pascalCaseIcon,
} from '../check-nav-parity.mjs';

const APP_ANCHOR = /export const navConfig\s*=/;
const WIRE_ANCHOR = /:\s*NavConfigDescriptor\s*=/;

const APP_SOURCE = `
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

function wireSource(items: string[], header: Record<string, string> = {}): string {
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
    .map(([key, value]) => `  ${key}: '${value}',`)
    .join('\n');
  return `const DEMO_NAV: NavConfigDescriptor = {\n${rendered}\n  order: 10,\n  items: [\n${items.join('\n')}\n  ],\n};`;
}

const WIRE_ITEMS = [
  `    { path: '', label: 'Dashboard', labelKey: 'demo.dashboard', icon: 'layout-dashboard' },`,
  `    { path: '/things', label: 'Things', labelKey: 'demo.things', icon: 'building-2' },`,
  `    { path: '/settings', label: 'Settings', labelKey: 'demo.settings', icon: 'settings' },`,
];

function compare(items: string[], header: Record<string, string> = {}) {
  const app = parseNavDeclaration(APP_SOURCE, APP_ANCHOR);
  const wire = parseNavDeclaration(wireSource(items, header), WIRE_ANCHOR);
  expect(app).not.toBeNull();
  expect(wire).not.toBeNull();
  if (app === null || wire === null) throw new Error('unreachable');
  return compareNav('demo', app, wire);
}

describe('pascalCaseIcon', () => {
  it('converts a kebab wire icon to the PascalCase the app declares', () => {
    expect(pascalCaseIcon('layout-dashboard')).toBe('LayoutDashboard');
  });

  it('keeps a trailing digit attached to its word, as lucide names them', () => {
    expect(pascalCaseIcon('building-2')).toBe('Building2');
  });

  it('capitalizes a single-word icon', () => {
    expect(pascalCaseIcon('landmark')).toBe('Landmark');
  });
});

describe('parseNavDeclaration', () => {
  it('parses the app declaration header and items', () => {
    const parsed = parseNavDeclaration(APP_SOURCE, APP_ANCHOR);
    expect(parsed?.header).toMatchObject({ id: 'demo', color: 'emerald', icon: 'DollarSign' });
    expect(parsed?.items.map((item) => item.path)).toEqual(['', 'things', 'settings']);
  });

  it('parses the wire declaration through its type annotation, whatever the const is called', () => {
    const parsed = parseNavDeclaration(wireSource(WIRE_ITEMS), WIRE_ANCHOR);
    expect(parsed?.items).toHaveLength(3);
    expect(parsed?.header['icon']).toBe('dollar-sign');
  });

  it('returns null when the anchor is absent, rather than an empty declaration', () => {
    expect(parseNavDeclaration('export const other = { items: [] };', APP_ANCHOR)).toBeNull();
  });

  it('returns null when the declaration carries no items key', () => {
    expect(parseNavDeclaration("export const navConfig = { id: 'x' };", APP_ANCHOR)).toBeNull();
  });

  it('does not read a path out of a comment', () => {
    const parsed = parseNavDeclaration(
      `export const navConfig = {\n  // the /ghost tab's old path: '/ghost'\n  items: [{ path: '/real', label: 'Real', icon: 'Star' }],\n};`,
      APP_ANCHOR
    );
    expect(parsed?.items.map((item) => item.path)).toEqual(['real']);
  });
});

describe('compareNav', () => {
  it('reports nothing when the two declarations agree', () => {
    expect(compare(WIRE_ITEMS)).toEqual([]);
  });

  it('flags an item the app declares and the wire omits — the finance regression', () => {
    const mismatches = compare(WIRE_ITEMS.slice(0, 2));
    expect(mismatches).toContainEqual({
      kind: 'app-only',
      pillar: 'demo',
      field: 'settings',
      app: 'Settings',
    });
  });

  it('flags an item only the wire carries', () => {
    const mismatches = compare([
      ...WIRE_ITEMS,
      `    { path: '/ghost', label: 'Ghost', labelKey: 'demo.ghost', icon: 'star' },`,
    ]);
    expect(mismatches).toContainEqual({
      kind: 'wire-only',
      pillar: 'demo',
      field: 'ghost',
      wire: 'Ghost',
    });
  });

  it('flags a disagreeing header colour — the media regression', () => {
    expect(compare(WIRE_ITEMS, { color: 'violet' })).toContainEqual({
      kind: 'header',
      pillar: 'demo',
      field: 'color',
      app: 'emerald',
      wire: 'violet',
    });
  });

  it('flags a disagreeing header icon across the spelling difference', () => {
    expect(compare(WIRE_ITEMS, { icon: 'piggy-bank' })).toContainEqual({
      kind: 'header',
      pillar: 'demo',
      field: 'icon',
      app: 'DollarSign',
      wire: 'piggy-bank',
    });
  });

  it('flags an item icon that disagrees', () => {
    const mismatches = compare([
      WIRE_ITEMS[0] ?? '',
      `    { path: '/things', label: 'Things', labelKey: 'demo.things', icon: 'landmark' },`,
      WIRE_ITEMS[2] ?? '',
    ]);
    expect(mismatches).toContainEqual({
      kind: 'item',
      pillar: 'demo',
      field: 'things.icon',
      app: 'Building2',
      wire: 'landmark',
    });
  });

  it('flags an item label and labelKey that disagree', () => {
    const mismatches = compare([
      WIRE_ITEMS[0] ?? '',
      `    { path: '/things', label: 'Stuff', labelKey: 'demo.stuff', icon: 'building-2' },`,
      WIRE_ITEMS[2] ?? '',
    ]);
    expect(mismatches.map((m) => m.field)).toEqual(
      expect.arrayContaining(['things.label', 'things.labelKey'])
    );
  });

  it('does not treat the index route as a missing item', () => {
    expect(compare(WIRE_ITEMS).some((m) => m.field === '(index)')).toBe(false);
  });
});

describe('the real tree', () => {
  it('discovers every pillar carrying both nav declarations', () => {
    const pillars = discoverPillarNavFiles().map((entry) => entry.pillar);
    expect(pillars).toEqual(
      expect.arrayContaining(['finance', 'media', 'food', 'cerebrum', 'purchases'])
    );
  });

  it('parses both of the real finance declarations and finds them in agreement', () => {
    const files = discoverPillarNavFiles().find((entry) => entry.pillar === 'finance');
    expect(files).toBeDefined();
    if (files === undefined) throw new Error('unreachable');
    const app = parseNavDeclaration(readFileSync(files.appFile, 'utf8'), APP_ANCHOR);
    const wire = parseNavDeclaration(readFileSync(files.wireFile, 'utf8'), WIRE_ANCHOR);
    expect(app).not.toBeNull();
    expect(wire).not.toBeNull();
    if (app === null || wire === null) throw new Error('unreachable');
    expect(app.items.length).toBeGreaterThanOrEqual(11);
    expect(compareNav('finance', app, wire)).toEqual([]);
  });

  it('sees the Accounts link finance was missing from the wire', () => {
    const files = discoverPillarNavFiles().find((entry) => entry.pillar === 'finance');
    if (files === undefined) throw new Error('finance not discovered');
    const wire = parseNavDeclaration(readFileSync(files.wireFile, 'utf8'), WIRE_ANCHOR);
    expect(wire?.items.map((item) => item.path)).toEqual(
      expect.arrayContaining(['accounts', 'tag-rules', 'settings'])
    );
  });

  it('every pillar in the tree agrees with itself', () => {
    for (const files of discoverPillarNavFiles()) {
      const app = parseNavDeclaration(readFileSync(files.appFile, 'utf8'), APP_ANCHOR);
      const wire = parseNavDeclaration(readFileSync(files.wireFile, 'utf8'), WIRE_ANCHOR);
      expect(app, `${files.pillar} app nav is unparseable`).not.toBeNull();
      expect(wire, `${files.pillar} wire nav is unparseable`).not.toBeNull();
      if (app === null || wire === null) continue;
      expect(compareNav(files.pillar, app, wire)).toEqual([]);
    }
  });
});
