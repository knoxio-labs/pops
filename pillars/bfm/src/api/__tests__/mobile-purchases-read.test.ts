/**
 * The mobile purchases read surface, end to end through the real app, the real
 * gateway and the real wire validation — with only purchases' network
 * replaced.
 *
 * Four things are being defended, and every one of them fails silently rather
 * than loudly:
 *
 *   - **The row is complete.** A list row that has to be topped up with a
 *     second request per order is a list that ships slow or without
 *     thumbnails, so `itemCount` and `receiptUri` must arrive on the page.
 *   - **The day is a day.** `orderedOn` is derived from the order's own UTC
 *     offset, so a purchase made at 9pm in Perth stays on its own date no
 *     matter where the phone is standing when it renders.
 *   - **The money.** Integer cents, mirrored from purchases. A scale slip
 *     shows $84.20 as $8,420 and nothing anywhere throws.
 *   - **The degradation.** purchases being down must never render as an empty
 *     list, which is a lie the user cannot tell from the truth.
 *
 * The wire-shape assertions are exact key sets rather than `toMatchObject`.
 * The iOS client is generated from this document, so an accidental field is a
 * change to a shipped app — it must fail here, deliberately and loudly.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  MobilePurchaseDetailSchema,
  MobilePurchasesPageSchema,
} from '../../contract/rest-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createMobilePurchasesClient } from '../purchases/client.js';
import { createTestApp, type TestApp } from './harness.js';
import {
  createPurchasesReadFake,
  purchasesDetail,
  purchasesRow,
  type PurchasesFakeRow,
  type PurchasesReadFake,
} from './purchases-read-fake.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

const LIST_PATH = '/mobile/purchases';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

function openWith(factory: PillarHandleFactory): { app: Express; token: string } {
  const created = createTestApp({
    purchases: createMobilePurchasesClient(createPillarGateway(factory)),
  });
  apps.push(created);

  const row = deviceRow();
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

function openWithRows(
  rows: readonly PurchasesFakeRow[],
  detail: Readonly<Record<string, CallResult<unknown>>> = {}
): { app: Express; token: string; fake: PurchasesReadFake } {
  const fake = createPurchasesReadFake(rows, detail);
  return { ...openWith(fake.factory), fake };
}

function list(app: Express, token: string, query = '') {
  return requestOn(app, (r) =>
    r.get(`${LIST_PATH}${query}`).set('Authorization', `Bearer ${token}`)
  );
}

function one(app: Express, token: string, id: string) {
  return requestOn(app, (r) => r.get(`${LIST_PATH}/${id}`).set('Authorization', `Bearer ${token}`));
}

describe('one page of orders', () => {
  it('answers the shape the contract promises, field for field', async () => {
    const { app, token } = openWithRows([
      purchasesRow({
        id: 'pur-1',
        merchantEntityName: 'Woolworths',
        totalCents: 8420,
        currency: 'AUD',
        orderedAt: '2026-08-13T02:15:00.000Z',
        status: 'awaiting_settlement',
        itemCount: 3,
        receiptUri: 'pops://purchases/receipt/abc',
      }),
    ]);

    const res = await list(app, token);

    expect(res.status).toBe(200);
    expect(MobilePurchasesPageSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.data).toEqual([
      {
        id: 'pur-1',
        merchantName: 'Woolworths',
        totalCents: 8420,
        currency: 'AUD',
        orderedOn: '2026-08-13',
        itemCount: 3,
        status: 'awaiting_settlement',
        receiptUri: 'pops://purchases/receipt/abc',
      },
    ]);
  });

  it('carries the receipt reference on the row, so a thumbnail needs no second call', async () => {
    const { app, token, fake } = openWithRows([
      purchasesRow({ id: 'pur-1', receiptUri: 'pops://purchases/receipt/one' }),
      purchasesRow({ id: 'pur-2', receiptUri: null, orderedAt: '2026-08-12T02:15:00.000Z' }),
    ]);

    const res = await list(app, token);

    expect(res.body.data.map((row: { receiptUri: string | null }) => row.receiptUri)).toEqual([
      'pops://purchases/receipt/one',
      null,
    ]);
    // One request served the whole page. A per-row top-up would show here.
    expect(fake.listCalls).toHaveLength(1);
  });

  it('carries the line count without fetching a single order', async () => {
    const { app, token, fake } = openWithRows([purchasesRow({ id: 'pur-1', itemCount: 17 })]);

    const res = await list(app, token);

    expect(res.body.data[0].itemCount).toBe(17);
    expect(fake.listCalls).toHaveLength(1);
  });

  it('does not proxy fields the row does not draw', async () => {
    // `source`, `sourceOrderId`, `checksum`, `merchantEntityId`, the whole
    // money breakdown: a phone on cellular pays for every one of them.
    const { app, token } = openWithRows([purchasesRow({ id: 'pur-1' })]);

    const res = await list(app, token);

    expect(Object.keys(res.body.data[0]).toSorted()).toEqual([
      'currency',
      'id',
      'itemCount',
      'merchantName',
      'orderedOn',
      'receiptUri',
      'status',
      'totalCents',
    ]);
  });

  it('keeps an unattributed merchant null rather than inventing a label', async () => {
    const { app, token } = openWithRows([purchasesRow({ id: 'pur-1', merchantEntityName: null })]);

    const res = await list(app, token);

    expect(res.body.data[0].merchantName).toBeNull();
  });
});

describe('the date a row shows', () => {
  it('is the day at the order’s own offset, not at UTC', async () => {
    // 21:30 on the 13th in Perth is 13:30 UTC on the same day; the interesting
    // case is the evening one below. This pins the ordinary one first.
    const { app, token } = openWithRows([
      purchasesRow({ id: 'pur-1', orderedAt: '2026-08-13T21:30:00+08:00' }),
    ]);

    const res = await list(app, token);

    expect(res.body.data[0].orderedOn).toBe('2026-08-13');
  });

  it('does not roll a late-evening purchase into the next UTC day', async () => {
    // 23:30 on the 13th at +11:00 is 12:30 UTC on the 13th — but a naive
    // `toISOString().slice(0, 10)` on the instant would be right here and
    // wrong on the case below, so both are pinned.
    const { app, token } = openWithRows([
      purchasesRow({ id: 'pur-1', orderedAt: '2026-08-13T23:30:00+11:00' }),
    ]);

    const res = await list(app, token);

    expect(res.body.data[0].orderedOn).toBe('2026-08-13');
  });

  it('does not roll a late-evening purchase west of UTC back a day', async () => {
    // 23:30 on the 13th at -05:00 is 04:30 UTC on the 14th. The reader was
    // standing in a shop on the 13th, and that is the date the row shows.
    const { app, token } = openWithRows([
      purchasesRow({ id: 'pur-1', orderedAt: '2026-08-13T23:30:00-05:00' }),
    ]);

    const res = await list(app, token);

    expect(res.body.data[0].orderedOn).toBe('2026-08-13');
  });
});

describe('walking the pages', () => {
  const three: readonly PurchasesFakeRow[] = [
    purchasesRow({ id: 'pur-1', orderedAt: '2026-08-13T02:00:00.000Z' }),
    purchasesRow({ id: 'pur-2', orderedAt: '2026-08-12T02:00:00.000Z' }),
    purchasesRow({ id: 'pur-3', orderedAt: '2026-08-11T02:00:00.000Z' }),
  ];

  it('hands out a cursor while more rows exist and null at the end', async () => {
    const { app, token } = openWithRows(three);

    const first = await list(app, token, '?limit=2');
    expect(first.body.data.map((row: { id: string }) => row.id)).toEqual(['pur-1', 'pur-2']);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await list(app, token, `?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.data.map((row: { id: string }) => row.id)).toEqual(['pur-3']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('asks the producer for one row past the page, and no total', async () => {
    const { app, token, fake } = openWithRows(three);

    await list(app, token, '?limit=2');

    expect(fake.listCalls).toEqual([{ limit: 3, offset: 0 }]);
  });

  it('refuses a cursor it did not mint rather than restarting the list', async () => {
    // Silently restarting reads as a scroll that repeats itself forever.
    const { app, token } = openWithRows(three);

    const res = await list(app, token, '?cursor=not-a-cursor-this-server-issued');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_cursor');
  });

  it('refuses a page size past the contract cap at the edge', async () => {
    const { app, token } = openWithRows(three);

    const res = await list(app, token, '?limit=500');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_request');
  });
});

describe('one order', () => {
  it('answers the detail shape, lines included', async () => {
    const { app, token } = openWithRows([purchasesRow({ id: 'pur-1' })], {
      'pur-1': purchasesDetail({ id: 'pur-1' }),
    });

    const res = await one(app, token, 'pur-1');

    expect(res.status).toBe(200);
    expect(MobilePurchaseDetailSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.items).toEqual([
      { id: 'item-1', name: 'MILK 2L', quantity: 2, lineTotalCents: 620 },
      { id: 'item-2', name: 'BREAD', quantity: 1, lineTotalCents: 450 },
    ]);
  });

  it('counts its own lines rather than trusting a number the producer did not send', async () => {
    const { app, token } = openWithRows([purchasesRow({ id: 'pur-1' })], {
      'pur-1': purchasesDetail({
        id: 'pur-1',
        items: [{ item: { id: 'only', name: 'ONE THING', quantity: 1, lineTotalCents: 100 } }],
      }),
    });

    const res = await one(app, token, 'pur-1');

    expect(res.body.itemCount).toBe(1);
  });

  it('names the same receipt the list row did', async () => {
    const { app, token } = openWithRows([purchasesRow({ id: 'pur-1' })], {
      'pur-1': purchasesDetail({
        id: 'pur-1',
        documents: [
          {
            documentUri: 'pops://purchases/invoice/x',
            kind: 'tax_invoice',
            createdAt: '2026-08-13T02:16:00.000Z',
          },
          {
            documentUri: 'pops://purchases/receipt/first',
            kind: 'receipt',
            createdAt: '2026-08-13T02:17:00.000Z',
          },
          {
            documentUri: 'pops://purchases/receipt/second',
            kind: 'receipt',
            createdAt: '2026-08-13T02:18:00.000Z',
          },
        ],
      }),
    });

    const res = await one(app, token, 'pur-1');

    expect(res.body.receiptUri).toBe('pops://purchases/receipt/first');
  });

  it('reports no receipt rather than the first document of any kind', async () => {
    const { app, token } = openWithRows([purchasesRow({ id: 'pur-1' })], {
      'pur-1': purchasesDetail({
        id: 'pur-1',
        documents: [
          {
            documentUri: 'pops://purchases/invoice/x',
            kind: 'tax_invoice',
            createdAt: '2026-08-13T02:16:00.000Z',
          },
        ],
      }),
    });

    const res = await one(app, token, 'pur-1');

    expect(res.body.receiptUri).toBeNull();
  });

  it('carries the instant beside the day, so a detail screen can show a time', async () => {
    const { app, token } = openWithRows([purchasesRow({ id: 'pur-1' })], {
      'pur-1': purchasesDetail({ id: 'pur-1', orderedAt: '2026-08-13T23:30:00+11:00' }),
    });

    const res = await one(app, token, 'pur-1');

    expect(res.body.orderedAt).toBe('2026-08-13T23:30:00+11:00');
    expect(res.body.orderedOn).toBe('2026-08-13');
  });

  it('answers 404 for an order purchases does not hold', async () => {
    const { app, token } = openWithRows([purchasesRow({ id: 'pur-1' })]);

    const res = await one(app, token, 'pur-missing');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });
});

describe('purchases half-broken, seen from the phone', () => {
  it('never renders an outage as an empty list', async () => {
    const fake: PillarHandleFactory = () => {
      throw new Error('purchases is unreachable in this test');
    };
    const { app, token } = openWith(fake);

    const res = await list(app, token);

    expect(res.status).not.toBe(200);
    expect(res.body.data).toBeUndefined();
  });

  it('reports a producer whose answer does not match the contract as a mismatch, not as data', async () => {
    const malformed: PillarHandleFactory = <TRouter>() =>
      ({
        purchase: {
          list: () => Promise.resolve({ kind: 'ok', value: { items: [{ id: 'pur-1' }] } }),
          get: () => Promise.resolve({ kind: 'ok', value: {} }),
        },
      }) as TRouter;
    const { app, token } = openWith(malformed);

    const res = await list(app, token);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
  });
});
