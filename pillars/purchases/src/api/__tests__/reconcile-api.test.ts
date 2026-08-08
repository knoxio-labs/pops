/**
 * The reconcile surface, through the real app and a real database.
 *
 * The queue is derived from persisted state rather than from a saved copy
 * of the solver's verdict, so most of what is worth asserting here is that
 * the derivation says the same thing the sweep just decided.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase } from '../../db/index.js';
import { runSweep } from '../../reconcile/sweep.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { CandidateFetch, FinanceClient } from '../finance/client.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

const TXN = 'pops://finance/transaction/t1';

function financeWith(transactions: { uri: string; amountCents: number; date: string }[]) {
  return {
    fetchCandidates: () =>
      Promise.resolve<CandidateFetch>({
        kind: 'ok',
        transactions: transactions.map((t) => ({
          uri: t.uri,
          description: 'AMAZON MKTPLACE AU',
          amountCents: t.amountCents,
          date: t.date,
        })),
      }),
  } satisfies FinanceClient;
}

const UNAVAILABLE: FinanceClient = {
  fetchCandidates: () =>
    Promise.resolve<CandidateFetch>({ kind: 'unavailable', reason: 'unavailable' }),
};

function order(totalCents: number, checksum: string) {
  return createPurchase(opened.db, {
    source: 'amazon',
    sourceOrderId: checksum,
    ingestMethod: 'export',
    orderedAt: '2026-03-04T00:00:00Z',
    currency: 'AUD',
    totalCents,
    checksum,
  });
}

function build(finance: FinanceClient = financeWith([])): Express {
  return createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    sweep: () => runSweep({ db: opened.db, finance, defaultWindowDays: 21 }),
  });
}

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
  app = build();
});

afterEach(() => {
  cleanup();
  __resetPillarRegistryCache();
});

describe('the queue', () => {
  it('is empty before anything is ingested', async () => {
    const res = await request(app).get('/reconcile/queue').expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('lists an unexplained charge with no proposal', async () => {
    order(4128, 'a');
    await runSweep({ db: opened.db, finance: financeWith([]), defaultWindowDays: 21 });

    const res = await request(app).get('/reconcile/queue').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].proposed).toEqual([]);
    // Unexplained, not contested — the delta is the whole charge.
    expect(res.body.items[0].deltaCents).toBe(-4128);
  });

  it('lists a proposal with a zero delta once the sweep matches', async () => {
    order(4128, 'a');
    await runSweep({
      db: opened.db,
      finance: financeWith([{ uri: TXN, amountCents: 4128, date: '2026-03-06' }]),
      defaultWindowDays: 21,
    });

    const res = await request(app).get('/reconcile/queue').expect(200);
    expect(res.body.items[0].proposed).toHaveLength(1);
    expect(res.body.items[0].proposed[0].linkType).toBe('exact');
    expect(res.body.items[0].deltaCents).toBe(0);
  });

  it('reports a partial payment as a negative delta rather than hiding it', async () => {
    order(5000, 'a');
    await runSweep({
      db: opened.db,
      finance: financeWith([{ uri: TXN, amountCents: 3000, date: '2026-03-06' }]),
      defaultWindowDays: 21,
    });

    const res = await request(app).get('/reconcile/queue').expect(200);
    expect(res.body.items[0].proposed[0].linkType).toBe('partial');
    expect(res.body.items[0].deltaCents).toBe(-2000);
  });

  it('separates proposals from unexplained charges', async () => {
    order(4128, 'matched');
    order(9999, 'unmatched');
    await runSweep({
      db: opened.db,
      finance: financeWith([{ uri: TXN, amountCents: 4128, date: '2026-03-06' }]),
      defaultWindowDays: 21,
    });

    const proposed = await request(app).get('/reconcile/queue?kind=proposed').expect(200);
    const unexplained = await request(app).get('/reconcile/queue?kind=unexplained').expect(200);

    expect(proposed.body.items).toHaveLength(1);
    expect(unexplained.body.items).toHaveLength(1);
    expect(proposed.body.items[0].chargeId).not.toBe(unexplained.body.items[0].chargeId);
  });

  it('drops a charge once its link is confirmed', async () => {
    // Confirming is the whole point of the queue: a decided charge must
    // stop asking.
    order(4128, 'a');
    await runSweep({
      db: opened.db,
      finance: financeWith([{ uri: TXN, amountCents: 4128, date: '2026-03-06' }]),
      defaultWindowDays: 21,
    });
    const before = await request(app).get('/reconcile/queue').expect(200);
    const { chargeId } = before.body.items[0];

    await request(app)
      .post('/reconcile/confirm')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    const after = await request(app).get('/reconcile/queue').expect(200);
    expect(after.body.items).toEqual([]);
  });

  it('filters by source', async () => {
    order(4128, 'a');
    await runSweep({ db: opened.db, finance: financeWith([]), defaultWindowDays: 21 });

    const mine = await request(app).get('/reconcile/queue?source=amazon').expect(200);
    const other = await request(app).get('/reconcile/queue?source=woolworths').expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(other.body.items).toEqual([]);
  });

  it('pages, so a first backfill does not return hundreds of rows at once', async () => {
    order(1000, 'a');
    order(2000, 'b');
    order(3000, 'c');
    await runSweep({ db: opened.db, finance: financeWith([]), defaultWindowDays: 21 });

    const first = await request(app).get('/reconcile/queue?limit=2').expect(200);
    const second = await request(app).get('/reconcile/queue?limit=2&offset=2').expect(200);

    expect(first.body.items).toHaveLength(2);
    expect(second.body.items).toHaveLength(1);
    const ids = [...first.body.items, ...second.body.items].map(
      (i: { chargeId: string }) => i.chargeId
    );
    expect(new Set(ids).size).toBe(3);
  });

  it('excludes an auto-link source, so grocery never interrupts', async () => {
    // The invariant the whole zero-touch promise rests on: ~60 line items a
    // shop and ~6,000 a year from one merchant. If those asked questions
    // the queue becomes unusable and gets abandoned — taking the orders
    // that DO need a decision with it (ADR-042, POPS-239).
    await request(app)
      .put('/sources/woolworths')
      .send({ label: 'Woolworths', descriptorPattern: 'WOOLWORTHS%', autoLinkPolicy: 'auto' })
      .expect(200);
    createPurchase(opened.db, {
      source: 'woolworths',
      sourceOrderId: 'shop-1',
      ingestMethod: 'export',
      orderedAt: '2026-03-04T00:00:00Z',
      currency: 'AUD',
      totalCents: 8765,
      checksum: 'shop-1',
    });
    await runSweep({ db: opened.db, finance: financeWith([]), defaultWindowDays: 21 });

    const queue = await request(app).get('/reconcile/queue').expect(200);
    expect(queue.body.items).toEqual([]);
  });

  it('still surfaces an auto-link source when explicitly asked', async () => {
    // Not hidden, just not interrupting — the merchant lens wants this
    // bucket even though the daily queue does not.
    await request(app)
      .put('/sources/woolworths')
      .send({ label: 'Woolworths', descriptorPattern: 'WOOLWORTHS%', autoLinkPolicy: 'auto' })
      .expect(200);
    createPurchase(opened.db, {
      source: 'woolworths',
      sourceOrderId: 'shop-1',
      ingestMethod: 'export',
      orderedAt: '2026-03-04T00:00:00Z',
      currency: 'AUD',
      totalCents: 8765,
      checksum: 'shop-1',
    });
    await runSweep({ db: opened.db, finance: financeWith([]), defaultWindowDays: 21 });

    const queue = await request(app).get('/reconcile/queue?includeAuto=true').expect(200);
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0].source).toBe('woolworths');
  });

  it('treats includeAuto=false as off, not as truthy', async () => {
    // z.coerce.boolean() uses JS truthiness, so 'false' would arrive as
    // true and there would be no way to switch the flag back off — failing
    // in the direction that puts 6,000 grocery charges into the queue.
    await request(app)
      .put('/sources/woolworths')
      .send({ label: 'Woolworths', descriptorPattern: 'WOOLWORTHS%', autoLinkPolicy: 'auto' })
      .expect(200);
    createPurchase(opened.db, {
      source: 'woolworths',
      sourceOrderId: 'shop-1',
      ingestMethod: 'export',
      orderedAt: '2026-03-04T00:00:00Z',
      currency: 'AUD',
      totalCents: 8765,
      checksum: 'shop-1',
    });
    await runSweep({ db: opened.db, finance: financeWith([]), defaultWindowDays: 21 });

    const off = await request(app).get('/reconcile/queue?includeAuto=false').expect(200);
    expect(off.body.items).toEqual([]);

    const on = await request(app).get('/reconcile/queue?includeAuto=true').expect(200);
    expect(on.body.items).toHaveLength(1);
  });

  it('keeps a review-policy source in the queue alongside an auto one', async () => {
    await request(app)
      .put('/sources/woolworths')
      .send({ label: 'Woolworths', descriptorPattern: 'WOOLWORTHS%', autoLinkPolicy: 'auto' })
      .expect(200);
    createPurchase(opened.db, {
      source: 'woolworths',
      sourceOrderId: 'shop-1',
      ingestMethod: 'export',
      orderedAt: '2026-03-04T00:00:00Z',
      currency: 'AUD',
      totalCents: 8765,
      checksum: 'shop-1',
    });
    order(4128, 'amazon-1');
    await runSweep({ db: opened.db, finance: financeWith([]), defaultWindowDays: 21 });

    const queue = await request(app).get('/reconcile/queue').expect(200);
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0].source).toBe('amazon');
  });

  it('excludes cash orders, which can never be decided', async () => {
    createPurchase(opened.db, {
      source: 'amazon',
      sourceOrderId: 'cash',
      ingestMethod: 'manual',
      orderedAt: '2026-03-04T00:00:00Z',
      currency: 'AUD',
      totalCents: 500,
      settlementMode: 'cash',
      checksum: 'cash',
    });
    await runSweep({ db: opened.db, finance: financeWith([]), defaultWindowDays: 21 });

    const res = await request(app).get('/reconcile/queue').expect(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('decisions', () => {
  async function seedProposal(): Promise<string> {
    order(4128, 'a');
    await runSweep({
      db: opened.db,
      finance: financeWith([{ uri: TXN, amountCents: 4128, date: '2026-03-06' }]),
      defaultWindowDays: 21,
    });
    const res = await request(app).get('/reconcile/queue').expect(200);
    return res.body.items[0].chargeId as string;
  }

  it('pins a confirmed link against re-derivation', async () => {
    const chargeId = await seedProposal();
    await request(app)
      .post('/reconcile/confirm')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    // A sweep where the transaction has vanished entirely.
    await runSweep({ db: opened.db, finance: financeWith([]), defaultWindowDays: 21 });

    const detail = await request(app).get('/purchases').expect(200);
    const purchaseId = detail.body.items[0].id;
    const full = await request(app).get(`/purchases/${purchaseId}`).expect(200);
    expect(full.body.accounting.matchedCents).toBe(4128);
  });

  it('removes a link on unlink', async () => {
    const chargeId = await seedProposal();
    await request(app)
      .post('/reconcile/unlink')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    const res = await request(app).get('/reconcile/queue').expect(200);
    expect(res.body.items[0].proposed).toEqual([]);
  });

  it('404s a decision about a link that is no longer there', async () => {
    // The queue is a snapshot; a sweep may have re-derived since it was
    // read. Reporting success would be a lie the user discovers later.
    const chargeId = await seedProposal();
    await request(app)
      .post('/reconcile/unlink')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    await request(app)
      .post('/reconcile/confirm')
      .send({ chargeId, transactionUri: TXN })
      .expect(404);
  });
});

describe('the explicit sweep', () => {
  it('reports what it did', async () => {
    order(4128, 'a');
    const res = await request(app).post('/reconcile/sweep').send({}).expect(200);

    expect(res.body.kind).toBe('swept');
    expect(res.body.derivedChargesMinted).toBe(1);
  });

  it('reports a skip distinctly from a sweep that found nothing', async () => {
    // A caller conflating the two would read an outage as a clean, empty
    // reconciliation.
    order(4128, 'a');
    const unavailableApp = build(UNAVAILABLE);
    const res = await request(unavailableApp).post('/reconcile/sweep').send({}).expect(200);

    expect(res.body.kind).toBe('skipped');
    expect(res.body.reason).toBe('unavailable');
  });

  it('503s when no runner is wired, rather than pretending it swept', async () => {
    const noRunner = createPurchasesApiApp({
      vision: null,
      purchasesDb: opened,
      version: '1.2.3',
      selfBaseUrl: 'http://localhost:3013',
    });
    await request(noRunner).post('/reconcile/sweep').send({}).expect(503);
  });
});
