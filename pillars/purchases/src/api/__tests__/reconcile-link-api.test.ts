/**
 * `POST /reconcile/link` through the real app and a real database: a human
 * names the transaction that settled a charge, and the guards stop that
 * statement claiming more money than either side has left.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, persistProposedLinks, rejectLink } from '../../db/index.js';
import { runSweep } from '../../reconcile/sweep.js';
import { createPurchasesApiApp } from '../app.js';
import {
  FINANCE_UNAVAILABLE,
  financeReturning,
  type CandidateOverrides,
} from '../finance/__tests__/fixtures.js';
import { financeTransactionUri } from '../finance/wire.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../../db/index.js';
import type { FinanceClient, FinanceTransactionLookup } from '../finance/client.js';

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
});

afterEach(() => {
  cleanup();
  __resetPillarRegistryCache();
});

function appWith(finance?: FinanceTransactionLookup): Express {
  return createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    ...(finance === undefined ? {} : { finance }),
  });
}

const outflow = (id: string, amountCents: number): CandidateOverrides => ({
  id,
  amountCents: -amountCents,
  description: 'THE GOOD GUYS',
});

/** Creates an order with the given stated charges and returns their ids in order. */
function orderWithCharges(
  checksum: string,
  charges: readonly number[],
  overrides: Partial<CreatePurchaseInput> = {}
): { purchaseId: string; chargeIds: string[] } {
  const purchaseId = createPurchase(opened.db, {
    source: 'amazon',
    sourceOrderId: checksum,
    ingestMethod: 'upload',
    orderedAt: '2026-03-04T00:00:00Z',
    currency: 'AUD',
    totalCents: charges.reduce((sum, cents) => sum + cents, 0),
    checksum,
    charges: charges.map((amountCents) => ({ amountCents })),
    ...overrides,
  });
  const rows = opened.raw
    .prepare('SELECT id FROM purchase_charges WHERE purchase_id = ? ORDER BY position')
    .all(purchaseId) as { id: string }[];
  return { purchaseId, chargeIds: rows.map((row) => row.id) };
}

interface LinkRow {
  transactionUri: string;
  amountCents: number;
  linkType: string;
  confirmedAt: string | null;
}

function linksOf(chargeId: string): LinkRow[] {
  return opened.raw
    .prepare(
      `SELECT transaction_uri AS transactionUri, amount_cents AS amountCents,
              link_type AS linkType, confirmed_at AS confirmedAt
         FROM purchase_charge_links WHERE charge_id = ? ORDER BY amount_cents DESC`
    )
    .all(chargeId) as LinkRow[];
}

function link(app: Express, chargeId: string, id: string, amountCents?: number) {
  return requestOn(app)
    .post('/reconcile/link')
    .send({
      chargeId,
      transactionUri: financeTransactionUri(id),
      ...(amountCents === undefined ? {} : { amountCents }),
    });
}

