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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ARRANGEMENT_TIMEOUT_MS,
  openTempDb,
  seedAmazonSource,
  snapshotTempDb,
} from '../../db/__tests__/helpers.js';
import { ORDER_HISTORY_CSV } from '../../ingest/amazon/__tests__/__fixtures__/order-history.js';
import { parseAmazonOrderHistory } from '../../ingest/amazon/order-history.js';
import { runSweep } from '../../reconcile/sweep.js';
import { createPurchasesApiApp } from '../app.js';
import { financeReturning } from '../finance/__tests__/fixtures.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { TempDb, TempDbTemplate } from '../../db/__tests__/helpers.js';
import type { OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

function appOver(db: OpenedPurchasesDb): Express {
  return createPurchasesApiApp({
    vision: null,
    purchasesDb: db,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
  });
}

/**
 * Give every test in the enclosing block its own database and app.
 *
 * The registry cache is process-wide, so it is reset around each test
 * whichever database the test starts from.
 */
function useDb(makeDb: () => TempDb): void {
  beforeEach(() => {
    const temp = makeDb();
    opened = temp.opened;
    cleanup = temp.cleanup;
    __resetPillarRegistryCache();
    app = appOver(opened);
  });

  afterEach(() => {
    cleanup();
    __resetPillarRegistryCache();
  });
}

/** An empty database with only the Amazon source registered. */
function useEmptyDb(): void {
  useDb(() => {
    const temp = openTempDb();
    seedAmazonSource(temp.opened);
    return temp;
  });
}

/** A private copy of the database the whole export was POSTed into. */
function useBackfilledDb(): void {
  useDb(() => backfilled.open());
}

const { orders } = parseAmazonOrderHistory(ORDER_HISTORY_CSV);

/** POST every parsed order through `target`, returning each status in order. */
async function postAll(target: Express): Promise<number[]> {
  const statuses: number[] = [];
  for (const order of orders) {
    const response = await request(target).post('/purchases').send(order);
    statuses.push(response.status);
  }
  return statuses;
}

/**
 * The backfill itself, run once for the file.
 *
 * Six of the tests below need an already-backfilled database and each used
 * to POST the whole export again to get one, which is the same HTTP work
 * repeated six times over — contention that showed up as unrelated tests in
 * this file missing vitest's default timeout under load. Copying the
 * finished database instead costs a file copy, and each copy is private, so
 * the two tests that sweep still cannot see each other's writes.
 */
let backfilled: TempDbTemplate;
let backfillStatuses: number[];

beforeAll(async () => {
  const temp = openTempDb();
  try {
    seedAmazonSource(temp.opened);
    __resetPillarRegistryCache();
    backfillStatuses = await postAll(appOver(temp.opened));
    backfilled = snapshotTempDb(temp.opened);
  } finally {
    // An arrangement that throws half way must not leave a database handle
    // and a primed registry cache behind for the tests that follow to trip
    // over — a leak here would read as a flake in whatever ran next.
    temp.cleanup();
    __resetPillarRegistryCache();
  }
}, ARRANGEMENT_TIMEOUT_MS);

describe('the parser output is acceptable to the real API', () => {
  useBackfilledDb();

  it('creates every parsed order', () => {
    // Zod-validating a payload is not the same as inserting it: NOT NULL,
    // the purchase_sources foreign key, the unique constraints and the
    // CHECKs all sit downstream of the schema.
    expect(backfillStatuses).toEqual(orders.map(() => 201));
  });

  it('round-trips each order through GET with its lines and deliveries intact', async () => {
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
    // over the same file is the normal case, not an error. This one really
    // does re-POST the export: the second run is the thing under test.
    const second = await postAll(app);

    expect(second).toEqual(orders.map(() => 409));
    const list = await request(app).get('/purchases').expect(200);
    expect(list.body.items).toHaveLength(orders.length);
  });
});

describe('the ingest trigger', () => {
  useEmptyDb();

  function appNotifying(onIngest: () => void): Express {
    return createPurchasesApiApp({
      vision: null,
      purchasesDb: opened,
      version: '1.2.3',
      selfBaseUrl: 'http://localhost:3013',
      onIngest,
    });
  }

  it('fires once per successful create', async () => {
    const fired = vi.fn();
    const triggered = appNotifying(fired);

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
    const triggered = appNotifying(fired);

    const [order] = orders;
    if (order === undefined) throw new Error('fixture has no orders');
    await request(triggered).post('/purchases').send(order).expect(201);
    await request(triggered).post('/purchases').send(order).expect(409);

    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('does not fail the request when the trigger throws', async () => {
    // Reconciliation must never be the reason an ingest fails. The order is
    // already written by the time this runs.
    const triggered = appNotifying(() => {
      throw new Error('sweep scheduling blew up');
    });

    const [order] = orders;
    if (order === undefined) throw new Error('fixture has no orders');
    await request(triggered).post('/purchases').send(order).expect(201);

    const list = await request(triggered).get('/purchases').expect(200);
    expect(list.body.items).toHaveLength(1);
  });
});

describe('a backfilled order reconciles', () => {
  useBackfilledDb();

  it('starts fully unexplained, because the export states no charges', async () => {
    const list = await request(app).get('/purchases').expect(200);
    const first = list.body.items[0];
    const detail = await request(app).get(`/purchases/${first.id}`).expect(200);

    // The state a first backfill really lands in: nothing is wrong, there
    // is simply no statement yet. Worth pinning, because it looks alarming.
    expect(detail.body.accounting.matchedCents).toBe(0);
    expect(detail.body.accounting.residualCents).toBe(detail.body.purchase.totalCents);
  });

  it('moves an order from unexplained to matched once its transaction exists', async () => {
    const list = await request(app).get('/purchases').expect(200);
    const target = list.body.items.find((p: { totalCents: number }) => p.totalCents > 0);
    expect(target).toBeDefined();

    const before = await request(app).get(`/purchases/${target.id}`).expect(200);
    expect(before.body.accounting.residualCents).toBe(before.body.purchase.totalCents);

    const swept = await runSweep({
      db: opened.db,
      finance: financeReturning({
        id: 't1',
        amountCents: target.totalCents,
        date: String(target.orderedAt).slice(0, 10),
      }),
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
    const list = await request(app).get('/purchases').expect(200);
    const target = list.body.items.find((p: { totalCents: number }) => p.totalCents > 0);

    await runSweep({
      db: opened.db,
      finance: financeReturning({
        id: 't1',
        amountCents: target.totalCents,
        date: String(target.orderedAt).slice(0, 10),
      }),
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
