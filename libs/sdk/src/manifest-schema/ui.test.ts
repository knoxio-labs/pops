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

import { MAX_PAGE_DEPTH, PageDescriptorSchema } from './ui.js';

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