describe('a manual link', () => {
  it('writes a confirmed manual link and counts the charge as matched', async () => {
    const app = appWith(financeReturning(outflow('gc1', 33700)));
    const { purchaseId, chargeIds } = orderWithCharges('gg-1', [33700]);
    const [chargeId] = chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    const res = await link(app, chargeId, 'gc1').expect(200);

    expect(res.body).toEqual({ ok: true, amountCents: 33700 });
    expect(linksOf(chargeId)).toEqual([
      {
        transactionUri: financeTransactionUri('gc1'),
        amountCents: 33700,
        linkType: 'manual',
        confirmedAt: expect.any(String),
      },
    ]);
    const detail = await requestOn(app).get(`/purchases/${purchaseId}`).expect(200);
    expect(detail.body.accounting.matchedCents).toBe(33700);
  });

  it('splits one charge across several transactions, each taking what is left', async () => {
    const app = appWith(
      financeReturning(outflow('card-a', 50000), outflow('card-b', 20000), outflow('amex', 9000))
    );
    const [chargeId] = orderWithCharges('ikea-1', [75733]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    await link(app, chargeId, 'card-a').expect(200);
    await link(app, chargeId, 'card-b').expect(200);
    const last = await link(app, chargeId, 'amex').expect(200);

    // The Amex row is larger than what the charge has left, so the default
    // takes the remainder rather than the whole transaction.
    expect(last.body.amountCents).toBe(5733);
    expect(linksOf(chargeId).map((row) => row.amountCents)).toEqual([50000, 20000, 5733]);
  });

  it('lets several charges share one transaction up to its amount', async () => {
    const app = appWith(financeReturning(outflow('combined', 800)));
    const [first] = orderWithCharges('a', [300]).chargeIds;
    const [second] = orderWithCharges('b', [500]).chargeIds;
    if (first === undefined || second === undefined) throw new Error('order has no charge');

    await link(app, first, 'combined').expect(200);
    const res = await link(app, second, 'combined').expect(200);

    expect(res.body.amountCents).toBe(500);
  });

  it('stores a refund link with the refund charge sign, against money in', async () => {
    const app = appWith(financeReturning({ id: 'refund', amountCents: 1179, type: 'refund' }));
    const [chargeId] = orderWithCharges('r', [-1179], { totalCents: 5678 }).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    const res = await link(app, chargeId, 'refund').expect(200);

    expect(res.body.amountCents).toBe(-1179);
  });

  it('replaces the charge’s derived guesses and a rejection of the same pair', async () => {
    const app = appWith(financeReturning(outflow('right', 4128)));
    const [chargeId] = orderWithCharges('d', [4128]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');
    const derived = (id: string) => ({
      chargeId,
      transactionUri: financeTransactionUri(id),
      transactionDescription: 'FROM PAYLAB WALLET',
      amountCents: 4128,
      linkType: 'exact' as const,
      confidence: 1,
      matchRuleId: null,
    });
    persistProposedLinks(opened.db, [derived('right')]);
    rejectLink(opened.db, chargeId, financeTransactionUri('right'), '2026-03-09T00:00:00Z');
    persistProposedLinks(opened.db, [derived('wrong')]);

    await link(app, chargeId, 'right').expect(200);

    expect(linksOf(chargeId).map((row) => row.transactionUri)).toEqual([
      financeTransactionUri('right'),
    ]);
    const rejections = opened.raw
      .prepare('SELECT COUNT(*) AS n FROM purchase_link_rejections WHERE charge_id = ?')
      .get(chargeId) as { n: number };
    expect(rejections.n).toBe(0);
  });

  it('survives a later sweep that cannot see the transaction', async () => {
    const finance: FinanceClient & FinanceTransactionLookup = financeReturning(
      outflow('gc1', 4128)
    );
    const app = appWith(finance);
    const [chargeId] = orderWithCharges('s', [4128]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');
    await link(app, chargeId, 'gc1').expect(200);

    await runSweep({ db: opened.db, finance: financeReturning(), defaultWindowDays: 21 });

    expect(linksOf(chargeId)).toHaveLength(1);
  });
});

describe('a manual link that claims too much', () => {
  it('refuses an amount larger than the charge has unexplained', async () => {
    const app = appWith(financeReturning(outflow('big', 5000)));
    const [chargeId] = orderWithCharges('c', [800]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    const res = await link(app, chargeId, 'big', 900).expect(409);

    expect(res.body.code).toBe('exceeds_charge');
    expect(linksOf(chargeId)).toEqual([]);
  });

  it('refuses a further link once confirmed links explain the whole charge', async () => {
    const app = appWith(financeReturning(outflow('first', 800), outflow('second', 800)));
    const [chargeId] = orderWithCharges('c', [800]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');
    await link(app, chargeId, 'first').expect(200);

    const res = await link(app, chargeId, 'second').expect(409);

    expect(res.body.code).toBe('exceeds_charge');
  });

  it('refuses an amount larger than the transaction has unclaimed', async () => {
    const app = appWith(financeReturning(outflow('small', 800)));
    const [chargeId] = orderWithCharges('c', [5000]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    const res = await link(app, chargeId, 'small', 900).expect(409);

    expect(res.body.code).toBe('exceeds_transaction');
  });

  it('refuses a transaction confirmed links have already fully claimed', async () => {
    const app = appWith(financeReturning(outflow('once', 800)));
    const [first] = orderWithCharges('a', [800]).chargeIds;
    const [second] = orderWithCharges('b', [800]).chargeIds;
    if (first === undefined || second === undefined) throw new Error('order has no charge');
    await link(app, first, 'once').expect(200);

    const res = await link(app, second, 'once').expect(409);

    expect(res.body.code).toBe('transaction_claimed');
    expect(linksOf(second)).toEqual([]);
  });

  it('refuses the same pair twice', async () => {
    const app = appWith(financeReturning(outflow('gc1', 800)));
    const [chargeId] = orderWithCharges('c', [1600]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');
    await link(app, chargeId, 'gc1').expect(200);

    const res = await link(app, chargeId, 'gc1').expect(409);

    expect(res.body.code).toBe('already_linked');
  });
});

describe('a manual link to the wrong kind of transaction', () => {
  it('refuses a capture against money coming in', async () => {
    const app = appWith(financeReturning({ id: 'topup', amountCents: 33700, type: 'transfer' }));
    const [chargeId] = orderWithCharges('c', [33700]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    const res = await link(app, chargeId, 'topup').expect(409);

    expect(res.body.code).toBe('wrong_direction');
  });

  it('refuses a transaction with no amount in the charge’s currency', async () => {
    const app = appWith(financeReturning(outflow('aud', 5000)));
    const [chargeId] = orderWithCharges('c', [5000], { currency: 'BRL' }).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    const res = await link(app, chargeId, 'aud').expect(409);

    expect(res.body.code).toBe('incomparable_currency');
  });

  it('refuses a transaction already claimed by a charge in another currency', async () => {
    // AUD 50.00 settled abroad as BRL 200.00. Once the AUD charge claims it,
    // a BRL charge would subtract AUD cents from a BRL amount and pass.
    const app = appWith(
      financeReturning({
        id: 'abroad',
        amountCents: -5000,
        foreignCurrency: 'BRL',
        foreignAmountMinor: 20000,
      })
    );
    const [aud] = orderWithCharges('aud', [5000]).chargeIds;
    const [brl] = orderWithCharges('brl', [20000], { currency: 'BRL' }).chargeIds;
    if (aud === undefined || brl === undefined) throw new Error('order has no charge');
    await link(app, aud, 'abroad').expect(200);

    const res = await link(app, brl, 'abroad').expect(409);

    expect(res.body.code).toBe('mixed_currency_claims');
    expect(linksOf(brl)).toEqual([]);
  });
});

describe('a manual link that cannot be checked', () => {
  it('404s a charge that does not exist', async () => {
    const res = await link(appWith(financeReturning(outflow('gc1', 800))), 'nope', 'gc1').expect(
      404
    );
    expect(res.body.code).toBe('charge_not_found');
  });

  it('404s a transaction finance does not have', async () => {
    const [chargeId] = orderWithCharges('c', [800]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    const res = await link(appWith(financeReturning()), chargeId, 'ghost').expect(404);

    expect(res.body.code).toBe('transaction_not_found');
  });

  it('503s without writing when finance cannot be read', async () => {
    const [chargeId] = orderWithCharges('c', [800]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    const res = await link(appWith(FINANCE_UNAVAILABLE), chargeId, 'gc1').expect(503);

    expect(res.body.code).toBe('finance_unavailable');
    expect(linksOf(chargeId)).toEqual([]);
  });

  it('503s when no finance client is wired', async () => {
    const [chargeId] = orderWithCharges('c', [800]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    await link(appWith(), chargeId, 'gc1').expect(503);
  });

  it('400s a non-positive amount rather than flipping the link’s sign', async () => {
    const [chargeId] = orderWithCharges('c', [800]).chargeIds;
    if (chargeId === undefined) throw new Error('order has no charge');

    await link(appWith(financeReturning(outflow('gc1', 800))), chargeId, 'gc1', -800).expect(400);
  });
});
