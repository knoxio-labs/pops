import { afterEach, describe, expect, it } from 'vitest';

/**
 * `PATCH /mobile/purchases/:id`, end to end through the real app, the real
 * gateway and the real wire validation — with only purchases' network
 * replaced (POPS-4258).
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import {
  MOBILE_SESSION_CAPABILITY,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
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

function fakeUpdate(answer: CallResult<unknown>): {
  factory: PillarHandleFactory;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const update = (input: unknown): Promise<CallResult<unknown>> => {
    calls.push(input);
    return Promise.resolve(answer);
  };
  return {
    calls,
    factory: <TRouter>() => fakePillarHandle<TRouter>('purchases', { purchase: { update } }),
  };
}

function openWith(
  factory: PillarHandleFactory,
  capabilities: readonly string[] = []
): { app: Express; token: string } {
  const created = createTestApp({
    purchases: createMobilePurchasesClient(createPillarGateway(factory)),
  });
  apps.push(created);

  const row = deviceRow(
    capabilities.length === 0
      ? {}
      : { capabilities: serialiseDeviceCapabilities(capabilities), capabilityMode: 'explicit' }
  );
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

function patch(app: Express, token: string, id: string, body: Record<string, unknown>) {
  return requestOn(app, (r) =>
    r.patch(`/mobile/purchases/${id}`).set('Authorization', `Bearer ${token}`).send(body)
  );
}

const BODY = {
  lines: [{ id: 'item-1', name: 'Gadget', quantity: 1, lineTotalCents: 1000 }],
  expectedUpdatedAt: '2026-09-20T00:00:00.000Z',
};

const DETAIL_VALUE = {
  edit: {
    editedAt: '2026-09-20T00:00:01.000Z',
    changes: [{ field: 'lineName', itemId: 'item-1', original: 'Widget', current: 'Gadget' }],
  },
  purchase: {
    id: 'pur-1',
    source: 'receipt',
    merchantEntityId: null,
    merchantEntityName: 'Woolworths',
    totalCents: 1000,
    subtotalCents: 1000,
    taxCents: 0,
    shippingCents: 0,
    discountCents: 0,
    surchargeCents: 0,
    currency: 'AUD',
    orderedAt: '2026-09-19T02:15:00.000Z',
    orderedAtOffsetMinutes: 600,
    status: 'awaiting_settlement',
    updatedAt: '2026-09-20T00:00:01.000Z',
  },
  items: [{ item: { id: 'item-1', name: 'Gadget', quantity: 1, lineTotalCents: 1000 } }],
  charges: [],
  accounting: {
    totalCents: 1000,
    matchedCents: 0,
    awaitingImportCents: 1000,
    residualCents: 0,
    refundedCents: 0,
    netSpendCents: 1000,
  },
  documents: [],
};

const DETAIL_ANSWER: CallResult<unknown> = { kind: 'ok', value: DETAIL_VALUE };

describe('PATCH /mobile/purchases/:id', () => {
  it('maps the updated detail and its edit record', async () => {
    const fake = fakeUpdate(DETAIL_ANSWER);
    const { app, token } = openWith(fake.factory);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe('Gadget');
    expect(res.body.edit).toEqual({
      editedAt: '2026-09-20T00:00:01.000Z',
      changes: [{ field: 'lineName', itemId: 'item-1', original: 'Widget', current: 'Gadget' }],
    });
    expect(fake.calls).toEqual([{ id: 'pur-1', ...BODY }]);
  });

  it('describes a matched transaction on the updated detail, as the read does', async () => {
    const answer: CallResult<unknown> = {
      kind: 'ok',
      value: {
        ...DETAIL_VALUE,
        charges: [
          {
            charge: {
              id: 'chg-1',
              amountCents: 1000,
              currency: 'AUD',
              chargedAt: null,
              role: 'capture',
              origin: 'merchant',
            },
            links: [
              {
                id: 'lnk-1',
                transactionUri: 'pops://finance/transaction/tx-1',
                amountCents: 1000,
                confirmedAt: null,
              },
            ],
          },
        ],
      },
    };
    const purchases = fakeUpdate(answer);
    const finance = {
      transactions: {
        list: (): CallResult<unknown> => ({
          kind: 'ok',
          value: {
            data: [
              {
                id: 'tx-1',
                description: 'WOOLWORTHS 1234',
                accountId: 'acc-1',
                amount: -10,
                date: '2026-09-19',
                type: 'purchase',
                entityName: null,
                tags: [],
              },
            ],
          },
        }),
      },
      accounts: { list: (): CallResult<unknown> => ({ kind: 'unavailable', pillar: 'finance' }) },
    };
    const factory: PillarHandleFactory = <TRouter>(pillarId: string) =>
      pillarId === 'finance'
        ? fakePillarHandle<TRouter>('finance', finance)
        : purchases.factory<TRouter>(pillarId);
    const { app, token } = openWith(factory);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(200);
    expect(res.body.charges[0].matches[0].transaction).toEqual({
      description: 'WOOLWORTHS 1234',
      date: '2026-09-19',
      amount: -10,
      accountName: null,
    });
  });

  it('403s a device without purchases.edit', async () => {
    const fake = fakeUpdate(DETAIL_ANSWER);
    const { app, token } = openWith(fake.factory, [MOBILE_SESSION_CAPABILITY]);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(403);
    expect(fake.calls).toEqual([]);
  });

  it('maps purchase_locked to its own 409 code, not a generic conflict', async () => {
    const fake = fakeUpdate({
      kind: 'conflict',
      pillar: 'purchases',
      code: 'purchase_locked',
      message: 'Purchase pur-1 is matched; merchant, date and total cannot be edited',
    });
    const { app, token } = openWith(fake.factory);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('purchase_locked');
  });

  it('maps purchase_stale to its own 409 code, distinct from purchase_locked', async () => {
    const fake = fakeUpdate({
      kind: 'conflict',
      pillar: 'purchases',
      code: 'purchase_stale',
      message: 'Purchase pur-1 was changed since this edit was opened',
    });
    const { app, token } = openWith(fake.factory);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('purchase_stale');
    expect(res.body.message).toContain('changed since');
  });

  it('falls back to upstream_conflict for a 409 that carries no known code', async () => {
    const fake = fakeUpdate({
      kind: 'conflict',
      pillar: 'purchases',
      message: 'Purchase pur-1 conflicted for a reason this build does not name',
    });
    const { app, token } = openWith(fake.factory);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('upstream_conflict');
  });

  it('passes a 404 through', async () => {
    const fake = fakeUpdate({
      kind: 'not-found',
      pillar: 'purchases',
      message: 'Purchase pur-1 not found',
    });
    const { app, token } = openWith(fake.factory);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });
});
