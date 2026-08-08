/**
 * A backfill, end to end: parse → HTTP → database → sweep → accounting.
 *
 * Every layer here is the real one. The parser's output goes through the
 * actual Express app over supertest, into a real migrated SQLite file,
 * and the sweep reads it back through the real service layer. Only the
 * finance transport is faked, and `api/finance/__tests__/finance-http.test.ts`
 * covers that over real HTTP.
 *
 * The gap this closes: the parser's 748 orders had been validated against
 * the contract's zod schema and never actually inserted. A schema is not a
 * database — NOT NULL, the foreign key to `purchase_sources`, the unique
 * constraints and the CHECKs are all downstream of it, and a payload can
 * satisfy every zod rule and still be rejected on INSERT.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { ORDER_HISTORY_CSV } from '../../ingest/amazon/__tests__/__fixtures__/order-history.js';
import { parseAmazonOrderHistory } from '../../ingest/amazon/order-history.js';
import { runSweep } from '../../reconcile/sweep.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { CandidateFetch, FinanceClient } from '../finance/client.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
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

const { orders } = parseAmazonOrderHistory(ORDER_HISTORY_CSV);

/** POST every parsed order, returning each status code in order. */
async function postAll(): Promise<number[]> {
  const statuses: number[] = [];
  for (const order of orders) {
    const response = await request(app).post('/purchases').send(order);
    statuses.push(response.status);
  }
  return statuses;
}

function financeWith(
  transactions: { uri: string; amountCents: number; date: string; description?: string }[]
): FinanceClient {
  return {
    fetchCandidates: () =>
      Promise.resolve<CandidateFetch>({
        kind: 'ok',
        transactions: transactions.map((t) => ({
          uri: t.uri,
          description: t.description ?? 'AMAZON MKTPLACE AU',
          amountCents: t.amountCents,
          date: t.date,
        })),
      }),
  };
}

describe('the parser output is acceptable to the real API', () => {
  it('creates every parsed order', async () => {
    // Zod-validating a payload is not the same as inserting it: NOT NULL,
    // the purchase_sources foreign key, the unique constraints and the
    // CHECKs all sit downstream of the schema.
    const statuses = await postAll();
    expect(statuses).toEqual(orders.map(() => 201));
  });

  it('round-trips each order through GET with its lines and deliveries intact', async () => {
    await postAll();

    const list = await request(app).get('/purchases').expect(200);
    expect(list.body.items).toHaveLength(orders.length);

    for (const summary of list.body.items) {
      const detail = await request(app).get(`/purchases/${summary.id}`).expect(200);
      const source = orders.find((o) => o.sourceOrderId === detail.body.purchase.sourceOrderId);
      expect(source).toBeDefined();
      expect(detail.body.items).toHaveLength(source?.items?.length ?? 0);
      expect(detail.body.shipments).toHaveLength(source?.shipments?.length ?? 0);
      expect(detail.body.purchase.totalCents).toBe(source?.totalCents);
    }
  });

  it('reports a re-run as a conflict rather than duplicating the backfill', async () => {
    // The DSAR bundle is downloaded repeatedly over time, so a second run
    // over the same file is the normal case, not an error.
    await postAll();
    const second = await postAll();

    expect(second).toEqual(orders.map(() => 409));
    const list = await request(app).get('/purchases').expect(200);
    expect(list.body.items).toHaveLength(orders.length);
  });
});

