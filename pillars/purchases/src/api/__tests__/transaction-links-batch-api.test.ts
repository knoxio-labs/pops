/**
 * The plural reverse lookup: many finance transaction URIs in, their linkage
 * out.
 *
 * The cases are chosen against the ways a batch can look right and be wrong.
 * A summary that reported "has a purchase" as one flag would pass every
 * assertion about a confirmed link and quietly report the matcher's guess as a
 * decision on every derived one — which is the whole reason `confirmedAt`
 * exists. A summary that counted charges where it claims to count orders would
 * agree with the singular route on every transaction settling one charge per
 * order, which is nearly all of them; the partly-confirmed case, one order
 * paid by two charges, is what tells the two apart.
 *
 * The last describe block is the one that keeps the two routes honest: for
 * every transaction in a fixture holding all four states, the batch's answer
 * is compared against counting `GET /reconcile/links`'s own answer for the
 * same URI. A drift between them fails there rather than in a UI six months
 * later.
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

function uri(id: string): string {
  return `pops://finance/transaction/${id}`;
}

interface WireSummary {
  transactionUri: string;
  purchaseCount: number;
  confirmedChargeCount: number;
  derivedChargeCount: number;
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

async function batch(transactionUris: string[]): Promise<WireSummary[]> {
  const res = await requestOn(app)
    .post('/reconcile/links/batch')
    .send({ transactionUris })
    .expect(200);
  return res.body.transactions as WireSummary[];
}

/** The charge behind a transaction, read through the singular route. */
async function chargeIdFor(transactionUri: string): Promise<string> {
  const res = await requestOn(app)
    .get(`/reconcile/links?transactionUri=${encodeURIComponent(transactionUri)}`)
    .expect(200);
  const chargeId: unknown = res.body.purchases[0]?.charges[0]?.charge.id;
  if (typeof chargeId !== 'string') throw new Error(`no charge behind ${transactionUri}`);
  return chargeId;
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

describe('POST /reconcile/links/batch', () => {
  it('omits a transaction no order explains rather than returning it with zeroes', async () => {
    // The ordinary answer for most of a statement. A zero-count row would be
    // an indicator a consumer has to know not to draw.
    order(4128, 'a');
    await sweepWith(financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }));

    const summaries = await batch([uri('t1'), uri('nothing-bought-this')]);

    expect(summaries.map((entry) => entry.transactionUri)).toEqual([uri('t1')]);
  });

  it('reports a link nobody confirmed as derived, not as a settled fact', async () => {
    order(4128, 'a');
    await sweepWith(financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }));

    expect(await batch([uri('t1')])).toEqual([
      {
        transactionUri: uri('t1'),
        purchaseCount: 1,
        confirmedChargeCount: 0,
        derivedChargeCount: 1,
      },
    ]);
  });

  it('moves a link to the confirmed count once a human pins it', async () => {
    order(4128, 'a');
    await sweepWith(financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }));

    await requestOn(app)
      .post('/reconcile/confirm')
      .send({ chargeId: await chargeIdFor(uri('t1')), transactionUri: uri('t1') })
      .expect(200);

    expect(await batch([uri('t1')])).toEqual([
      {
        transactionUri: uri('t1'),
        purchaseCount: 1,
        confirmedChargeCount: 1,
        derivedChargeCount: 0,
      },
    ]);
  });

  it('keeps both counts on a partly-confirmed transaction', async () => {
    // Two charges of one order, one pinned. Collapsing this either way
    // reports a decision that was not made or discards one that was.
    createPurchase(opened.db, {
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
    await requestOn(app)
      .post('/reconcile/confirm')
      .send({ chargeId: await chargeIdFor(uri('t1')), transactionUri: uri('t1') })
      .expect(200);

    expect(await batch([uri('t1')])).toEqual([
      {
        transactionUri: uri('t1'),
        purchaseCount: 1,
        confirmedChargeCount: 1,
        derivedChargeCount: 1,
      },
    ]);
  });

  it('reports a combined settlement as the several orders it is', async () => {
    // Collapsing this to one order is what the singular route refuses to do,
    // and an indicator that said "a purchase" would undo the refusal on the
    // one row where it matters most.
    order(4128, 'a');
    order(1872, 'b');
    await sweepWith(financeReturning({ id: 't1', amountCents: 6000, date: '2026-03-06' }));

    expect(await batch([uri('t1')])).toEqual([
      {
        transactionUri: uri('t1'),
        purchaseCount: 2,
        confirmedChargeCount: 0,
        derivedChargeCount: 2,
      },
    ]);
  });

  it('answers for an auto-link source, which never enters the queue at all', async () => {
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

    expect(await batch([uri('t1')])).toHaveLength(1);
  });

  it('does not leak one transaction of the batch into another', async () => {
    order(4128, 'a');
    order(9999, 'b');
    await sweepWith(
      financeReturning(
        { id: 't1', amountCents: 4128, date: '2026-03-06' },
        { id: 't2', amountCents: 9999, date: '2026-03-06' }
      )
    );

    const summaries = await batch([uri('t1'), uri('t2')]);

    expect(summaries).toHaveLength(2);
    for (const entry of summaries) expect(entry.purchaseCount).toBe(1);
  });

  it('answers in the order asked, and answers a repeated URI once', async () => {
    order(4128, 'a');
    order(9999, 'b');
    await sweepWith(
      financeReturning(
        { id: 't1', amountCents: 4128, date: '2026-03-06' },
        { id: 't2', amountCents: 9999, date: '2026-03-06' }
      )
    );

    const summaries = await batch([uri('t2'), uri('t1'), uri('t2')]);

    expect(summaries.map((entry) => entry.transactionUri)).toEqual([uri('t2'), uri('t1')]);
  });
});

