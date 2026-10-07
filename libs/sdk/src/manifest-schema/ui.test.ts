/**
 * Nested page descriptors (POPS-3256).
 *
 * The wire had to grow a route tree because two pillars have one: a layout
 * whose element renders tab chrome around an `<Outlet/>`, with the tabs
 * beneath it. What matters here is the boundary the schema draws around that
 * — a manifest is parsed from a source the shell did not author, so the
 * interesting cases are the malformed ones, not the well-formed one.
 */
import { describe, expect, it } from 'vitest';

import { validManifest } from '../__tests__/fixtures.js';
import { ManifestPayloadSchema } from './schema.js';
import {
  MAX_PAGE_DEPTH,
  NavConfigDescriptorSchema,
  PAGE_ACCESS,
  PageDescriptorSchema,
  resolvePageAccess,
} from './ui.js';

function leaf(path: string) {
  return { path, bundleSlot: `slot-${path.replace(/\//g, '-')}` };
}

/** A descriptor nested `depth` levels deep, counting the root as one. */
function nested(depth: number): unknown {
  let page: Record<string, unknown> = leaf('leaf');
  for (let level = depth - 1; level > 0; level -= 1) {
    page = { path: `level-${level}`, bundleSlot: `slot-${level}`, children: [page] };
  }
  return page;
}

