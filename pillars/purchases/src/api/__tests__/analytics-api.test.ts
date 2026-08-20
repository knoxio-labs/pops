/**
 * `GET /analytics/merchant-spend` over HTTP.
 *
 * The service tests beside this one hold the arithmetic. What only shows up
 * here is the wire: whether the query parameters a browser actually sends
 * reach the filter, and whether the response survives serialisation with
 * every figure the merchant lens needs still on it.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, upsertSource } from '../../db/index.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  upsertSource(opened.db, {
    id: 'woolworths',
    label: 'Woolworths',
    descriptorPattern: 'WOOLWORTHS%',
    settlementWindowDays: 14,
    autoLinkPolicy: 'auto',
    ingestAdapter: 'woolworths-receipt',
  });
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

function order(
  overrides: Partial<CreatePurchaseInput> & { checksum: string }
): CreatePurchaseInput {
  return {
    source: 'amazon',
    ingestMethod: 'export',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 5678,
    sourceOrderId: overrides.checksum,
    merchantEntityName: 'Amazon',
    ...overrides,
  };
}

describe('GET /analytics/merchant-spend', () => {
  it('returns the explained/unexplained split the merchant lens renders', async () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'a',
        totalCents: 10_000,
        // $70 charged, $30 on a gift card that no charge will ever explain.
        charges: [{ sourceChargeRef: 'cap', amountCents: 7000 }],
      })
    );

    const res = await request(app).get('/analytics/merchant-spend');

    expect(res.status).toBe(200);
    const group = res.body.merchants[0];
    expect(group.merchant).toEqual({ entityId: null, name: 'Amazon', resolution: 'name' });
    expect(group.orderCount).toBe(1);
    // The whole point of the route: the residual is a figure the server
    // returns, not one the browser has to remember to compute.
    expect(group.accounting.residualCents).toBe(3000);
    expect(group.accounting.awaitingImportCents).toBe(7000);
    expect(group.accounting.netSpendCents).toBe(10_000);
  });

  it('echoes the period so a rendered figure carries the window it describes', async () => {
    createPurchase(opened.db, order({ checksum: 'a' }));

    const res = await request(app).get(
      '/analytics/merchant-spend?from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z'
    );

    expect(res.body.period).toEqual({
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
    });
  });

  it('reports a null period when unbounded, rather than omitting the key', async () => {
    createPurchase(opened.db, order({ checksum: 'a' }));
    const res = await request(app).get('/analytics/merchant-spend');
    expect(res.body.period).toEqual({ from: null, to: null });
  });

  it('applies the period filter it was given', async () => {
    createPurchase(opened.db, order({ checksum: 'old', orderedAt: '2025-02-02T01:41:21Z' }));
    createPurchase(opened.db, order({ checksum: 'new', orderedAt: '2026-02-02T01:41:21Z' }));

    const res = await request(app).get('/analytics/merchant-spend?from=2026-01-01T00:00:00Z');
    expect(res.body.totals[0].orderCount).toBe(1);
  });

  it('accepts a repeated source parameter, the same way the order index does', async () => {
    createPurchase(opened.db, order({ checksum: 'am', source: 'amazon' }));
    createPurchase(opened.db, order({ checksum: 'wo', source: 'woolworths' }));

    const single = await request(app).get('/analytics/merchant-spend?sources=amazon');
    expect(single.body.totals[0].orderCount).toBe(1);

    const both = await request(app).get(
      '/analytics/merchant-spend?sources=amazon&sources=woolworths'
    );
    expect(both.body.totals[0].orderCount).toBe(2);
  });

  it('rejects a malformed period rather than silently ignoring it', async () => {
    // A bound the server cannot parse must not fall through to "no bound" —
    // that answers a different question than the one asked, and the response
    // would look completely normal.
    const res = await request(app).get('/analytics/merchant-spend?from=2026');
    expect(res.status).toBe(400);
  });

  it('returns empty lists rather than 404 when nothing is in scope', async () => {
    const res = await request(app).get('/analytics/merchant-spend');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ period: { from: null, to: null }, merchants: [], totals: [] });
  });

  it('does not offer a limit, so a truncated total cannot be requested', async () => {
    // A caller who passes one gets everything anyway. An aggregate over an
    // arbitrary page is a wrong number wearing a right number's shape, and
    // there would be nothing in the response to say so.
    for (let i = 0; i < 5; i += 1) {
      createPurchase(opened.db, order({ checksum: `n-${String(i)}`, totalCents: 1000 }));
    }

    const res = await request(app).get('/analytics/merchant-spend?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.totals[0].orderCount).toBe(5);
    expect(res.body.totals[0].accounting.totalCents).toBe(5000);
  });
});

describe('GET /analytics/product-leaderboard', () => {
  it('returns a repeat with the basis its group was formed on', async () => {
    for (const month of ['01', '02']) {
      createPurchase(
        opened.db,
        order({
          checksum: `funnel-${month}`,
          orderedAt: `2026-${month}-04T00:00:00Z`,
          items: [
            {
              name: 'Magnetic Dosing Funnel',
              sku: { value: 'B0FCSJTKJ8', scheme: 'asin' },
              unitPriceCents: 1179,
              lineTotalCents: 1179,
            },
          ],
        })
      );
    }

    const res = await request(app).get('/analytics/product-leaderboard');

    expect(res.status).toBe(200);
    const [entry] = res.body.products;
    expect(entry.orderCount).toBe(2);
    expect(entry.landedCostCents).toBe(2358);
    expect(entry.lastPurchasedAt).toBe('2026-02-04T00:00:00Z');
    // The basis travels with the group. Without it a consumer cannot tell a
    // merchant-stated identity from a name that happened to match.
    expect(entry.product).toEqual({
      basis: 'sku',
      source: 'amazon',
      sku: 'B0FCSJTKJ8',
      name: 'Magnetic Dosing Funnel',
    });
    expect(entry.merchants).toEqual([{ resolution: 'name', entityId: null, name: 'Amazon' }]);
  });

  it('carries the cadence and the unit-price history through serialisation', async () => {
    for (const [day, unitPriceCents] of [
      ['01', 900],
      ['08', 700],
      ['29', 1100],
    ] as const) {
      createPurchase(
        opened.db,
        order({
          checksum: `pods-${day}`,
          orderedAt: `2026-01-${day}T00:00:00Z`,
          items: [
            {
              name: 'Coffee Pods',
              sku: { value: 'B00PODS', scheme: 'merchant' },
              unitPriceCents,
              lineTotalCents: unitPriceCents,
              promotionalPrice: unitPriceCents === 700,
            },
          ],
        })
      );
    }

    const res = await request(app).get('/analytics/product-leaderboard');

    expect(res.status).toBe(200);
    const [entry] = res.body.products;
    expect(entry.cadence).toEqual({
      basis: 'intervals',
      medianIntervalSeconds: 14 * 86_400,
      meanIntervalSeconds: 14 * 86_400,
      shortestIntervalSeconds: 7 * 86_400,
      longestIntervalSeconds: 21 * 86_400,
    });
    expect(entry.unitPrice).toEqual({
      firstCents: 900,
      lastCents: 1100,
      minCents: 700,
      maxCents: 1100,
      promotionalLineCount: 1,
      ordinaryLineCount: 2,
      unstatedPromotionLineCount: 0,
      measuredLineCount: 0,
    });
  });

  it('sends no interval figures for a product bought once', async () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'once',
        items: [
          {
            name: 'Kettle',
            sku: { value: 'B00KETTLE', scheme: 'merchant' },
            unitPriceCents: 8900,
            lineTotalCents: 8900,
          },
        ],
      })
    );

    const res = await request(app).get('/analytics/product-leaderboard');

    // A zero on the wire is read as "bought again immediately", which is the
    // opposite of what one purchase means.
    expect(res.body.products[0].cadence).toEqual({ basis: 'single-purchase' });
  });

  it('states how much of the scope rests on printed names rather than identifiers', async () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'mixed',
        items: [
          {
            name: 'Funnel',
            sku: { value: 'B0FCSJTKJ8', scheme: 'asin' },
            unitPriceCents: 1179,
            lineTotalCents: 1179,
          },
          { name: 'Bananas Cavendish', unitPriceCents: 400, lineTotalCents: 400 },
        ],
      })
    );

    const res = await request(app).get('/analytics/product-leaderboard');

    expect(res.body.coverage).toEqual({
      lineCount: 2,
      skuKeyedLines: 1,
      nameKeyedLines: 1,
      unidentifiedLines: 0,
      productCount: 2,
    });
  });

  it('applies minOrderCount and echoes it, so an absent group has a stated reason', async () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'a',
        orderedAt: '2026-01-04T00:00:00Z',
        items: [
          {
            name: 'Funnel',
            sku: { value: 'REPEAT', scheme: 'merchant' },
            unitPriceCents: 100,
            lineTotalCents: 100,
          },
          {
            name: 'Tamper',
            sku: { value: 'ONCE', scheme: 'merchant' },
            unitPriceCents: 100,
            lineTotalCents: 100,
          },
        ],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'b',
        orderedAt: '2026-02-04T00:00:00Z',
        items: [
          {
            name: 'Funnel',
            sku: { value: 'REPEAT', scheme: 'merchant' },
            unitPriceCents: 100,
            lineTotalCents: 100,
          },
        ],
      })
    );

    const res = await request(app).get('/analytics/product-leaderboard?minOrderCount=2');

    expect(res.body.minOrderCount).toBe(2);
    expect(res.body.products).toHaveLength(1);
    // The withheld product is still counted, so the response cannot be read
    // as "this is everything that was bought".
    expect(res.body.coverage.productCount).toBe(2);
  });

  it('defaults minOrderCount to 1 and says so', async () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'a',
        items: [
          {
            name: 'Tamper',
            sku: { value: 'ONCE', scheme: 'merchant' },
            unitPriceCents: 100,
            lineTotalCents: 100,
          },
        ],
      })
    );

    const res = await request(app).get('/analytics/product-leaderboard');
    expect(res.body.minOrderCount).toBe(1);
    expect(res.body.products).toHaveLength(1);
  });

  it('rejects a minOrderCount below one rather than treating it as no filter', async () => {
    expect((await request(app).get('/analytics/product-leaderboard?minOrderCount=0')).status).toBe(
      400
    );
  });

  it('applies the same scope vocabulary the merchant roll-up does', async () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'am',
        items: [
          {
            name: 'Funnel',
            sku: { value: 'B0FCSJTKJ8', scheme: 'asin' },
            unitPriceCents: 100,
            lineTotalCents: 100,
          },
        ],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'wo',
        source: 'woolworths',
        items: [{ name: 'Bananas', unitPriceCents: 400, lineTotalCents: 400 }],
      })
    );

    const res = await request(app).get('/analytics/product-leaderboard?sources=woolworths');
    expect(res.body.coverage.lineCount).toBe(1);
    expect(res.body.products[0].product.basis).toBe('name');
  });

  it('does not offer a limit, so a truncated leaderboard cannot be requested', async () => {
    for (let i = 0; i < 5; i += 1) {
      createPurchase(
        opened.db,
        order({
          checksum: `n-${String(i)}`,
          items: [
            {
              name: `Thing ${String(i)}`,
              sku: { value: `SKU-${String(i)}`, scheme: 'merchant' },
              unitPriceCents: 100,
              lineTotalCents: 100,
            },
          ],
        })
      );
    }

    const res = await request(app).get('/analytics/product-leaderboard?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(5);
  });

  it('returns an empty leaderboard rather than 404 when nothing is in scope', async () => {
    const res = await request(app).get('/analytics/product-leaderboard');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      period: { from: null, to: null },
      minOrderCount: 1,
      products: [],
      coverage: {
        lineCount: 0,
        skuKeyedLines: 0,
        nameKeyedLines: 0,
        unidentifiedLines: 0,
        productCount: 0,
      },
    });
  });
});
