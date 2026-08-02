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

  it('declares no nav and no pages while the pillar ships no frontend', () => {
    // A rail entry pointing at a bundle slot that does not exist is a dead
    // link. These arrive with the UI, not before it.
    const manifest = buildPurchasesManifest('0.1.0');
    expect(manifest.nav).toBeUndefined();
    expect(manifest.pages).toBeUndefined();
  });

  it('declares no search adapters or AI tools it cannot serve', () => {
    const manifest = buildPurchasesManifest('0.1.0');
    expect(manifest.search.adapters).toEqual([]);
    expect(manifest.ai.tools).toEqual([]);
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
