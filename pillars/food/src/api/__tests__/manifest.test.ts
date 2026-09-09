/**
 * Manifest payload tests for the food pillar.
 *
 * Verify `buildFoodManifest` passes the wire schema AND carries the nav +
 * pages descriptors the shell consumes (see
 * pillars/food/docs/prds/app-shell).
 */
import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildFoodManifest, FOOD_PILLAR_ID } from '../manifest.js';

/** Shape of one wire page, restated so the walk below needs no schema import. */
interface WirePage {
  readonly path: string;
  readonly index?: boolean;
  readonly bundleSlot: string;
  readonly children?: readonly WirePage[];
}

/** Every page in the tree, flattened — `pages.length` counts only the top. */
function allPages(pages: readonly WirePage[] | undefined): WirePage[] {
  return (pages ?? []).flatMap((page) => [page, ...allPages(page.children)]);
}

/** Every page's `path`, at every depth. */
function pagePaths(pages: readonly WirePage[] | undefined): string[] {
  return allPages(pages).map((page) => page.path);
}

describe('buildFoodManifest', () => {
  it('produces a payload that passes the central manifest schema', () => {
    const manifest = buildFoodManifest('0.1.0');
    const parsed = ManifestPayloadSchema.parse(manifest);
    expect(parsed.pillar).toBe(FOOD_PILLAR_ID);
    expect(parsed.contract.package).toBe('@pops/food');
    expect(parsed.contract.tag).toBe('contract-food@v0.1.0');
  });

  it('passes the full cross-field validator', () => {
    const result = validateManifestPayload(buildFoodManifest('0.1.0'));
    expect(result.ok).toBe(true);
  });

  it('declares no settings dimension today (no food settings ship yet)', () => {
    const manifest = buildFoodManifest('0.1.0');
    expect(manifest.settings).toBeUndefined();
  });

  it('rejects non-semver versions at the schema boundary', () => {
    expect(() => ManifestPayloadSchema.parse(buildFoodManifest('not-a-semver'))).toThrow();
  });

  describe('nav + pages dimensions', () => {
    it('declares a nav block matching the shell-side food navConfig', () => {
      const manifest = buildFoodManifest('0.1.0');
      expect(manifest.nav?.id).toBe('food');
      expect(manifest.nav?.basePath).toBe('/food');
      expect(manifest.nav?.icon).toBe('utensils');
      expect(manifest.nav?.color).toBe('amber');
      expect(manifest.nav?.order).toBe(40);
    });

    it('mirrors the shell-side nav item count + paths (no drift)', () => {
      const manifest = buildFoodManifest('0.1.0');
      expect(manifest.nav?.items.map((i) => i.path)).toEqual([
        '',
        '/recipes',
        '/inbox',
        '/plan',
        '/fridge',
        '/solve',
        '/shopping/from-plan',
        '/data',
        '/prompts',
      ]);
    });

    it('rewrites every nav icon as a kebab-case wire identifier', () => {
      const manifest = buildFoodManifest('0.1.0');
      const icons = [manifest.nav?.icon, ...(manifest.nav?.items.map((i) => i.icon) ?? [])].filter(
        (v): v is string => typeof v === 'string'
      );
      for (const icon of icons) {
        expect(icon).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    /**
     * The tabs are children of the layout that renders their chrome, with
     * paths relative to it. They were flattened onto `data/<tab>` before
     * POPS-3256, against a comment saying the shell would reconstruct the
     * nesting — which nothing did. Asserting the relative paths is what stops
     * a well-meaning re-flattening: the loader mounts what it is given, and a
     * flattened tree remounts the layout on every tab switch.
     */
    it('nests the data tabs under their layout, with relative paths', () => {
      const manifest = buildFoodManifest('0.1.0');
      const data = manifest.pages?.find((p) => p.path === 'data');
      expect(data?.bundleSlot).toBe('food-data-layout');

      const childPaths = data?.children?.map((c) => c.path) ?? [];
      expect(childPaths).toContain('');
      expect(childPaths).toContain('ingredients');
      expect(childPaths).toContain('aliases');
      expect(childPaths).toContain('prep-states');
      expect(childPaths).toContain('substitutions');
      expect(childPaths).toContain('substitutions/graph');
      expect(childPaths).toContain('conversions');
      expect(childPaths).toContain('tags');

      // The negative half: no descriptor carries the old flattened form, so a
      // partial revert fails here rather than producing a tree with both.
      expect(pagePaths(manifest.pages).filter((path) => path.startsWith('data/'))).toEqual([]);
    });

    it('flags the pillar index and the layout index, and nothing else', () => {
      const manifest = buildFoodManifest('0.1.0');
      const indexes = allPages(manifest.pages).filter((p) => p.index === true);
      expect(indexes.map((p) => p.bundleSlot).toSorted()).toEqual([
        'food-data-index',
        'food-landing',
      ]);
    });

    // Walked rather than mapped: over the top level this would check fifteen
    // slots and skip the eight the layout carries.
    it('gives every page a unique kebab-case bundleSlot, nested ones included', () => {
      const manifest = buildFoodManifest('0.1.0');
      const slots = allPages(manifest.pages).map((p) => p.bundleSlot);
      expect(slots.length).toBeGreaterThan(manifest.pages?.length ?? 0);
      expect(new Set(slots).size).toBe(slots.length);
      for (const slot of slots) {
        expect(slot).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    /**
     * Declaring it is what moves the pillar onto the runtime loader: the shell
     * imports the bundle from this URL instead of compiling `@pops/app-food`
     * into its own build (POPS-3222). Root-relative, because one deployment
     * answers to a LAN name, a Tailscale name and `localhost`, and no absolute
     * origin is right on all three.
     */
    it('declares a root-relative assetsBaseUrl', () => {
      const manifest = buildFoodManifest('0.1.0');
      expect(manifest.assetsBaseUrl).toBe('/food-ui/food.js');
    });

    it('round-trips the nav + pages dimensions through JSON', () => {
      const manifest = buildFoodManifest('0.1.0');
      const roundTripped: unknown = JSON.parse(JSON.stringify(manifest));
      const parsed = ManifestPayloadSchema.parse(roundTripped);
      expect(parsed.nav?.id).toBe('food');
      expect(parsed.pages?.length).toBeGreaterThan(0);
    });
  });
});
