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

const DETAIL_ANSWER: CallResult<unknown> = {
  kind: 'ok',
  value: {
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
    documents: [],
  },
};

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

  it('403s a device without purchases.edit', async () => {
    const fake = fakeUpdate(DETAIL_ANSWER);
    const { app, token } = openWith(fake.factory, [MOBILE_SESSION_CAPABILITY]);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(403);
    expect(fake.calls).toEqual([]);
  });

  it('maps purchase_locked to 409 upstream_conflict', async () => {
    const fake = fakeUpdate({
      kind: 'conflict',
      pillar: 'purchases',
      message: 'Purchase pur-1 is matched; merchant, date and total cannot be edited',
    });
    const { app, token } = openWith(fake.factory);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('upstream_conflict');
  });

  it('maps purchase_stale to 409 upstream_conflict', async () => {
    const fake = fakeUpdate({
      kind: 'conflict',
      pillar: 'purchases',
      message: 'Purchase pur-1 was changed since this edit was opened',
    });
    const { app, token } = openWith(fake.factory);

    const res = await patch(app, token, 'pur-1', BODY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('upstream_conflict');
    expect(res.body.message).toContain('changed since');
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
