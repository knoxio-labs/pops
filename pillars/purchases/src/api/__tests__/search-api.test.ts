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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ErrorBodySchema } from '../../contract/rest-schemas.js';
import { purchasesContract } from '../../contract/rest.js';
import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, upsertSource } from '../../db/index.js';
import { createPurchasesApiApp } from '../app.js';
import { buildPurchasesManifest } from '../manifest.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

const { requestOn } = createTestTransport();

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
        sku: { value: 'B07XYZ1234', scheme: 'asin' },
        unitPriceCents: 3537,
        lineTotalCents: 3537,
      },
    ],
  });
}

describe('POST /search', () => {
  it('answers the envelope the orchestrator federates with', async () => {
    seedCoffeeOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({ query: { text: 'dosing funnel' }, context: { app: null, page: null } });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.hits)).toBe(true);
    expect(res.body.hits.length).toBeGreaterThan(0);
  });

  it('accepts the envelope without a context, which is the shape MCP sends', async () => {
    seedCoffeeOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({ query: { text: 'amazon' } });

    expect(res.status).toBe(200);
  });

  it('returns hits carrying every field the federator reads', async () => {
    seedCoffeeOrder();

    const res = await requestOn(app)
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

    const res = await requestOn(app)
      .post('/search')
      .send({ query: { text: 'dosing' } });
    const itemHit = res.body.hits.find((hit: { uri: string }) => hit.uri.includes('purchase-item'));

    expect(itemHit.data.purchaseId).toBe(purchaseId);
  });

  it('returns an empty list, not a 400, for a query that matches nothing', async () => {
    seedCoffeeOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({ query: { text: 'kayak' } });

    expect(res.status).toBe(200);
    expect(res.body.hits).toEqual([]);
  });

  it('rejects an envelope with no query rather than searching for nothing', async () => {
    const res = await requestOn(app).post('/search').send({});
    expect(res.status).toBe(400);
  });
});

/**
 * `query.filters` on the wire.
 *
 * The contract publishes this field, so it reaches every generated client
 * and the MCP tool. A caller that sends one and gets a 200 back must be able
 * to trust that it was applied — there is nothing in an unfiltered response
 * that says otherwise, which is why an unapplicable filter is refused here
 * rather than dropped.
 */