describe('PageDescriptorSchema', () => {
  it('accepts a flat page, as every migrated pillar publishes today', () => {
    const parsed = PageDescriptorSchema.safeParse({ path: '', index: true, bundleSlot: 'home' });
    expect(parsed.success).toBe(true);
  });

  it('accepts a layout route carrying its children', () => {
    const parsed = PageDescriptorSchema.safeParse({
      path: 'data',
      bundleSlot: 'food-data-layout',
      children: [{ path: '', index: true, bundleSlot: 'food-data-index' }, leaf('ingredients')],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts nesting exactly at the bound', () => {
    expect(PageDescriptorSchema.safeParse(nested(MAX_PAGE_DEPTH)).success).toBe(true);
  });

  /**
   * The bound is structural, not counted at parse time: the schema for the
   * last level has no `children` key and `.strict()` rejects one. That is what
   * keeps a hostile manifest from being walked to arbitrary depth before the
   * depth is noticed.
   */
  it('rejects nesting one level past the bound', () => {
    expect(PageDescriptorSchema.safeParse(nested(MAX_PAGE_DEPTH + 1)).success).toBe(false);
  });

  /**
   * React Router throws at router construction for an index route with
   * children — and for a loader-mounted pillar that takes down the shell's
   * whole router, not just this pillar. Refused here, where it is one
   * manifest failing to parse.
   */
  it('rejects an index route that also has children', () => {
    const parsed = PageDescriptorSchema.safeParse({
      path: '',
      index: true,
      bundleSlot: 'both',
      children: [leaf('child')],
    });
    expect(parsed.success).toBe(false);
  });

  // An empty `children` is not the same mistake and is harmless: the loader
  // omits the key rather than mounting a childless layout.
  it('accepts an index route with an empty children list', () => {
    const parsed = PageDescriptorSchema.safeParse({
      path: '',
      index: true,
      bundleSlot: 'empty',
      children: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('still rejects an unknown key at a nested level', () => {
    const parsed = PageDescriptorSchema.safeParse({
      path: 'data',
      bundleSlot: 'layout',
      children: [{ path: 'x', bundleSlot: 'x', element: '<div/>' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('still rejects a non-kebab bundle slot at a nested level', () => {
    const parsed = PageDescriptorSchema.safeParse({
      path: 'data',
      bundleSlot: 'layout',
      children: [{ path: 'x', bundleSlot: 'NotKebab' }],
    });
    expect(parsed.success).toBe(false);
  });
});

function navWithItem(item: Record<string, unknown>) {
  return {
    id: 'finance',
    label: 'Finance',
    labelKey: 'finance',
    icon: 'dollar-sign',
    basePath: '/finance',
    order: 10,
    items: [
      {
        path: '/accounts',
        label: 'Accounts',
        labelKey: 'finance.accounts',
        icon: 'landmark',
        ...item,
      },
    ],
  };
}

/**
 * `access` (POPS-5873). Both descriptors are strict, so the field exists only
 * where it is declared: these pin that it is declared on every level of a page
 * tree and on a nav item, and that nothing but the two known values gets in.
 */
describe('access', () => {
  it('is exactly operator and guest', () => {
    expect(PAGE_ACCESS.options).toEqual(['operator', 'guest']);
  });

  it('resolves an absent declaration to operator and leaves a declared one alone', () => {
    expect(resolvePageAccess(undefined)).toBe('operator');
    expect(resolvePageAccess('operator')).toBe('operator');
    expect(resolvePageAccess('guest')).toBe('guest');
  });

  it('parses a page without the field and does not invent one', () => {
    const parsed = PageDescriptorSchema.parse(leaf('accounts'));
    expect('access' in parsed).toBe(false);
    expect(resolvePageAccess(parsed.access)).toBe('operator');
  });

  it.each(['operator', 'guest'] as const)('accepts a page marked %s', (access) => {
    const parsed = PageDescriptorSchema.parse({ ...leaf('accounts'), access });
    expect(parsed.access).toBe(access);
  });

  it.each(['admin', 'Guest', '', null, true, ['guest']])('rejects a page marked %j', (access) => {
    expect(PageDescriptorSchema.safeParse({ ...leaf('accounts'), access }).success).toBe(false);
  });

  it('accepts the field at every level down to the depth bound', () => {
    let page: Record<string, unknown> = { ...leaf('leaf'), access: 'guest' };
    for (let level = MAX_PAGE_DEPTH - 1; level > 0; level -= 1) {
      page = {
        path: `level-${level}`,
        bundleSlot: `slot-${level}`,
        access: 'guest',
        children: [page],
      };
    }
    expect(PageDescriptorSchema.safeParse(page).success).toBe(true);
  });

  it('rejects an unknown value on a nested page', () => {
    const parsed = PageDescriptorSchema.safeParse({
      path: 'data',
      bundleSlot: 'layout',
      children: [{ ...leaf('x'), access: 'everyone' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('does not copy a parent mark onto a child that declares none', () => {
    const parsed = PageDescriptorSchema.parse({
      path: 'accounts',
      bundleSlot: 'layout',
      access: 'guest',
      children: [leaf('imports')],
    });
    expect(resolvePageAccess(parsed.children?.[0]?.access)).toBe('operator');
  });

  it('parses a nav item without the field and does not invent one', () => {
    const parsed = NavConfigDescriptorSchema.parse(navWithItem({}));
    expect('access' in (parsed.items[0] ?? {})).toBe(false);
    expect(resolvePageAccess(parsed.items[0]?.access)).toBe('operator');
  });

  it.each(['operator', 'guest'] as const)('accepts a nav item marked %s', (access) => {
    const parsed = NavConfigDescriptorSchema.parse(navWithItem({ access }));
    expect(parsed.items[0]?.access).toBe(access);
  });

  it.each(['admin', 'Guest', '', null, true])('rejects a nav item marked %j', (access) => {
    expect(NavConfigDescriptorSchema.safeParse(navWithItem({ access })).success).toBe(false);
  });

  it('still rejects the field on the rail entry itself, where it is not declared', () => {
    const parsed = NavConfigDescriptorSchema.safeParse({ ...navWithItem({}), access: 'guest' });
    expect(parsed.success).toBe(false);
  });

  it('parses a whole manifest whose nav and pages predate the field', () => {
    const parsed = ManifestPayloadSchema.safeParse({
      ...validManifest(),
      nav: navWithItem({}),
      pages: [{ path: '', index: true, bundleSlot: 'home' }, leaf('accounts')],
    });
    expect(parsed.success).toBe(true);
  });

  it('parses a whole manifest that marks a page and a nav item', () => {
    const parsed = ManifestPayloadSchema.safeParse({
      ...validManifest(),
      nav: navWithItem({ access: 'guest' }),
      pages: [{ ...leaf('accounts'), access: 'guest' }],
    });
    expect(parsed.success).toBe(true);
  });
});
