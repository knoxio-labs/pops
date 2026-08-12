import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
    expect(manifest.pages?.[0]).toEqual({
      path: '',
      index: true,
      bundleSlot: 'purchases-reconcile',
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

  it('declares no AI tools — the pillar reaches the assistant through MCP instead', () => {
    // `ai.tools` hosts tool definitions for the orchestrator's tool-router.
    // Purchases' assistant surface is `pillars/mcp/src/tools/purchases.ts`,
    // the same arrangement finance, inventory, media and cerebrum have.
    expect(buildPurchasesManifest('0.1.0').ai.tools).toEqual([]);
  });

  it('points the healthcheck at the route app.ts actually serves', () => {
    expect(buildPurchasesManifest('0.1.0').healthcheck).toEqual({ path: '/health' });
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