describe('the ingest trigger', () => {
  it('fires once per successful create', async () => {
    const fired = vi.fn();
    const triggered = createPurchasesApiApp({
      vision: null,
      purchasesDb: opened,
      version: '1.2.3',
      selfBaseUrl: 'http://localhost:3013',
      onIngest: fired,
    });

    const [order] = orders;
    if (order === undefined) throw new Error('fixture has no orders');
    await request(triggered).post('/purchases').send(order).expect(201);

    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the create was rejected', async () => {
    // A duplicate writes nothing, so there is nothing to reconcile — and a
    // re-run of a 748-order backfill would otherwise request 748 sweeps
    // for work that did not happen.
    const fired = vi.fn();
    const triggered = createPurchasesApiApp({
      vision: null,
      purchasesDb: opened,
      version: '1.2.3',
      selfBaseUrl: 'http://localhost:3013',
      onIngest: fired,
    });

    const [order] = orders;
    if (order === undefined) throw new Error('fixture has no orders');
    await request(triggered).post('/purchases').send(order).expect(201);
    await request(triggered).post('/purchases').send(order).expect(409);

    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('does not fail the request when the trigger throws', async () => {
    // Reconciliation must never be the reason an ingest fails. The order is
    // already written by the time this runs.
    const triggered = createPurchasesApiApp({
      vision: null,
      purchasesDb: opened,
      version: '1.2.3',
      selfBaseUrl: 'http://localhost:3013',
      onIngest: () => {
        throw new Error('sweep scheduling blew up');
      },
    });

    const [order] = orders;
    if (order === undefined) throw new Error('fixture has no orders');
    await request(triggered).post('/purchases').send(order).expect(201);

    const list = await request(triggered).get('/purchases').expect(200);
    expect(list.body.items).toHaveLength(1);
  });
});

describe('a backfilled order reconciles', () => {
  it('starts fully unexplained, because the export states no charges', async () => {
    await postAll();

    const list = await request(app).get('/purchases').expect(200);
    const first = list.body.items[0];
    const detail = await request(app).get(`/purchases/${first.id}`).expect(200);

    // The state a first backfill really lands in: nothing is wrong, there
    // is simply no statement yet. Worth pinning, because it looks alarming.
    expect(detail.body.accounting.matchedCents).toBe(0);
    expect(detail.body.accounting.residualCents).toBe(detail.body.purchase.totalCents);
  });

  it('moves an order from unexplained to matched once its transaction exists', async () => {
    await postAll();

    const list = await request(app).get('/purchases').expect(200);
    const target = list.body.items.find((p: { totalCents: number }) => p.totalCents > 0);
    expect(target).toBeDefined();

    const before = await request(app).get(`/purchases/${target.id}`).expect(200);
    expect(before.body.accounting.residualCents).toBe(before.body.purchase.totalCents);

    const swept = await runSweep({
      db: opened.db,
      finance: financeWith([
        {
          uri: 'pops://finance/transaction/t1',
          amountCents: target.totalCents,
          date: String(target.orderedAt).slice(0, 10),
        },
      ]),
      defaultWindowDays: 21,
    });
    expect(swept.kind).toBe('swept');

    const after = await request(app).get(`/purchases/${target.id}`).expect(200);
    expect(after.body.accounting.matchedCents).toBe(target.totalCents);
    expect(after.body.accounting.residualCents).toBe(0);
    // The identity the whole accounting split rests on, over real data.
    expect(
      after.body.accounting.matchedCents +
        after.body.accounting.awaitingImportCents +
        after.body.accounting.residualCents
    ).toBe(after.body.purchase.totalCents);
  });

  it('leaves every other order untouched by that one match', async () => {
    await postAll();
    const list = await request(app).get('/purchases').expect(200);
    const target = list.body.items.find((p: { totalCents: number }) => p.totalCents > 0);

    await runSweep({
      db: opened.db,
      finance: financeWith([
        {
          uri: 'pops://finance/transaction/t1',
          amountCents: target.totalCents,
          date: String(target.orderedAt).slice(0, 10),
        },
      ]),
      defaultWindowDays: 21,
    });

    // One transaction can settle exactly one charge. If a second order also
    // claimed it, spend would be double-counted against real money.
    const claims: string[] = [];
    for (const summary of list.body.items) {
      const detail = await request(app).get(`/purchases/${summary.id}`).expect(200);
      for (const charge of detail.body.charges) {
        for (const link of charge.links ?? []) claims.push(link.transactionUri);
      }
    }
    expect(claims.filter((uri) => uri === 'pops://finance/transaction/t1')).toHaveLength(1);
  });
});
