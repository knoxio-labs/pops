import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildPurchasesManifest, PURCHASES_PILLAR_ID } from '../manifest.js';
import { resolvePurchasesSqlitePath } from '../purchases-sqlite-path.js';

describe('buildPurchasesManifest', () => {
  it('identifies the pillar and pins the contract package', () => {
    const manifest = buildPurchasesManifest('2.0.0');
    expect(manifest.pillar).toBe(PURCHASES_PILLAR_ID);
    expect(manifest.contract).toEqual({
      package: '@pops/purchases',
      version: '2.0.0',
      tag: 'contract-purchases@v2.0.0',
    });
  });

  it('declares the rail entry the app mounts', () => {
    const manifest = buildPurchasesManifest('0.1.0');
    expect(manifest.nav).toMatchObject({
      id: PURCHASES_PILLAR_ID,
      basePath: '/purchases',
      order: 15,
    });
  });

  // The wire nav ordering is what the shell rail sorts on, and 15 puts
  // purchases next to finance (10) rather than at the end. It also has to
  // agree with the bundle-map `navOrder` the shell reads, which is a
  // separate literal in a separate package.
  it('orders the rail entry between finance and media', () => {
    const order = buildPurchasesManifest('0.1.0').nav?.order;
    expect(order).toBeGreaterThan(10);
    expect(order).toBeLessThan(20);
  });

  // A nav item with no page behind it is the dead link this manifest kept
  // both dimensions empty to avoid. They arrived together and stay matched.
  it('declares one page descriptor per nav item', () => {
    const manifest = buildPurchasesManifest('0.1.0');
    expect(manifest.pages).toHaveLength(manifest.nav?.items.length ?? 0);
    expect(manifest.pages).toEqual([
      { path: '', index: true, bundleSlot: 'purchases-reconcile' },
      { path: 'merchants', bundleSlot: 'purchases-merchants' },
      { path: 'receipts', bundleSlot: 'purchases-receipts' },
      { path: 'products', bundleSlot: 'purchases-products' },
    ]);
  });

  // The wire nav has drifted from the app before: one entry declared against
  // three the app actually mounted, with a comment still claiming they
  // matched. Nothing else in the repo compares them — the in-repo shell rail
  // is built from `@pops/app-purchases`'s own exported `navConfig`, never
  // from this manifest — so this reads the app's route source directly rather
  // than restating it a third time, the same way the literal wire values
  // above would restate it a second time.
  //
  // Reading the file as TEXT instead of importing `navConfig`/`routes` from
  // `@pops/app-purchases` is deliberate, and the import is not the available
  // simplification it looks like. `pillars/purchases/Dockerfile` hand-curates
  // the `COPY <pkg>/package.json` list it builds from and then runs
  // `pnpm install --frozen-lockfile --filter "@pops/purchases..."`, which
  // resolves devDependencies as well as dependencies. Naming the app package
  // in either block of `pillars/purchases/package.json` therefore fails the
  // image build on a workspace package that was never copied into the build
  // context — and nothing local catches it, only the Docker Build job does.
  // Reading the source keeps the app out of this package's dependency graph.
  describe('nav + pages mirror the app (no silent drift)', () => {
    const appRoutesPath = fileURLToPath(new URL('../../../app/src/routes.tsx', import.meta.url));
    const appRoutesSource = readFileSync(appRoutesPath, 'utf8');
    // `navConfig` moved out of `routes.tsx` into its own module so that reading
    // the nav does not pull the route table's lazy page imports with it. Both
    // files are read here, and every error below names the one it was reading:
    // a matcher that has stopped seeing a file must say which file.
    const appNavPath = fileURLToPath(new URL('../../../app/src/nav.ts', import.meta.url));
    const appNavSource = readFileSync(appNavPath, 'utf8');

    function sliceBalanced(
      where: string,
      source: string,
      openIndex: number,
      bracket: { open: string; close: string }
    ): string {
      const { open, close } = bracket;
      if (source[openIndex] !== open) {
        throw new Error(`expected "${open}" at index ${openIndex} in ${where}`);
      }
      let depth = 0;
      for (let i = openIndex; i < source.length; i++) {
        if (source[i] === open) depth++;
        else if (source[i] === close) {
          depth -= 1;
          if (depth === 0) return source.slice(openIndex, i + 1);
        }
      }
      throw new Error(`unbalanced "${open}${close}" starting at index ${openIndex} in ${where}`);
    }

    function extractAssignedBracket(
      where: string,
      source: string,
      declaration: string,
      bracket: '{' | '['
    ): string {
      const declStart = source.indexOf(declaration);
      if (declStart === -1) {
        throw new Error(`could not find "${declaration}" in ${where}`);
      }
      // A -1 here cannot be passed on: `indexOf` clamps a negative
      // `fromIndex` to 0, so the next search would silently restart at the
      // top of the file and return a plausible block from the wrong place.
      const eqIndex = source.indexOf('=', declStart);
      if (eqIndex === -1) {
        throw new Error(`"${declaration}" in ${where} is not an assignment`);
      }
      const openIndex = source.indexOf(bracket, eqIndex);
      const close = bracket === '{' ? '}' : ']';
      return sliceBalanced(where, source, openIndex, { open: bracket, close });
    }

    function navItemsBlock(source: string): string {
      const navConfigObject = extractAssignedBracket(
        appNavPath,
        source,
        'export const navConfig',
        '{'
      );
      const itemsIndex = navConfigObject.indexOf('items:');
      if (itemsIndex === -1) {
        throw new Error(`navConfig in ${appNavPath} declares no "items:"`);
      }
      return sliceBalanced(appNavPath, navConfigObject, navConfigObject.indexOf('[', itemsIndex), {
        open: '[',
        close: ']',
      });
    }

    // A discovery floor, per ADR-045: an extractor that matched nothing has
    // stopped seeing the file, and saying so is the finding. Left silent it
    // would surface one assertion later as "the wire declares three nav items
    // and the app declares none", which points at drift that does not exist.
    function requireFound<T>(found: T[], what: string): T[] {
      if (found.length === 0) {
        throw new Error(`extracted no ${what} from ${appRoutesPath} / ${appNavPath}`);
      }
      return found;
    }

    function itemField(object: string, key: string): string {
      const match = new RegExp(`${key}:\\s*'([^']*)'`).exec(object);
      if (match?.[1] === undefined) {
        throw new Error(`nav item in ${appNavPath} declares no "${key}"`);
      }
      return match[1];
    }

    // The fields the wire nav is required to carry across unchanged, as
    // `navConfig.items` declares them. Read per item rather than with one
    // global regex so that key order inside an item does not decide what is
    // found, and so a missing key reports itself.
    //
    // `icon` is deliberately absent: the two spell the same Lucide glyphs
    // differently on purpose — PascalCase in the app, kebab-case here because
    // the wire schema's `KEBAB_IDENTIFIER` refuses anything else — so it is
    // the one field that must NOT match.
    function navItems(block: string): { path: string; label: string; labelKey: string }[] {
      const items: { path: string; label: string; labelKey: string }[] = [];
      for (let i = 0; i < block.length; i++) {
        if (block[i] !== '{') continue;
        const object = sliceBalanced(appNavPath, block, i, { open: '{', close: '}' });
        items.push({
          path: itemField(object, 'path'),
          label: itemField(object, 'label'),
          labelKey: itemField(object, 'labelKey'),
        });
        i += object.length - 1;
      }
      return requireFound(items, 'nav items');
    }

    // Rooted paths for every route the rail can reach — the index route is
    // `''`, whether it is spelled `index: true` or `path: ''`, and a dynamic
    // segment (`:purchaseId`) is excluded because a rail entry has no id to
    // put in its path. Mirrors
    // `pillars/purchases/app/src/__tests__/manifest.test.ts`'s `navPathOf` /
    // `isReachableFromTheRail`, which prove this set equals `navConfig.items`
    // over the real exported objects inside the app package.
    function reachableRoutePaths(block: string): string[] {
      const paths = [...block.matchAll(/\{\s*(?:index:\s*true|path:\s*'([^']*)')/g)]
        .map((m) => (m[1] === undefined || m[1] === '' ? '' : `/${m[1]}`))
        .filter((path) => !path.includes(':'));
      return requireFound(paths, 'rail-reachable route paths');
    }

    it('carries every app nav item across the wire, in rail order', () => {
      const routesBlock = extractAssignedBracket(
        appRoutesPath,
        appRoutesSource,
        'export const routes',
        '['
      );
      const appNavItems = navItems(navItemsBlock(appNavSource));
      const appRoutePaths = reachableRoutePaths(routesBlock);

      // Guards the extraction rather than the manifest: if these two
      // disagree, the matchers above have drifted from the file's shape
      // rather than the file from itself. Sorted, because nothing requires
      // the app to declare its nav items in the order it mounts its routes.
      // The app package's own suite asserts the same equality over the real
      // exported objects, but it runs in a different unit — `app/**` is
      // excluded from this vitest project — so it cannot stand in here.
      expect(appNavItems.map((item) => item.path).toSorted()).toEqual(appRoutePaths.toSorted());

      // Unsorted: rail order is what the reader sees, and a wire nav shuffled
      // against the app's is drift that a set comparison would wave through.
      const wireNavItems = (buildPurchasesManifest('0.1.0').nav?.items ?? []).map(
        ({ path, label, labelKey }) => ({ path, label, labelKey })
      );
      expect(wireNavItems).toEqual(appNavItems);
    });

    it('declares one wire page descriptor per wire nav item, path-for-path', () => {
      const manifest = buildPurchasesManifest('0.1.0');
      const pagePaths = (manifest.pages ?? []).map((page) =>
        page.index === true ? '' : `/${page.path}`
      );
      const navPaths = (manifest.nav?.items ?? []).map((item) => item.path);
      expect(pagePaths).toEqual(navPaths);
    });

    // The indices these guard are the ones that fail quietly rather than
    // loudly: `indexOf` clamps a negative `fromIndex` to 0, so an unguarded
    // -1 restarts the search at the top of the file and hands back a
    // well-formed block from the wrong place, and `sliceBalanced` from -1
    // slices backwards to the empty string. A parser that reports the wrong
    // answer confidently is worse than one that refuses.
    it('throws rather than returning a wrong block when the source stops matching', () => {
      expect(() =>
        extractAssignedBracket(appRoutesPath, 'const other = [1];', 'export const routes', '[')
      ).toThrow(/could not find/);

      expect(() =>
        extractAssignedBracket(
          appRoutesPath,
          'const other = [1];\nexport const routes',
          'export const routes',
          '['
        )
      ).toThrow(/is not an assignment/);

      expect(() =>
        extractAssignedBracket(
          appRoutesPath,
          'const other = [1];\nexport const routes = undefined;',
          'export const routes',
          '['
        )
      ).toThrow(/expected "\["/);

      expect(() =>
        navItemsBlock("export const navConfig = { entries: [{ path: '/x' }] };")
      ).toThrow(/declares no "items:"/);

      // The discovery floor: a block the matchers no longer recognise reports
      // that, rather than reporting an app with no nav.
      expect(() => navItems('[]')).toThrow(/extracted no nav items/);
      expect(() => reachableRoutePaths('[]')).toThrow(/extracted no rail-reachable route paths/);

      // A nav item that lost a field the wire carries is a gap, not an item
      // with an empty one.
      expect(() => navItems("[{ path: '/x', label: 'X' }]")).toThrow(/declares no "labelKey"/);
    });

    // `{ path: '' }` is a legal spelling of the index route. Reading it as
    // `/` would report drift against a nav item that in fact matches.
    it('reads an empty route path as the index route, however it is spelled', () => {
      expect(reachableRoutePaths('[{ index: true, element: <A /> }]')).toEqual(['']);
      expect(reachableRoutePaths("[{ path: '', element: <A /> }]")).toEqual(['']);
    });
  });

  it('declares search adapters, which need no frontend to be real', () => {
    // The no-nav reasoning above does NOT extend here: the orchestrator
    // POSTs to the pillar's own `/search` over the SDK and never touches a
    // bundle slot. Names and entity types are asserted because the manifest
    // schema constrains their shape and a rename is a wire change.
    const manifest = buildPurchasesManifest('0.1.0');
    expect(manifest.search.adapters.map((adapter) => adapter.name)).toEqual([
      'orders',
      'lineItems',
    ]);
    expect(manifest.search.adapters.map((adapter) => adapter.entityType)).toEqual([
      'purchase',
      'purchase-item',
    ]);
  });

  it('advertises no query capability the search handler does not honour', () => {
    // `POST /search` carries a query and a context and nothing else. A
    // declared date range or tag filter would be a promise no route keeps.
    for (const adapter of buildPurchasesManifest('0.1.0').search.adapters) {
      expect(adapter.queryShape).toEqual({
        supportsText: true,
        supportsTags: false,
        supportsDateRange: false,
        supportsScope: [],
      });
    }
  });

  // Empty here meant "a hit has an identity nothing can navigate to". The app
  // mounts an order detail route now, so both emitted types are claimed —
  // including the line, which resolves to its order through the hit's data.
  it('claims a URI type for every entity its adapters address', () => {
    const manifest = buildPurchasesManifest('0.1.0');
    expect(manifest.uri.types).toEqual(['purchases/purchase', 'purchases/purchase-item']);
    expect(manifest.uri.types).toHaveLength(manifest.search.adapters.length);
  });

  it('declares no AI tools — the pillar reaches the assistant through MCP instead', () => {
    // `ai.tools` hosts tool definitions for the orchestrator's tool-router.
    // Purchases' assistant surface is `pillars/mcp/src/tools/purchases.ts`,
    // the same arrangement finance, inventory, media and cerebrum have.
    expect(buildPurchasesManifest('0.1.0').ai.tools).toEqual([]);
  });

  it('points the healthcheck at the route app.ts actually serves', () => {
    expect(buildPurchasesManifest('0.1.0').healthcheck).toEqual({ path: '/health' });
  });

  // POPS-2581: a manifest the wire validator rejects does not degrade the
  // pillar, it kills it — `bootstrapPillar` throws before the server is
  // registered and the container restart-loops. ADR-049 closed the shape half
  // of that, but the validator also enforces cross-field rules no type can
  // carry: every search adapter's `procedurePath` must name a procedure this
  // manifest declares, and the contract tag must agree with the version. Those
  // still fail first at boot unless something runs the real payload through.
  it('passes the SDK wire validator the registry bootstrap uses', () => {
    const result = validateManifestPayload(buildPurchasesManifest('0.1.0'));

    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('resolvePurchasesSqlitePath', () => {
  beforeEach(() => {
    delete process.env['PURCHASES_SQLITE_PATH'];
    delete process.env['SQLITE_PATH'];
  });

  afterEach(() => {
    delete process.env['PURCHASES_SQLITE_PATH'];
    delete process.env['SQLITE_PATH'];
  });

  it('prefers the pillar-specific override over the shared path', () => {
    process.env['PURCHASES_SQLITE_PATH'] = '/custom/p.db';
    process.env['SQLITE_PATH'] = '/shared/pops.db';
    expect(resolvePurchasesSqlitePath()).toBe('/custom/p.db');
  });

  it('lands beside the shared path when only that is set', () => {
    process.env['SQLITE_PATH'] = '/shared/pops.db';
    expect(resolvePurchasesSqlitePath()).toBe('/shared/purchases.db');
  });

  it('falls back to the local data dir', () => {
    expect(resolvePurchasesSqlitePath()).toBe('./data/purchases.db');
  });
});
