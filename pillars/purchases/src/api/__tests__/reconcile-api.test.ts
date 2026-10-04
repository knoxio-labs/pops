import { eq } from 'drizzle-orm';
/**
 * The reconcile surface, through the real app and a real database.
 *
 * The queue is derived from persisted state rather than from a saved copy
 * of the solver's verdict, so most of what is worth asserting here is that
 * the derivation says the same thing the sweep just decided.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import {
  createPurchase,
  listActiveMatchRules,
  purchaseChargeLinks,
  persistProposedLinks,
  purchaseCharges,
  recordMatchRule,
} from '../../db/index.js';
import { runSweep } from '../../reconcile/sweep.js';
import { createPurchasesApiApp } from '../app.js';
import { FINANCE_UNAVAILABLE, financeReturning } from '../finance/__tests__/fixtures.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type {
  FinanceClient,
  FinanceTransactionLookup,
  FinanceTransactionSearch,
} from '../finance/client.js';

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

const TXN = 'pops://finance/transaction/t1';

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

function seedRuleProposal(): { chargeId: string; purchaseId: string; ruleId: string } {
  const purchaseId = createPurchase(opened.db, {
    source: 'amazon',
    sourceOrderId: 'rule-order',
    ingestMethod: 'export',
    orderedAt: '2026-03-04T00:00:00Z',
    currency: 'AUD',
    totalCents: 4128,
    checksum: 'rule-order',
    charges: [{ amountCents: 4128, role: 'capture' }],
  });
  const charge = opened.db
    .select({ id: purchaseCharges.id })
    .from(purchaseCharges)
    .where(eq(purchaseCharges.purchaseId, purchaseId))
    .get();
  if (charge === undefined) throw new Error('Expected the purchase charge to be stored');

  const ruleId = recordMatchRule(opened.db, {
    transactionDescription: 'WOOLWORTHS 1234 SYDNEY',
    source: 'amazon',
    entityId: null,
    entityName: 'Woolworths',
    confidence: 0.9,
  });
  if (ruleId === null) throw new Error('Expected the merchant descriptor to produce a rule');

  persistProposedLinks(opened.db, [
    {
      chargeId: charge.id,
      transactionUri: TXN,
      transactionDescription: 'WOOLWORTHS 1234 SYDNEY',
      amountCents: 4128,
      linkType: 'rule',
      confidence: 0.9,
      matchRuleId: ruleId,
    },
  ]);
  return { chargeId: charge.id, purchaseId, ruleId };
}

function build(
  finance: FinanceClient & FinanceTransactionLookup & FinanceTransactionSearch = financeReturning()
): Express {
  return createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    financeTransactionLookup: finance,
    financeTransactionSearch: finance,
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
    const res = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('lists an unexplained charge with no proposal', async () => {
    order(4128, 'a');
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const res = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].proposed).toEqual([]);
    // Unexplained, not contested — the delta is the whole charge.
    expect(res.body.items[0].deltaCents).toBe(-4128);
  });

  it('lists a proposal with a zero delta once the sweep matches', async () => {
    order(4128, 'a');
    await runSweep({
      db: opened.db,
      finance: financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }),
      defaultWindowDays: 21,
    });

    const res = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(res.body.items[0].proposed).toHaveLength(1);
    expect(res.body.items[0].proposed[0].linkType).toBe('exact');
    expect(res.body.items[0].proposed[0]).toMatchObject({
      matchRuleId: null,
      matchRulePattern: null,
      matchRuleIsActive: null,
    });
    expect(res.body.items[0].deltaCents).toBe(0);
  });

  it('decorates a proposal with its posting date, description and payee', async () => {
    order(4128, 'proposal-details');
    const finance = financeReturning({
      id: 't1',
      amountCents: 4128,
      date: '2026-03-05',
      description: 'AMAZON MARKETPLACE',
      entityName: 'Bookshop Central',
    });
    await runSweep({ db: opened.db, finance, defaultWindowDays: 21 });
    app = build(finance);

    const res = await requestOn(app).get('/reconcile/queue').expect(200);

    expect(res.body.items[0].proposed).toEqual([
      expect.objectContaining({
        amountCents: 4128,
        transactionDate: '2026-03-05',
        transactionDescription: 'AMAZON MARKETPLACE',
        transactionPayee: 'Bookshop Central',
      }),
    ]);
  });

  it('returns saved proposal descriptions when Finance cannot decorate the queue', async () => {
    order(4128, 'stored-description');
    await runSweep({
      db: opened.db,
      finance: financeReturning({ id: 't1', amountCents: 4128, description: 'AMAZON MARKETPLACE' }),
      defaultWindowDays: 21,
    });
    app = build(FINANCE_UNAVAILABLE);

    const res = await requestOn(app).get('/reconcile/queue').expect(200);

    expect(res.body.items[0].proposed[0]).toMatchObject({
      transactionDate: null,
      transactionDescription: 'AMAZON MARKETPLACE',
      transactionPayee: null,
    });
  });

  it('reports a partial payment as a negative delta rather than hiding it', async () => {
    order(5000, 'a');
    await runSweep({
      db: opened.db,
      finance: financeReturning({ id: 't1', amountCents: 3000, date: '2026-03-06' }),
      defaultWindowDays: 21,
    });

    const res = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(res.body.items[0].proposed[0].linkType).toBe('partial');
    expect(res.body.items[0].deltaCents).toBe(-2000);
  });

  it('separates proposals from unexplained charges', async () => {
    order(4128, 'matched');
    order(9999, 'unmatched');
    await runSweep({
      db: opened.db,
      finance: financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }),
      defaultWindowDays: 21,
    });

    const proposed = await requestOn(app).get('/reconcile/queue?kind=proposed').expect(200);
    const unexplained = await requestOn(app).get('/reconcile/queue?kind=unexplained').expect(200);

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
      finance: financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }),
      defaultWindowDays: 21,
    });
    const before = await requestOn(app).get('/reconcile/queue').expect(200);
    const { chargeId } = before.body.items[0];

    await requestOn(app)
      .post('/reconcile/confirm')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    const after = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(after.body.items).toEqual([]);
  });

  it('filters by source', async () => {
    order(4128, 'a');
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const mine = await requestOn(app).get('/reconcile/queue?source=amazon').expect(200);
    const other = await requestOn(app).get('/reconcile/queue?source=woolworths').expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(other.body.items).toEqual([]);
  });

  it('pages, so a first backfill does not return hundreds of rows at once', async () => {
    order(1000, 'a');
    order(2000, 'b');
    order(3000, 'c');
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const first = await requestOn(app).get('/reconcile/queue?limit=2').expect(200);
    const second = await requestOn(app).get('/reconcile/queue?limit=2&offset=2').expect(200);

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
    await requestOn(app)
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
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const queue = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(queue.body.items).toEqual([]);
  });

  it('still surfaces an auto-link source when explicitly asked', async () => {
    // Not hidden, just not interrupting — the merchant lens wants this
    // bucket even though the daily queue does not.
    await requestOn(app)
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
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const queue = await requestOn(app).get('/reconcile/queue?includeAuto=true').expect(200);
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0].source).toBe('woolworths');
  });

  it('treats includeAuto=false as off, not as truthy', async () => {
    // z.coerce.boolean() uses JS truthiness, so 'false' would arrive as
    // true and there would be no way to switch the flag back off — failing
    // in the direction that puts 6,000 grocery charges into the queue.
    await requestOn(app)
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
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const off = await requestOn(app).get('/reconcile/queue?includeAuto=false').expect(200);
    expect(off.body.items).toEqual([]);

    const on = await requestOn(app).get('/reconcile/queue?includeAuto=true').expect(200);
    expect(on.body.items).toHaveLength(1);
  });

  it('keeps a review-policy source in the queue alongside an auto one', async () => {
    await requestOn(app)
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
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const queue = await requestOn(app).get('/reconcile/queue').expect(200);
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
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const res = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('learned rule attribution', () => {
  it('names the readable rule in the queue and merchant order list', async () => {
    const { chargeId, purchaseId, ruleId } = seedRuleProposal();

    const queue = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(queue.body.items[0].chargeId).toBe(chargeId);
    expect(queue.body.items[0].proposed[0]).toMatchObject({
      linkType: 'rule',
      matchRuleId: ruleId,
      matchRulePattern: 'WOOLWORTHS SYDNEY',
      matchRuleIsActive: true,
    });

    const orders = await requestOn(app).get('/purchases?source=amazon').expect(200);
    expect(
      orders.body.items.find((item: { id: string }) => item.id === purchaseId).ruleLinks
    ).toEqual([
      {
        id: ruleId,
        descriptionPattern: 'WOOLWORTHS SYDNEY',
        source: 'amazon',
        isActive: true,
      },
    ]);
  });

  it('deactivates a rule without deleting its attribution, and 404s an unknown rule', async () => {
    const { chargeId, purchaseId, ruleId } = seedRuleProposal();

    await requestOn(app).post(`/reconcile/rules/${ruleId}/deactivate`).expect(200, { ok: true });
    expect(listActiveMatchRules(opened.db)).toEqual([]);

    const queue = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(queue.body.items[0].chargeId).toBe(chargeId);
    expect(queue.body.items[0].proposed[0].matchRuleIsActive).toBe(false);

    const orders = await requestOn(app).get('/purchases?source=amazon').expect(200);
    expect(
      orders.body.items.find((item: { id: string }) => item.id === purchaseId).ruleLinks
    ).toMatchObject([{ id: ruleId, descriptionPattern: 'WOOLWORTHS SYDNEY', isActive: false }]);

    await requestOn(app).post('/reconcile/rules/missing/deactivate').expect(404);
  });
});

describe('manual links', () => {
  it('searches Finance candidates with date, payee and amount details', async () => {
    app = build(
      financeReturning(
        {
          id: 't1',
          amountCents: 4128,
          date: '2026-03-06',
          description: 'AMAZON MARKETPLACE',
          entityName: 'Amazon',
        },
        {
          id: 't2',
          amountCents: 5000,
          description: 'WOOLWORTHS',
        }
      )
    );

    const response = await requestOn(app)
      .get('/reconcile/manual-candidates?search=AMAZON')
      .expect(200);

    expect(response.body.items).toEqual([
      {
        transactionUri: TXN,
        description: 'AMAZON MARKETPLACE',
        date: '2026-03-06',
        payee: 'Amazon',
        amountCents: 4128,
        settlementCurrency: 'AUD',
      },
    ]);
  });

  it('fails closed when Finance cannot search transactions', async () => {
    app = build(FINANCE_UNAVAILABLE);

    await requestOn(app).get('/reconcile/manual-candidates?search=AMAZON').expect(503);
  });

  it('creates a confirmed manual link that a later sweep keeps', async () => {
    order(4128, 'manual-link');
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });
    const queue = await requestOn(app).get('/reconcile/queue?kind=unexplained').expect(200);
    const chargeId = queue.body.items[0].chargeId as string;
    app = build(
      financeReturning({
        id: 't1',
        amountCents: 4128,
        date: '2026-03-06',
        description: 'AMAZON MARKETPLACE',
      })
    );

    await requestOn(app)
      .post('/reconcile/manual')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    const created = opened.db.select().from(purchaseChargeLinks).all();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      chargeId,
      transactionUri: TXN,
      transactionDescription: 'AMAZON MARKETPLACE',
      amountCents: 4128,
      linkType: 'manual',
      confidence: 1,
    });
    expect(created[0]?.confirmedAt).not.toBeNull();

    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const afterSweep = opened.db.select().from(purchaseChargeLinks).all();
    expect(afterSweep).toHaveLength(1);
    expect(afterSweep[0]?.confirmedAt).toBe(created[0]?.confirmedAt);
    expect(afterSweep[0]?.linkType).toBe('manual');
  });

  it('does not replace a link that appeared after the queue was read', async () => {
    order(4128, 'proposal-won-race');
    const finance = financeReturning(
      { id: 't1', amountCents: 4128 },
      { id: 't2', amountCents: 6000, description: 'UNRELATED TRANSACTION' }
    );
    await runSweep({ db: opened.db, finance, defaultWindowDays: 21 });
    const queue = await requestOn(app).get('/reconcile/queue?kind=proposed').expect(200);
    const chargeId = queue.body.items[0].chargeId as string;
    app = build(finance);

    await requestOn(app)
      .post('/reconcile/manual')
      .send({ chargeId, transactionUri: 'pops://finance/transaction/t2' })
      .expect(409);

    const links = opened.db.select().from(purchaseChargeLinks).all();
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ transactionUri: TXN, linkType: 'exact' });
    expect(links[0]?.confirmedAt).toBeNull();
  });

  it('does not write a link for a Finance transaction that no longer exists', async () => {
    order(4128, 'missing-finance-transaction');
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });
    const queue = await requestOn(app).get('/reconcile/queue?kind=unexplained').expect(200);
    const chargeId = queue.body.items[0].chargeId as string;

    await requestOn(app)
      .post('/reconcile/manual')
      .send({ chargeId, transactionUri: TXN })
      .expect(404);

    expect(opened.db.select().from(purchaseChargeLinks).all()).toEqual([]);
  });
});

describe('decisions', () => {
  async function seedProposal(): Promise<string> {
    order(4128, 'a');
    await runSweep({
      db: opened.db,
      finance: financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }),
      defaultWindowDays: 21,
    });
    const res = await requestOn(app).get('/reconcile/queue').expect(200);
    return res.body.items[0].chargeId as string;
  }

  it('pins a confirmed link against re-derivation', async () => {
    const chargeId = await seedProposal();
    await requestOn(app)
      .post('/reconcile/confirm')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    // A sweep where the transaction has vanished entirely.
    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    const detail = await requestOn(app).get('/purchases').expect(200);
    const purchaseId = detail.body.items[0].id;
    const full = await requestOn(app).get(`/purchases/${purchaseId}`).expect(200);
    expect(full.body.accounting.matchedCents).toBe(4128);
  });

  it('names the rule a confirm learned', async () => {
    const chargeId = await seedProposal();

    const res = await requestOn(app)
      .post('/reconcile/confirm')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    // A bare `{ ok: true }` cannot tell a decision that taught the matcher
    // from one whose descriptor carried nothing to learn.
    expect(res.body).toEqual({ ok: true, matchRuleId: expect.any(String) });
  });

  it('keeps a rejected pairing out of every later sweep', async () => {
    const chargeId = await seedProposal();

    await requestOn(app)
      .post('/reconcile/reject')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);
    // The same finance window the proposal came from. An unlink here would
    // hand back the identical proposal.
    await requestOn(app).post('/reconcile/sweep').send({}).expect(200);

    const res = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(res.body.items[0].proposed).toEqual([]);
  });

  it('404s a reject for a link that is already gone', async () => {
    const chargeId = await seedProposal();
    await requestOn(app)
      .post('/reconcile/reject')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    await requestOn(app)
      .post('/reconcile/reject')
      .send({ chargeId, transactionUri: TXN })
      .expect(404);
  });

  it('removes a link on unlink', async () => {
    const chargeId = await seedProposal();
    await requestOn(app)
      .post('/reconcile/unlink')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    const res = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(res.body.items[0].proposed).toEqual([]);
  });

  it('404s a decision about a link that is no longer there', async () => {
    // The queue is a snapshot; a sweep may have re-derived since it was
    // read. Reporting success would be a lie the user discovers later.
    const chargeId = await seedProposal();
    await requestOn(app)
      .post('/reconcile/unlink')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    await requestOn(app)
      .post('/reconcile/confirm')
      .send({ chargeId, transactionUri: TXN })
      .expect(404);
  });
});

describe('the explicit sweep', () => {
  it('reports what it did', async () => {
    order(4128, 'a');
    const res = await requestOn(app).post('/reconcile/sweep').send({}).expect(200);

    expect(res.body.kind).toBe('swept');
    expect(res.body.derivedChargesMinted).toBe(1);
  });

  it('reports a skip distinctly from a sweep that found nothing', async () => {
    // A caller conflating the two would read an outage as a clean, empty
    // reconciliation.
    order(4128, 'a');
    const unavailableApp = build(FINANCE_UNAVAILABLE);
    const res = await requestOn(unavailableApp).post('/reconcile/sweep').send({}).expect(200);

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
    await requestOn(noRunner).post('/reconcile/sweep').send({}).expect(503);
  });
});
