import { afterEach, describe, expect, it } from 'vitest';

/**
 * The purchase detail's bank match (POPS-4646), end to end through the real
 * app and gateway with only purchases' and finance's networks replaced.
 *
 * Defended: the split and the charges reach the phone; every matched
 * transaction is described from ONE batched finance read however many links
 * the order has; and a finance that cannot answer costs the descriptor, not
 * the detail.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { MobilePurchaseDetailSchema } from '../../contract/rest-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createMobilePurchasesClient } from '../purchases/client.js';
import { financeAccountRow, financeRow, type FinanceFakeRow } from './finance-fake.js';
import { createTestApp, type TestApp } from './harness.js';
import { fakeCharge as charge, fakeLink as link } from './purchases-bank-match-fake.js';
import { createPurchasesReadFake, purchasesDetail, purchasesRow } from './purchases-read-fake.js';
import { requestOn } from './test-http.js';

import type { CallResult } from '@pops/pillar-sdk/server';
import type { PillarHandle } from '@pops/pillar-sdk/server';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

interface FinanceCalls {
  transactions: unknown[];
  accounts: unknown[];
}

type FinanceFailure = Exclude<CallResult<unknown>, { kind: 'ok' }>;

function financeHandle(
  rows: readonly FinanceFakeRow[],
  calls: FinanceCalls,
  failWith?: FinanceFailure
) {
  const idsOf = (input: unknown): string[] =>
    input !== null && typeof input === 'object' && 'ids' in input && Array.isArray(input.ids)
      ? input.ids.filter((id): id is string => typeof id === 'string')
      : [];
  return {
    transactions: {
      list: (input: unknown): CallResult<unknown> => {
        calls.transactions.push(input);
        if (failWith !== undefined) return failWith;
        const ids = idsOf(input);
        return { kind: 'ok', value: { data: rows.filter((row) => ids.includes(row.id)) } };
      },
    },
    accounts: {
      list: (input: unknown): CallResult<unknown> => {
        calls.accounts.push(input);
        if (failWith !== undefined) return failWith;
        return {
          kind: 'ok',
          value: {
            data: [
              financeAccountRow({ id: 'acc-up-everyday', name: 'Up Everyday', currency: 'AUD' }),
              financeAccountRow({ id: 'acc-wise', name: 'Wise EUR', currency: 'EUR' }),
            ],
          },
        };
      },
    },
  };
}

function open(
  detail: CallResult<unknown>,
  rows: readonly FinanceFakeRow[],
  failWith?: FinanceFailure
) {
  const purchases = createPurchasesReadFake([purchasesRow({ id: 'pur-1' })], { 'pur-1': detail });
  const calls: FinanceCalls = { transactions: [], accounts: [] };
  const finance = financeHandle(rows, calls, failWith);
  const factory = <TRouter>(pillarId: string): PillarHandle<TRouter> =>
    pillarId === 'finance'
      ? fakePillarHandle<TRouter>('finance', finance)
      : purchases.factory<TRouter>(pillarId);

  const created = createTestApp({
    purchases: createMobilePurchasesClient(createPillarGateway(factory)),
  });
  apps.push(created);
  const device = deviceRow();
  created.db.insert(devices).values(device).run();
  const { token } = mintAccessToken(device.id, created.accessTokenSigningKey);

  const get = () =>
    requestOn(created.app, (r) =>
      r.get('/mobile/purchases/pur-1').set('Authorization', `Bearer ${token}`)
    );
  return { get, calls };
}

const PARTIAL_ACCOUNTING = {
  totalCents: 49_800,
  matchedCents: 24_900,
  awaitingImportCents: 0,
  residualCents: 24_900,
  refundedCents: 0,
  netSpendCents: 49_800,
};

describe('the bank match on a purchase detail', () => {
  it('describes every matched transaction from one batched finance read', async () => {
    const { get, calls } = open(
      purchasesDetail({
        id: 'pur-1',
        totalCents: 49_800,
        status: 'partial',
        accounting: PARTIAL_ACCOUNTING,
        charges: [
          charge({ id: 'chg-1' }, [
            link({ id: 'lnk-1', amountCents: 20_000 }),
            link({
              id: 'lnk-2',
              transactionUri: 'pops://finance/transaction/tx-2',
              amountCents: 4_900,
              confirmedAt: '2026-09-04T00:00:00.000Z',
            }),
          ]),
          charge({ id: 'chg-2', position: 1, chargedAt: null }, []),
        ],
      }),
      [
        financeRow({ id: 'tx-1', description: 'IKEA RHODES', amount: -200, date: '2026-09-02' }),
        financeRow({ id: 'tx-2', description: 'IKEA RHODES 2', amount: -49, date: '2026-09-03' }),
      ]
    );

    const res = await get();

    expect(res.status).toBe(200);
    expect(MobilePurchaseDetailSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.accounting).toEqual(PARTIAL_ACCOUNTING);
    expect(res.body.charges).toEqual([
      {
        id: 'chg-1',
        amountCents: 24_900,
        currency: 'AUD',
        role: 'capture',
        origin: 'merchant',
        chargedOn: '2026-09-02',
        matches: [
          {
            id: 'lnk-1',
            transactionId: 'tx-1',
            amountCents: 20_000,
            matchedBy: 'automatic',
            transaction: {
              description: 'IKEA RHODES',
              date: '2026-09-02',
              amount: -200,
              currency: 'AUD',
              accountName: 'Up Everyday',
            },
          },
          {
            id: 'lnk-2',
            transactionId: 'tx-2',
            amountCents: 4_900,
            matchedBy: 'confirmed',
            transaction: {
              description: 'IKEA RHODES 2',
              date: '2026-09-03',
              amount: -49,
              currency: 'AUD',
              accountName: 'Up Everyday',
            },
          },
        ],
      },
      {
        id: 'chg-2',
        amountCents: 24_900,
        currency: 'AUD',
        role: 'capture',
        origin: 'merchant',
        chargedOn: null,
        matches: [],
      },
    ]);
    expect(calls.transactions).toEqual([{ ids: ['tx-1', 'tx-2'], limit: 2 }]);
    expect(calls.accounts).toHaveLength(1);
  });

  it('states each transaction in its own account’s currency', async () => {
    const { get } = open(
      purchasesDetail({ id: 'pur-1', charges: [charge({ id: 'chg-1' }, [link({ id: 'lnk-1' })])] }),
      [financeRow({ id: 'tx-1', accountId: 'acc-wise', amount: -170.5 })]
    );

    const res = await get();

    expect(res.body.charges[0].matches[0].transaction).toMatchObject({
      amount: -170.5,
      currency: 'EUR',
      accountName: 'Wise EUR',
    });
  });

  it('asks finance nothing for an order with no links', async () => {
    const { get, calls } = open(
      purchasesDetail({ id: 'pur-1', charges: [charge({ id: 'chg-1' }, [])] }),
      []
    );

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.charges[0].matches).toEqual([]);
    expect(calls.transactions).toEqual([]);
    expect(calls.accounts).toEqual([]);
  });

  it('keeps the detail and the links when finance is unreachable', async () => {
    const { get } = open(
      purchasesDetail({ id: 'pur-1', charges: [charge({ id: 'chg-1' }, [link({ id: 'lnk-1' })])] }),
      [],
      { kind: 'unavailable', pillar: 'finance' }
    );

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.charges[0].matches).toEqual([
      {
        id: 'lnk-1',
        transactionId: 'tx-1',
        amountCents: 24_900,
        matchedBy: 'automatic',
        transaction: null,
      },
    ]);
  });

  it('leaves a transaction finance no longer holds undescribed, and describes the rest', async () => {
    const { get } = open(
      purchasesDetail({
        id: 'pur-1',
        charges: [
          charge({ id: 'chg-1' }, [
            link({ id: 'lnk-1' }),
            link({ id: 'lnk-2', transactionUri: 'pops://finance/transaction/tx-gone' }),
          ]),
        ],
      }),
      [financeRow({ id: 'tx-1', description: 'IKEA RHODES' })]
    );

    const res = await get();

    const matches = res.body.charges[0].matches as { transaction: unknown }[];
    expect(matches[0]?.transaction).toMatchObject({ description: 'IKEA RHODES' });
    expect(matches[1]?.transaction).toBeNull();
  });

  it('refuses a producer whose charges do not match the contract', async () => {
    const { get } = open(
      purchasesDetail({
        id: 'pur-1',
        charges: [charge({ id: 'chg-1', chargedAt: 'yesterday' }, [])],
      }),
      []
    );

    const res = await get();

    expect(res.status).toBe(502);
  });
});
