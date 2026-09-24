import { describe, expect, it } from 'vitest';

import {
  advertisesLoaderMountedUi,
  evaluateReachability,
} from '../check-pillar-ui-reachability.mjs';

type PillarApp = Parameters<typeof evaluateReachability>[0][number];

const app = (pkgName: string): PillarApp => {
  const pillarId = pkgName.replace('@pops/app-', '');
  return { pkgName, pkgPath: `pillars/${pillarId}/app/package.json`, pillarId };
};

/** A pillar whose wire manifest advertises no UI at all. */
const noWireUi = () => ({ assetsBaseUrl: false, pages: false, nav: false });

/** A pillar whose wire manifest advertises a loader-mounted UI. */
const onTheWire = () => ({ assetsBaseUrl: true, pages: true, nav: true });

describe('evaluateReachability', () => {
  it('passes when every discovered app is on the wire', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const result = evaluateReachability(apps, onTheWire);
    expect(result.missing).toEqual([]);
    expect(result.covered).toEqual(['@pops/app-alpha', '@pops/app-beta']);
  });

  it('reports the exact app that is off the wire', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const result = evaluateReachability(apps, (candidate) =>
      candidate.pkgName === '@pops/app-alpha' ? onTheWire() : noWireUi()
    );
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.covered).toEqual(['@pops/app-alpha']);
  });

  it('reports multiple apps off the wire', () => {
    const apps = [app('@pops/app-a'), app('@pops/app-b'), app('@pops/app-c')];
    const result = evaluateReachability(apps, (candidate) =>
      candidate.pkgName === '@pops/app-b' ? onTheWire() : noWireUi()
    );
    expect(result.missing).toEqual(['@pops/app-a', '@pops/app-c']);
  });

  // The loader builds a pillar's routes from `pages` alone, so a bundle URL
  // with no pages behind it advertises something nothing will ever mount.
  it('refuses an assetsBaseUrl with no pages behind it', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateReachability(apps, () => ({
      assetsBaseUrl: true,
      pages: false,
      nav: true,
    }));
    expect(result.missing).toEqual(['@pops/app-beta']);
    // The whole sentence, not the fragment: the fragment was present while the
    // sentence read "declares no a non-empty pages", so matching it proved
    // nothing about what a reader sees.
    expect(result.reasons[0]).toContain('declares no non-empty pages');
  });

  it('refuses pages with no bundle URL to load them from', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateReachability(apps, () => ({
      assetsBaseUrl: false,
      pages: true,
      nav: true,
    }));
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.reasons[0]).toContain('declares no assetsBaseUrl');
  });

  // The shell builds the app rail from `nav` alone (`navConfigFromDescriptor`
  // in `pillars/shell/src/app/external-ui.tsx`), so pages and an
  // assetsBaseUrl with no `nav` behind them mount routes nothing links to.
  it('refuses pages and an assetsBaseUrl with no nav behind them', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateReachability(apps, () => ({
      assetsBaseUrl: true,
      pages: true,
      nav: false,
    }));
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.reasons[0]).toContain('declares no nav with non-empty items');
  });

  /**
   * A pillar whose manifest cannot be found at all is a different failure from
   * one whose manifest declares nothing, and the guard conflated them until
   * POPS-3220 — telling the reader to add an `assetsBaseUrl` to a file that had
   * one, under a name the lookup missed.
   */
  it('reports a manifest it could not find as missing, not as undeclared', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateReachability(apps, () => ({
      assetsBaseUrl: false,
      pages: false,
      nav: false,
      found: false,
    }));
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.reasons[0]).toContain('no wire manifest could be found');
    expect(result.reasons[0]).not.toContain('declares no');
  });

  it('flags every app when nothing is on the wire', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const result = evaluateReachability(apps, noWireUi);
    expect(result.missing).toEqual(['@pops/app-alpha', '@pops/app-beta']);
    expect(result.covered).toEqual([]);
  });
});