describe('the batch bound', () => {
  it('accepts a full batch of 500', async () => {
    order(4128, 'a');
    await sweepWith(financeReturning({ id: 't1', amountCents: 4128, date: '2026-03-06' }));

    const filler = Array.from({ length: 499 }, (_, index) => uri(`filler-${index}`));

    expect(await batch([uri('t1'), ...filler])).toHaveLength(1);
  });

  it('refuses 501 rather than serving an unbounded read', async () => {
    const tooMany = Array.from({ length: 501 }, (_, index) => uri(`t${index}`));

    await requestOn(app)
      .post('/reconcile/links/batch')
      .send({ transactionUris: tooMany })
      .expect(400);
  });

  it('refuses an empty batch, which would answer like a batch of misses', async () => {
    await requestOn(app).post('/reconcile/links/batch').send({ transactionUris: [] }).expect(400);
  });

  it('refuses a well-formed URI from the wrong pillar', async () => {
    // Same failure the singular route guards: an inventory URI matches no
    // link, and an unvalidated batch would report it as "not a purchase".
    await requestOn(app)
      .post('/reconcile/links/batch')
      .send({ transactionUris: ['pops://inventory/item/1'] })
      .expect(400);
  });

  it('refuses the batch when one member of it is malformed', async () => {
    await requestOn(app)
      .post('/reconcile/links/batch')
      .send({ transactionUris: [uri('t1'), 't2'] })
      .expect(400);
  });
});

describe('the batch and the singular route', () => {
  /**
   * One database holding every state the two routes can disagree about: a
   * confirmed link, a derived one, a combined settlement across two orders,
   * and a transaction nothing explains.
   */
  async function arrangeEveryState(): Promise<string[]> {
    order(4128, 'confirmed-order');
    order(1500, 'derived-order');
    order(2000, 'combined-a');
    order(3000, 'combined-b');
    await sweepWith(
      financeReturning(
        { id: 'confirmed', amountCents: 4128, date: '2026-03-06' },
        { id: 'derived', amountCents: 1500, date: '2026-03-06' },
        { id: 'combined', amountCents: 5000, date: '2026-03-06' }
      )
    );
    await requestOn(app)
      .post('/reconcile/confirm')
      .send({ chargeId: await chargeIdFor(uri('confirmed')), transactionUri: uri('confirmed') })
      .expect(200);
    return [uri('confirmed'), uri('derived'), uri('combined'), uri('unexplained')];
  }

  it('says exactly what counting the singular answer says, transaction by transaction', async () => {
    const uris = await arrangeEveryState();
    const summaries = new Map((await batch(uris)).map((entry) => [entry.transactionUri, entry]));

    for (const transactionUri of uris) {
      const single = await requestOn(app)
        .get(`/reconcile/links?transactionUri=${encodeURIComponent(transactionUri)}`)
        .expect(200);
      const links: { link: { confirmedAt: string | null } }[] = single.body.purchases.flatMap(
        (entry: { charges: { link: { confirmedAt: string | null } }[] }) => entry.charges
      );

      if (links.length === 0) {
        expect(summaries.has(transactionUri)).toBe(false);
        continue;
      }
      expect(summaries.get(transactionUri)).toEqual({
        transactionUri,
        purchaseCount: single.body.purchases.length,
        confirmedChargeCount: links.filter((entry) => entry.link.confirmedAt !== null).length,
        derivedChargeCount: links.filter((entry) => entry.link.confirmedAt === null).length,
      });
    }

    // Guards the loop itself: a fixture that arranged nothing would pass
    // every comparison above by comparing nothing.
    expect(summaries.size).toBe(3);
  });
});
