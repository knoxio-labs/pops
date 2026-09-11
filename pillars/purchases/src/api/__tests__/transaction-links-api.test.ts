/**
 * The reverse lookup: a finance transaction URI in, the orders it paid for
 * out.
 *
 * The cases below are chosen against the two ways this could be built and
 * still look correct. Scanning `GET /reconcile/queue` would pass a test that
 * only ever asks about a fresh proposal and fail every one of the states a
 * finance view actually meets — a link somebody confirmed, and a charge from
 * an auto-link source that never enters the queue at all. Returning a single
 * order would pass everything except a combined settlement, which is a phase
 * of the matching ladder rather than an anomaly.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase } from '../../db/index.js';
import { runSweep } from '../../reconcile/sweep.js';
import { createPurchasesApiApp } from '../app.js';
import { financeReturning } from '../finance/__tests__/fixtures.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { FinanceClient } from '../finance/client.js';

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

const TXN = 'pops://finance/transaction/t1';

interface WireLink {
  charge: { id: string; amountCents: number };
  link: {
    transactionUri: string;
    amountCents: number;
    linkType: string;
    confirmedAt: string | null;
  };
}

interface WireLinkedPurchase {
  purchase: { id: string; sourceOrderId: string | null; source: string; totalCents: number };
  charges: WireLink[];
  linkedCents: number;
}

function order(totalCents: number, checksum: string, source = 'amazon') {
  return createPurchase(opened.db, {
    source,
    sourceOrderId: checksum,
    ingestMethod: 'export',
    orderedAt: '2026-03-04T00:00:00Z',
    currency: 'AUD',
    totalCents,
    checksum,
  });
}

async function sweepWith(finance: FinanceClient): Promise<void> {
  await runSweep({ db: opened.db, finance, defaultWindowDays: 21 });
}

async function lookup(uri: string): Promise<WireLinkedPurchase[]> {
  const res = await requestOn(app)
    .get(`/reconcile/links?transactionUri=${encodeURIComponent(uri)}`)
    .expect(200);
  expect(res.body.transactionUri).toBe(uri);
  return res.body.purchases as WireLinkedPurchase[];
}

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

describe('GET /reconcile/links', () => {
  it('answers with the order behind a derived link', async () => {
    order(4128, 'a');
    await sweepWith(financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }));

    const purchases = await lookup(TXN);

    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.purchase.sourceOrderId).toBe('a');
    expect(purchases[0]?.linkedCents).toBe(4128);
    expect(purchases[0]?.charges).toHaveLength(1);
    expect(purchases[0]?.charges[0]?.link.linkType).toBe('exact');
    // Derived rather than decided, and the response has to say so — a
    // consumer rendering this as settled reports the engine's guess as fact.
    expect(purchases[0]?.charges[0]?.link.confirmedAt).toBeNull();
  });

  it('still answers once the link is confirmed, when the queue no longer does', async () => {
    // The exact hole scanning the queue leaves: confirming a link is what
    // removes its charge from the queue, so a queue-derived lookup goes
    // blind at precisely the moment the relationship becomes certain.
    order(4128, 'a');
    await sweepWith(financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }));
    const chargeId = (await lookup(TXN))[0]?.charges[0]?.charge.id;
    expect(chargeId).toBeDefined();

    await requestOn(app)
      .post('/reconcile/confirm')
      .send({ chargeId, transactionUri: TXN })
      .expect(200);

    const queue = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(queue.body.items).toEqual([]);

    const purchases = await lookup(TXN);
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.charges[0]?.link.confirmedAt).not.toBeNull();
  });

  it('answers for an auto-link source, which never enters the queue at all', async () => {
    // ~6,000 grocery line items a year are deliberately kept out of the
    // queue (ADR-042). They are still linked, and a finance view looking at
    // a Woolworths transaction is asking about exactly those.
    await requestOn(app)
      .put('/sources/woolworths')
      .send({ label: 'Woolworths', descriptorPattern: 'WOOLWORTHS%', autoLinkPolicy: 'auto' })
      .expect(200);
    order(8765, 'shop-1', 'woolworths');
    await sweepWith(
      financeReturning({
        id: 't1',
        amountCents: 8765,
        date: '2026-03-06',
        description: 'WOOLWORTHS 1234',
      })
    );

    const queue = await requestOn(app).get('/reconcile/queue').expect(200);
    expect(queue.body.items).toEqual([]);

    const purchases = await lookup(TXN);
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.purchase.source).toBe('woolworths');
    expect(purchases[0]?.linkedCents).toBe(8765);
  });

  it('returns every order of a combined settlement, not just one', async () => {
    // One transaction, several charges. Collapsing this to a single order
    // would drop spend that really was paid for by the transaction on
    // screen, and nothing in the response would say it had happened.
    order(4128, 'a');
    order(1872, 'b');
    await sweepWith(financeReturning({ id: 't1', amountCents: 6000, date: '2026-03-06' }));

    const purchases = await lookup(TXN);

    expect(purchases).toHaveLength(2);
    expect(purchases.map((entry) => entry.purchase.sourceOrderId).toSorted()).toEqual(['a', 'b']);
    for (const entry of purchases) {
      expect(entry.charges[0]?.link.linkType).toBe('combined');
    }
    // Each order claims only its own share; together they account for the
    // whole transaction.
    expect(purchases.reduce((sum, entry) => sum + entry.linkedCents, 0)).toBe(6000);
  });

  it('sums several charges of one order into that order alone', async () => {
    const purchaseId = createPurchase(opened.db, {
      source: 'amazon',
      sourceOrderId: 'two-charges',
      ingestMethod: 'export',
      orderedAt: '2026-03-04T00:00:00Z',
      currency: 'AUD',
      totalCents: 6000,
      checksum: 'two-charges',
      charges: [
        { sourceChargeRef: 'chg-1', amountCents: 4128 },
        { sourceChargeRef: 'chg-2', amountCents: 1872 },
      ],
    });
    await sweepWith(financeReturning({ id: 't1', amountCents: 6000, date: '2026-03-06' }));

    const purchases = await lookup(TXN);

    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.purchase.id).toBe(purchaseId);
    expect(purchases[0]?.charges).toHaveLength(2);
    expect(purchases[0]?.linkedCents).toBe(6000);
  });

  it('reports a transaction no order explains as an empty 200', async () => {
    // The ordinary case for most of a statement. A 404 would make a
    // consumer treat "this was not a purchase" as a fault.
    order(4128, 'a');
    await sweepWith(financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }));

    expect(await lookup('pops://finance/transaction/unrelated')).toEqual([]);
  });

  it('does not leak a different transaction into the answer', async () => {
    order(4128, 'a');
    order(9999, 'b');
    await sweepWith(
      financeReturning(
        { id: 't1', amountCents: 4128, date: '2026-03-06' },
        { id: 't2', amountCents: 9999, date: '2026-03-06' }
      )
    );

    const first = await lookup(TXN);
    const second = await lookup('pops://finance/transaction/t2');

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]?.purchase.id).not.toBe(second[0]?.purchase.id);
  });

  it('rejects a well-formed URI from the wrong pillar', async () => {
    // The failure this catches is silent otherwise: an inventory URI is a
    // valid pops:// reference, matches no link, and comes back as an empty
    // list that reads as "no order bought this".
    await requestOn(app)
      .get('/reconcile/links?transactionUri=pops%3A%2F%2Finventory%2Fitem%2F1')
      .expect(400);
  });

  it('rejects a URI that is not a pops:// reference', async () => {
    // A malformed URI would otherwise return an empty list, which reads as
    // "no purchase" rather than "you asked the wrong question".
    await requestOn(app).get('/reconcile/links?transactionUri=t1').expect(400);
  });

  it('requires the transaction to be named at all', async () => {
    await requestOn(app).get('/reconcile/links').expect(400);
  });
});
