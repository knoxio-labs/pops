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
