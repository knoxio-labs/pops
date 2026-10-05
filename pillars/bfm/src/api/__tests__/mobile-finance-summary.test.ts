import { afterEach, describe, expect, it } from 'vitest';

import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createMobileFinanceClient } from '../finance/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

function financeSummary(windowKey: 'month' | 'all' = 'month'): Record<string, unknown> {
  const allTime = windowKey === 'all';
  return {
    window: {
      key: windowKey,
      start: allTime ? null : '2026-09-01',
      end: '2026-09-14',
      previous: allTime ? null : { start: '2026-08-01', end: '2026-08-14' },
    },
    costOfCredit: {
      total: { cents: 4259, transactionCount: 7 },
      previousTotal: allTime ? null : { cents: 1900, transactionCount: 3 },
      deltaCents: allTime ? null : 2359,
      deltaRatio: allTime ? null : 1.241578947368421,
      byAccount: [
        {
          accountId: 'amex',
          accountName: 'Amex',
          currency: 'AUD',
          archived: false,
          fees: { cents: 2500, transactionCount: 4 },
          shareOfTotal: 0.5874618455,
        },
        {
          accountId: 'anz',
          accountName: 'ANZ',
          currency: 'AUD',
          archived: false,
          fees: { cents: 1759, transactionCount: 3 },
          shareOfTotal: 0.4125381545,
        },
      ],
      byMonth: [
        {
          month: '2026-09',
          fees: { cents: 4259, transactionCount: 7 },
          byAccount: [
            { accountId: 'amex', fees: { cents: 2500, transactionCount: 4 } },
            { accountId: 'anz', fees: { cents: 1759, transactionCount: 3 } },
          ],
        },
      ],
      byTag: [
        {
          tag: 'fee:interest',
          fees: { cents: 4000, transactionCount: 5 },
          shareOfTotal: 0.9391876027,
        },
        {
          tag: 'fee:membership',
          fees: { cents: 259, transactionCount: 2 },
          shareOfTotal: 0.0608123973,
        },
      ],
    },
  };
}

function financeHandle(answer: CallResult<unknown>, calls: unknown[] = []): PillarHandleFactory {
  return <TRouter>() =>
    fakePillarHandle<TRouter>('finance', {
      summary: {
        get: (input: unknown) => {
          calls.push(input);
          return Promise.resolve(answer);
        },
      },
    });
}

function open(
  answer: CallResult<unknown>,
  capabilities: readonly string[] = DEFAULT_DEVICE_CAPABILITIES,
  calls: unknown[] = []
): { app: Express; token: string } {
  const created = createTestApp({
    finance: createMobileFinanceClient(createPillarGateway(financeHandle(answer, calls))),
  });
  apps.push(created);

  const row = deviceRow({ capabilities: serialiseDeviceCapabilities(capabilities) });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);
  return { app: created.app, token };
}

function get(app: Express, token: string, query = '') {
  return requestOn(app, (r) =>
    r.get(`/mobile/finance/summary${query}`).set('Authorization', `Bearer ${token}`)
  );
}

describe('GET /mobile/finance/summary', () => {
  it('relays the validated fee summary from Finance and preserves its query', async () => {
    const calls: unknown[] = [];
    const body = financeSummary();
    const { app, token } = open(
      { kind: 'ok', value: { data: body } },
      DEFAULT_DEVICE_CAPABILITIES,
      calls
    );

    const res = await get(app, token, '?window=month&topLimit=25');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
    expect(calls).toEqual([{ window: 'month', topLimit: 25 }]);
  });

  it('preserves the unbounded window nulls', async () => {
    const body = financeSummary('all');
    const { app, token } = open({ kind: 'ok', value: { data: body } });

    const res = await get(app, token, '?window=all');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
  });

  it('rejects invalid query values before calling Finance', async () => {
    const calls: unknown[] = [];
    const { app, token } = open(
      { kind: 'ok', value: { data: financeSummary() } },
      DEFAULT_DEVICE_CAPABILITIES,
      calls
    );

    const res = await get(app, token, '?window=quarter&topLimit=0');

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('does not report a malformed Finance response as a valid summary', async () => {
    const { app, token } = open({ kind: 'ok', value: { data: { costOfCredit: {} } } });

    const res = await get(app, token);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('bfm.upstream.contract_mismatch');
  });

  it('retains a Finance outage as a retryable response', async () => {
    const { app, token } = open({ kind: 'unavailable', pillar: 'finance' });

    const res = await get(app, token);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('gateway.upstream_unavailable');
    expect(res.body.retryable).toBe(true);
  });

  it('requires the finance transaction read capability', async () => {
    const calls: unknown[] = [];
    const capabilities = DEFAULT_DEVICE_CAPABILITIES.filter(
      (capability) => capability !== 'finance.transactions.read'
    );
    const { app, token } = open(
      { kind: 'ok', value: { data: financeSummary() } },
      capabilities,
      calls
    );

    const res = await get(app, token);

    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });
});
