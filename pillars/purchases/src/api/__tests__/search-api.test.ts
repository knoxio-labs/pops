/**
 * `POST /search` over HTTP, plus the manifest declaration that makes the
 * orchestrator call it.
 *
 * The service tests hold the ranking. What only shows up here is the seam
 * the federator actually uses: the `{ query, context }` envelope it POSTs,
 * the `{ hits }` shape it parses, and — the part a unit test of either side
 * cannot catch — that the adapter's `procedurePath` names a route this
 * pillar serves. A manifest advertising a procedure the app does not host
 * is how federated search fans out to a 404.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { purchasesContract } from '../../contract/rest.js';
import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase } from '../../db/index.js';
import { createPurchasesApiApp } from '../app.js';
import { buildPurchasesManifest } from '../manifest.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
  app = createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
  });
});

afterEach(() => {
  cleanup();
  __resetPillarRegistryCache();
});

function seedCoffeeOrder(): string {
  return createPurchase(opened.db, {
    source: 'amazon',
    sourceOrderId: '249-1512883-0105415',
    ingestMethod: 'export',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 5678,
    checksum: 'amazon:249-1512883-0105415',
    merchantEntityName: 'Amazon',
    items: [
      {
        ref: 'i0',
        name: 'Dosing funnel 58mm',
        sku: 'B07XYZ1234',
        unitPriceCents: 3537,
        lineTotalCents: 3537,
      },
    ],
  });
}

describe('POST /search', () => {
  it('answers the envelope the orchestrator federates with', async () => {
    seedCoffeeOrder();

    const res = await request(app)
      .post('/search')
      .send({ query: { text: 'dosing funnel' }, context: { app: null, page: null } });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.hits)).toBe(true);
    expect(res.body.hits.length).toBeGreaterThan(0);
  });

  it('accepts the envelope without a context, which is the shape MCP sends', async () => {
    seedCoffeeOrder();

    const res = await request(app)
      .post('/search')
      .send({ query: { text: 'amazon' } });

    expect(res.status).toBe(200);
  });

  it('returns hits carrying every field the federator reads', async () => {
    seedCoffeeOrder();

    const res = await request(app)
      .post('/search')
      .send({ query: { text: 'dosing funnel' } });

    const hit = res.body.hits[0];
    expect(typeof hit.uri).toBe('string');
    expect(typeof hit.score).toBe('number');
    expect(typeof hit.matchField).toBe('string');
    expect(['exact', 'prefix', 'contains']).toContain(hit.matchType);
    expect(typeof hit.data).toBe('object');
  });

  it('survives serialisation with the order id still on the line-item hit', async () => {
    const purchaseId = seedCoffeeOrder();

    const res = await request(app)
      .post('/search')
      .send({ query: { text: 'dosing' } });
    const itemHit = res.body.hits.find((hit: { uri: string }) => hit.uri.includes('purchase-item'));

    expect(itemHit.data.purchaseId).toBe(purchaseId);
  });

  it('returns an empty list, not a 400, for a query that matches nothing', async () => {
    seedCoffeeOrder();

    const res = await request(app)
      .post('/search')
      .send({ query: { text: 'kayak' } });

    expect(res.status).toBe(200);
    expect(res.body.hits).toEqual([]);
  });

  it('rejects an envelope with no query rather than searching for nothing', async () => {
    const res = await request(app).post('/search').send({});
    expect(res.status).toBe(400);
  });
});

describe('the manifest declaration that makes federation reach the route', () => {
  it('advertises adapters, so the orchestrator federates this pillar at all', () => {
    // `isSearchCapable` in the orchestrator's federation source is exactly
    // `manifest.search.adapters.length > 0`. Empty means invisible.
    expect(buildPurchasesManifest('0.1.0').search.adapters.length).toBeGreaterThan(0);
  });

  it('points every adapter at a procedure this pillar actually serves', () => {
    const manifest = buildPurchasesManifest('0.1.0');
    const served = new Set(
      Object.entries(purchasesContract).flatMap(([domain, routes]) =>
        Object.keys(routes).map((proc) => `purchases.${domain}.${proc}`)
      )
    );

    for (const adapter of manifest.search.adapters) {
      expect(served.has(adapter.procedurePath)).toBe(true);
    }
  });

  it('declares those procedures in routes, which the manifest validator demands', () => {
    const manifest = buildPurchasesManifest('0.1.0');
    const declared = new Set([...manifest.routes.queries, ...manifest.routes.mutations]);

    for (const adapter of manifest.search.adapters) {
      expect(declared.has(adapter.procedurePath)).toBe(true);
    }
  });
});
