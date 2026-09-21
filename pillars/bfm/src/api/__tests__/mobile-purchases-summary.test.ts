/**
 * `GET /mobile/purchases/summary`, end to end through the real perimeter and
 * the real gateway, with only purchases' network replaced.
 *
 * Three things are defended: the 200 maps `purchases`' own month-summary
 * shape onto the mobile wire shape (POPS-4269's response, trimmed and
 * renamed rather than restated); the route sits behind `purchases.read`, the
 * same capability the list and detail routes already require, not a new
 * one; and a month that is not `YYYY-MM` is refused before purchases is ever
 * asked.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  MOBILE_SESSION_CAPABILITY,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
import { MobileMonthSummarySchema } from '../../contract/rest-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createMobilePurchasesClient } from '../purchases/client.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

interface AnalyticsCall {
  month: string;
}

function fakeAnalytics(
  answer: CallResult<unknown>,
  calls: AnalyticsCall[] = []
): PillarHandleFactory {
  return <TRouter>() =>
    ({
      analytics: {
        monthSummary: (input: unknown) => {
          const month =
            input !== null && typeof input === 'object' && 'month' in input
              ? String(input.month)
              : '';
          calls.push({ month });
          return Promise.resolve(answer);
        },
      },
    }) as TRouter;
}

function open(
  factory: PillarHandleFactory,
  capabilities: readonly string[] = DEFAULT_DEVICE_CAPABILITIES
): { app: Express; token: string } {
  const created = createTestApp({
    purchases: createMobilePurchasesClient(createPillarGateway(factory)),
  });
  apps.push(created);

  const row = deviceRow({ capabilities: serialiseDeviceCapabilities(capabilities) });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

function summary(app: Express, token: string, query = '?month=2026-08') {
  return requestOn(app, (r) =>
    r.get(`/mobile/purchases/summary${query}`).set('Authorization', `Bearer ${token}`)
  );
}

/** `purchases`' own `GET /analytics/month-summary` 200 body. */
function purchasesMonthSummary(overrides: Record<string, unknown> = {}): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      month: '2026-08',
      totals: [
        {
          currency: 'AUD',
          orderCount: 4,
          accounting: {
            totalCents: 12_000,
            matchedCents: 8_000,
            awaitingImportCents: 3_000,
            residualCents: 1_000,
            refundedCents: 500,
            netSpendCents: 11_500,
          },
        },
      ],
      purchaseCount: 4,
      previousMonthTotals: null,
      unmatchedCount: 2,
      merchantLeaders: [
        {
          merchant: { resolution: 'name', entityId: null, name: 'Woolworths' },
          currency: 'AUD',
          netSpendCents: 8_000,
          orderCount: 3,
        },
      ],
      ...overrides,
    },
  };
}

describe('200 maps the pillar summary onto the wire shape', () => {
  it('answers the shape the contract promises', async () => {
    const { app, token } = open(fakeAnalytics(purchasesMonthSummary()));

    const res = await summary(app, token);

    expect(res.status).toBe(200);
    expect(MobileMonthSummarySchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toEqual({
      month: '2026-08',
      totals: [{ currency: 'AUD', orderCount: 4, totalCents: 12_000, netSpendCents: 11_500 }],
      purchaseCount: 4,
      previousMonthTotals: null,
      unmatchedCount: 2,
      merchantLeaders: [
        { merchantName: 'Woolworths', currency: 'AUD', netSpendCents: 8_000, orderCount: 3 },
      ],
    });
  });

  it('carries a null merchant name for an unattributed leader', async () => {
    const { app, token } = open(
      fakeAnalytics(
        purchasesMonthSummary({
          merchantLeaders: [
            {
              merchant: { resolution: 'unattributed', entityId: null, name: null },
              currency: 'AUD',
              netSpendCents: 500,
              orderCount: 1,
            },
          ],
        })
      )
    );

    const res = await summary(app, token);

    expect(res.status).toBe(200);
    expect(res.body.merchantLeaders[0].merchantName).toBeNull();
  });

  it('carries the previous month total when purchases reports one', async () => {
    const { app, token } = open(
      fakeAnalytics(
        purchasesMonthSummary({
          previousMonthTotals: [
            {
              currency: 'AUD',
              orderCount: 1,
              accounting: {
                totalCents: 500,
                matchedCents: 500,
                awaitingImportCents: 0,
                residualCents: 0,
                refundedCents: 0,
                netSpendCents: 500,
              },
            },
          ],
        })
      )
    );

    const res = await summary(app, token);

    expect(res.status).toBe(200);
    expect(res.body.previousMonthTotals).toEqual([
      { currency: 'AUD', orderCount: 1, totalCents: 500, netSpendCents: 500 },
    ]);
  });

  it('sends the requested month straight through', async () => {
    const calls: AnalyticsCall[] = [];
    const { app, token } = open(fakeAnalytics(purchasesMonthSummary(), calls));

    await summary(app, token, '?month=2026-03');

    expect(calls).toEqual([{ month: '2026-03' }]);
  });
});

describe('a device without the purchases read capability', () => {
  it('is refused before purchases is ever asked', async () => {
    const calls: AnalyticsCall[] = [];
    const { app, token } = open(fakeAnalytics(purchasesMonthSummary(), calls), [
      MOBILE_SESSION_CAPABILITY,
    ]);

    const res = await summary(app, token);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      code: 'capability_not_granted',
      message: expect.any(String),
      capability: 'purchases.read',
    });
    expect(calls).toEqual([]);
  });
});

describe('an unknown month format', () => {
  it.each(['2026', '2026-13', '2026-8', 'august-2026', ''])('rejects %s as a 400', async (bad) => {
    const { app, token } = open(fakeAnalytics(purchasesMonthSummary()));

    const res = await summary(app, token, `?month=${encodeURIComponent(bad)}`);

    expect(res.status).toBe(400);
  });

  it('rejects a missing month entirely', async () => {
    const { app, token } = open(fakeAnalytics(purchasesMonthSummary()));

    const res = await summary(app, token, '');

    expect(res.status).toBe(400);
  });
});