describe('advertisesLoaderMountedUi', () => {
  const manifest = (body: string): string =>
    ['export function build() {', '  return {', body, '  };', '}'].join('\n');

  it('reads a manifest that declares all three', () => {
    const src = manifest(
      "    assetsBaseUrl: '/beta-ui/beta.js',\n    pages: [...BETA_PAGES],\n    nav: BETA_WIRE_NAV,"
    );
    const withNavConst = `const BETA_WIRE_NAV = { ...BETA_NAV, items: [...BETA_NAV.items] };\n${src}`;
    expect(advertisesLoaderMountedUi(withNavConst)).toEqual({
      assetsBaseUrl: true,
      pages: true,
      nav: true,
    });
  });

  it('reads an empty page list as no pages', () => {
    const src = manifest(
      "    assetsBaseUrl: '/beta-ui/beta.js',\n    pages: [],\n    nav: BETA_WIRE_NAV,"
    );
    const withNavConst = `const BETA_WIRE_NAV = { ...BETA_NAV, items: [...BETA_NAV.items] };\n${src}`;
    expect(advertisesLoaderMountedUi(withNavConst)).toEqual({
      assetsBaseUrl: true,
      pages: false,
      nav: true,
    });
  });

  it('reads a spaced-out empty page list as no pages', () => {
    const src = manifest("    assetsBaseUrl: '/x.js',\n    pages: [ ],");
    expect(advertisesLoaderMountedUi(src).pages).toBe(false);
  });

  // `nav` is declared, but the pillar's own `NavConfigDescriptor` projection
  // gives it an empty `items` list — an app-rail entry with nothing to click.
  it('reads nav with an empty items list as no nav', () => {
    const src = manifest(
      "    assetsBaseUrl: '/beta-ui/beta.js',\n    pages: [...BETA_PAGES],\n    nav: BETA_WIRE_NAV,"
    );
    const withNavConst = `const BETA_WIRE_NAV = { ...BETA_NAV, items: [] };\n${src}`;
    expect(advertisesLoaderMountedUi(withNavConst)).toEqual({
      assetsBaseUrl: true,
      pages: true,
      nav: false,
    });
  });

  // `nav` absent entirely: pages and a bundle URL exist, but there is nothing
  // in the manifest for the shell's app rail to build from.
  it('reads a manifest with pages but no nav as no nav', () => {
    const src = manifest("    assetsBaseUrl: '/beta-ui/beta.js',\n    pages: [...BETA_PAGES],");
    expect(advertisesLoaderMountedUi(src)).toEqual({
      assetsBaseUrl: true,
      pages: true,
      nav: false,
    });
  });

  // `items` is often projected as `{ ...FOO_NAV, items: [...FOO_NAV.items] }`
  // on one line rather than at the start of its own line — oxfmt keeps it
  // there when it fits under the print width. The guard must still see it.
  it('reads items declared mid-line after an object spread', () => {
    const src = [
      'const BETA_WIRE_NAV = { ...BETA_NAV, items: [...BETA_NAV.items] };',
      'export function build() {',
      '  return {',
      "    assetsBaseUrl: '/x.js',",
      '    pages: [1],',
      '    nav: BETA_WIRE_NAV,',
      '  };',
      '}',
    ].join('\n');
    expect(advertisesLoaderMountedUi(src)).toEqual({
      assetsBaseUrl: true,
      pages: true,
      nav: true,
    });
  });

  // These manifests discuss all three keys at length. A guard that counted
  // prose would pass every pillar in the repo while checking none of them.
  it('does not count a key named only in a comment', () => {
    const src = [
      '/** Set assetsBaseUrl:, pages: and nav: to mount through the loader. */',
      'const x = 1;',
    ].join('\n');
    expect(advertisesLoaderMountedUi(src)).toEqual({
      assetsBaseUrl: false,
      pages: false,
      nav: false,
    });
  });

  it('does not count a key named only inside a string', () => {
    const src = "const doc = 'assetsBaseUrl: none, pages: none, nav: none, items: none';";
    expect(advertisesLoaderMountedUi(src)).toEqual({
      assetsBaseUrl: false,
      pages: false,
      nav: false,
    });
  });

  it('reads a declaration whatever its indentation', () => {
    expect(
      advertisesLoaderMountedUi(
        "assetsBaseUrl: '/x.js',\npages: [1],\nnav: X,\nconst X = { ...Y, items: [1] };"
      )
    ).toEqual({
      assetsBaseUrl: true,
      pages: true,
      nav: true,
    });
  });

  it('reads nothing from an empty source', () => {
    expect(advertisesLoaderMountedUi('')).toEqual({
      assetsBaseUrl: false,
      pages: false,
      nav: false,
    });
  });
});