describe('POST /search with filters', () => {
  /**
   * The order a hit belongs to, whichever adapter produced it — an order hit
   * is its own, and a line hit belongs to the order it was bought on.
   */
  function owningPurchaseIds(hits: readonly { uri: string; data: Record<string, unknown> }[]) {
    return hits.map((hit) =>
      hit.uri.includes('/purchase-item/') ? hit.data['purchaseId'] : hit.uri.split('/').at(-1)
    );
  }

  function seedWoolworthsOrder(): string {
    upsertSource(opened.db, { id: 'woolworths', label: 'Woolworths' });
    return createPurchase(opened.db, {
      source: 'woolworths',
      sourceOrderId: 'WW-1',
      ingestMethod: 'upload',
      orderedAt: '2025-11-02T01:41:21Z',
      currency: 'AUD',
      totalCents: 1200,
      checksum: 'woolworths:WW-1',
      merchantEntityName: 'Woolworths',
      items: [
        {
          ref: 'i0',
          name: 'Dosing funnel 58mm',
          unitPriceCents: 1200,
          lineTotalCents: 1200,
        },
      ],
    });
  }

  it('scopes to the requested source instead of answering with every source', async () => {
    const amazon = seedCoffeeOrder();
    const woolworths = seedWoolworthsOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({
        query: {
          text: 'dosing funnel',
          filters: [{ field: 'source', operator: 'eq', value: 'woolworths' }],
        },
      });

    // The text matches the same line in both orders and matches neither
    // merchant, so every hit here comes from the item adapter — the half a
    // scope applied to the order query alone would leave wide open.
    const ids = owningPurchaseIds(res.body.hits);
    expect(res.status).toBe(200);
    expect(ids).toContain(woolworths);
    expect(ids).not.toContain(amazon);
  });

  it('scopes to the requested window at both ends', async () => {
    const amazon = seedCoffeeOrder();
    const woolworths = seedWoolworthsOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({
        query: {
          text: 'dosing funnel',
          filters: [
            { field: 'orderedAt', operator: 'gte', value: '2026-01-01T00:00:00Z' },
            { field: 'orderedAt', operator: 'lte', value: '2026-12-31T23:59:59Z' },
          ],
        },
      });

    const ids = owningPurchaseIds(res.body.hits);
    expect(res.status).toBe(200);
    expect(ids).toContain(amazon);
    expect(ids).not.toContain(woolworths);
  });

  it('takes the offset bound `GET /purchases` takes, and reaches the same orders', async () => {
    // Both routes narrow on `orderedAt` and one pillar cannot hold two rules
    // about which timestamps are legal. `+11:00` is the offset a Sydney
    // caller writes, and it used to be a 200 on the index and a 400 here.
    const amazon = seedCoffeeOrder();
    seedWoolworthsOrder();
    const bound = '2026-01-01T11:00:00+11:00';

    const searched = await requestOn(app)
      .post('/search')
      .send({
        query: {
          text: 'dosing funnel',
          filters: [{ field: 'orderedAt', operator: 'gte', value: bound }],
        },
      });
    const listed = await requestOn(app).get('/purchases').query({ from: bound });

    expect(searched.status).toBe(200);
    expect(listed.status).toBe(200);
    expect(owningPurchaseIds(searched.body.hits)).toEqual([amazon]);
    expect(listed.body.items.map((row: { id: string }) => row.id)).toEqual([amazon]);
  });

  it('scopes to the requested status', async () => {
    seedCoffeeOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({
        query: {
          text: 'dosing funnel',
          filters: [{ field: 'status', operator: 'eq', value: 'linked' }],
        },
      });

    // The seeded order is awaiting settlement, so a status it does not carry
    // must empty the response rather than pass through.
    expect(res.status).toBe(200);
    expect(res.body.hits).toEqual([]);
  });

  it('treats an empty filter list as no filter at all', async () => {
    seedCoffeeOrder();

    const filtered = await requestOn(app)
      .post('/search')
      .send({ query: { text: 'dosing funnel', filters: [] } });
    const unfiltered = await requestOn(app)
      .post('/search')
      .send({ query: { text: 'dosing funnel' } });

    expect(filtered.status).toBe(200);
    expect(filtered.body).toEqual(unfiltered.body);
  });

  it('rejects a field it cannot narrow on rather than ignoring it', async () => {
    seedCoffeeOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({
        query: {
          text: 'dosing funnel',
          filters: [{ field: 'merchantEntityName', operator: 'eq', value: 'Amazon' }],
        },
      });

    // The contract's own enum rejects this before any handler runs, and a
    // rejection that never reached a handler still has to be the body the
    // route declares — otherwise the client generated from that document
    // cannot decode the 400 it is most likely to receive.
    expect(res.status).toBe(400);
    expect(ErrorBodySchema.safeParse(res.body).success).toBe(true);
  });

  it('rejects an operator it cannot apply', async () => {
    seedCoffeeOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({
        query: {
          text: 'dosing funnel',
          filters: [{ field: 'source', operator: 'contains', value: 'amaz' }],
        },
      });

    expect(res.status).toBe(400);
    expect(ErrorBodySchema.safeParse(res.body).success).toBe(true);
  });

  it('rejects a supported field paired with an operator it does not take, naming both', async () => {
    seedCoffeeOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({
        query: {
          text: 'dosing funnel',
          filters: [{ field: 'orderedAt', operator: 'eq', value: '2026-02-02T01:41:21Z' }],
        },
      });

    expect(res.status).toBe(400);
    expect(ErrorBodySchema.safeParse(res.body).success).toBe(true);
    expect(res.body.message).toContain('orderedAt');
    expect(res.body.message).toContain('eq');
  });

  it('rejects a value the field cannot hold, naming it', async () => {
    seedCoffeeOrder();

    const res = await requestOn(app)
      .post('/search')
      .send({
        query: {
          text: 'dosing funnel',
          filters: [{ field: 'status', operator: 'eq', value: 'shipped' }],
        },
      });

    expect(res.status).toBe(400);
    expect(ErrorBodySchema.safeParse(res.body).success).toBe(true);
    expect(res.body.message).toContain('shipped');
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
