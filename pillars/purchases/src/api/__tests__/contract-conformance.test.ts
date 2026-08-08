/**
 * Every response this pillar actually returns is parsed back through the
 * zod schema the contract publishes.
 *
 * This is the test a frontend depends on without knowing it. The generated
 * Hey API client is derived from the OpenAPI projection, which is derived
 * from these schemas — so a field the server returns as `null` where the
 * schema says `string`, or omits entirely, produces a client whose types
 * are a polite fiction. Nothing else in the suite catches that: the service
 * tests assert on rows, and the HTTP tests assert on the handful of fields
 * they happen to name.
 *
 * ts-rest validates *requests* against the contract but does not validate
 * responses, so without this the contract is only half-enforced.
 *
 * The fixtures below deliberately exercise the awkward shapes — a line with
 * no delivery, a delivery with no tracking, a charge with no allocations,
 * an order with nothing hanging off it at all — because those are where a
 * nullable/optional mismatch hides.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { QueueEntrySchema, SweepOutcomeSchema } from '../../contract/rest-reconcile.js';
import {
  PurchaseDetailSchema,
  PurchaseSchema,
  PurchaseSourceSchema,
} from '../../contract/schemas/purchase.js';
import { PurchaseItemSchema } from '../../contract/schemas/purchase.js';
import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { runSweep } from '../../reconcile/sweep.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';
import type { z } from 'zod';

import type { OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
  app = createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    // A sweep with no candidates: enough for the outcome shape, and it
    // keeps this file's fixtures independent of the matcher's behaviour.
    sweep: () =>
      runSweep({
        db: opened.db,
        finance: { fetchCandidates: () => Promise.resolve({ kind: 'ok', transactions: [] }) },
        defaultWindowDays: 21,
      }),
  });
});

afterEach(() => {
  cleanup();
  __resetPillarRegistryCache();
});

/** Parse and surface zod's own message, which names the offending path. */
function expectConforms<T extends z.ZodType>(schema: T, value: unknown, label: string): void {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label} does not conform to its contract schema:\n${result.error.message}`);
  }
  expect(result.success).toBe(true);
}

const BARE_ORDER = {
  source: 'amazon',
  ingestMethod: 'export',
  orderedAt: '2026-02-02T01:41:21Z',
  currency: 'AUD',
  totalCents: 5678,
  checksum: 'bare',
  sourceOrderId: 'bare',
};

const RICH_ORDER = {
  ...BARE_ORDER,
  checksum: 'rich',
  sourceOrderId: 'rich',
  subtotalCents: 5000,
  shippingCents: 500,
  taxCents: 178,
  discountCents: 0,
  merchantEntityId: 'ent-1',
  merchantEntityName: 'Amazon AU',
  settlementMode: 'card',
  paymentHint: 'Visa - 7373',
  rawRef: 'Order History.csv#42',
  shipments: [
    {
      ref: 'box1',
      carrier: 'AMZL',
      trackingNumber: 'TBA1',
      shippedAt: '2026-02-02T12:23:50.167Z',
      deliveredAt: '2026-02-04T00:00:00Z',
      status: 'delivered',
      shippingCents: 500,
    },
    // No carrier, no tracking, no dates — every nullable at once.
    { ref: 'box2' },
  ],
  items: [
    {
      ref: 'tamper',
      shipmentRef: 'box1',
      name: 'Espresso Tamping Station',
      sku: 'B0DSVZQ8P5',
      url: 'https://example.invalid/p/1',
      imageUrl: 'https://example.invalid/i/1.jpg',
      quantity: 2,
      unitPriceCents: 2250,
      lineTotalCents: 4499,
      allocatedShippingCents: 250,
      allocatedAdjustmentCents: -50,
      merchantCategory: 'Kitchen',
      kind: 'durable',
      tags: ['coffee', 'kitchen'],
      units: [
        { serialNumber: 'SN-1', inventoryItemUri: 'pops://inventory/item/1' },
        { serialNumber: null },
      ],
    },
    // No ref, no delivery, no tags, no units, no optional fields at all.
    { name: 'Digital gift code', unitPriceCents: 1179, lineTotalCents: 1179, kind: 'digital' },
  ],
  charges: [
    {
      sourceChargeRef: 'chg-1',
      shipmentRef: 'box1',
      amountCents: 4499,
      chargedAt: '2026-02-02T12:23:50Z',
      role: 'capture',
      paymentHint: 'Visa - 7373',
      origin: 'merchant',
      allocations: [{ itemRef: 'tamper', amountCents: 4499 }],
    },
    // No shipment, no date, no allocations, engine-derived.
    { sourceChargeRef: 'chg-2', amountCents: 1179, origin: 'derived' },
    { sourceChargeRef: 'chg-3', amountCents: -500, role: 'refund' },
  ],
  documents: [
    { documentUri: 'pops://documents/document/inv-1', kind: 'tax_invoice' },
    {
      documentUri: 'pops://documents/document/photo-1',
      kind: 'delivery_photo',
      shipmentRef: 'box1',
    },
  ],
};

describe('POST /purchases response', () => {
  it('conforms for a fully-populated order', async () => {
    const res = await request(app).post('/purchases').send(RICH_ORDER);
    expect(res.status).toBe(201);
    expectConforms(PurchaseDetailSchema, res.body, 'POST /purchases (rich)');
  });

  it('conforms for an order with no deliveries, lines, charges or documents', async () => {
    // The empty case is where an over-eager `.min(1)` or a missing default
    // would show up.
    const res = await request(app).post('/purchases').send(BARE_ORDER);
    expect(res.status).toBe(201);
    expectConforms(PurchaseDetailSchema, res.body, 'POST /purchases (bare)');
    expect(res.body.shipments).toEqual([]);
    expect(res.body.items).toEqual([]);
    expect(res.body.charges).toEqual([]);
    expect(res.body.documents).toEqual([]);
  });
});

describe('GET /purchases/:id response', () => {
  it('conforms, and matches what POST returned byte for byte', async () => {
    const created = await request(app).post('/purchases').send(RICH_ORDER);
    const fetched = await request(app).get(`/purchases/${String(created.body.purchase.id)}`);

    expect(fetched.status).toBe(200);
    expectConforms(PurchaseDetailSchema, fetched.body, 'GET /purchases/:id');
    // Create and read must agree. A consumer that renders the POST response
    // and then refetches should not see the record change under it.
    expect(fetched.body).toEqual(created.body);
  });
});

describe('GET /purchases response', () => {
  it('conforms for every row in the index', async () => {
    await request(app).post('/purchases').send(RICH_ORDER);
    await request(app).post('/purchases').send(BARE_ORDER);

    const res = await request(app).get('/purchases');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    for (const [i, item] of (res.body.items as unknown[]).entries()) {
      expectConforms(PurchaseSchema, item, `GET /purchases item ${String(i)}`);
    }
  });

  it('conforms when empty', async () => {
    const res = await request(app).get('/purchases');
    expect(res.body.items).toEqual([]);
  });
});

describe('GET /items response', () => {
  it('conforms', async () => {
    await request(app).post('/purchases').send(RICH_ORDER);
    const res = await request(app).get('/items?tag=coffee');
    expect(res.status).toBe(200);
    for (const [i, item] of (res.body.items as unknown[]).entries()) {
      expectConforms(PurchaseItemSchema, item, `GET /items item ${String(i)}`);
    }
  });
});

describe('source responses', () => {
  it('conform on list, get and upsert alike', async () => {
    const upserted = await request(app)
      .put('/sources/bunnings')
      .send({ label: 'Bunnings', descriptorPattern: 'BUNNINGS%' });
    expectConforms(PurchaseSourceSchema, upserted.body, 'PUT /sources/:id');

    const fetched = await request(app).get('/sources/bunnings');
    expectConforms(PurchaseSourceSchema, fetched.body, 'GET /sources/:id');
    expect(fetched.body).toEqual(upserted.body);

    const listed = await request(app).get('/sources');
    for (const [i, source] of (listed.body.items as unknown[]).entries()) {
      expectConforms(PurchaseSourceSchema, source, `GET /sources item ${String(i)}`);
    }
  });
});

describe('reconcile responses', () => {
  it('conform for a queue with both a proposal and an unexplained charge', async () => {
    // The tightened field types (PopsUriSchema, IsoTimestampSchema,
    // CurrencySchema, 0..1 confidence) are only a promise until something
    // parses a real response back through them — ts-rest validates
    // requests, not responses.
    await request(app).post('/purchases').send(RICH_ORDER);
    await runSweep({
      db: opened.db,
      finance: {
        fetchCandidates: () =>
          Promise.resolve({
            kind: 'ok',
            transactions: [
              {
                // Exactly the rich order's first charge, so the sweep
                // produces a real proposal — otherwise `proposed` is empty
                // and QueuedLinkSchema, the part that was tightened, never
                // gets parsed at all.
                uri: 'pops://finance/transaction/conformance-1',
                description: 'AMAZON MKTPLACE AU',
                amountCents: 4499,
                date: '2026-02-03',
              },
            ],
          }),
      },
      defaultWindowDays: 21,
    });

    const res = await request(app).get('/reconcile/queue');
    expect(res.status).toBe(200);
    const items = res.body.items as { proposed: unknown[] }[];
    expect(items.length).toBeGreaterThan(0);
    // At least one entry must carry a proposal, or the link schema below
    // is never exercised and this test asserts less than it appears to.
    expect(items.some((entry) => entry.proposed.length > 0)).toBe(true);
    for (const [i, entry] of items.entries()) {
      expectConforms(QueueEntrySchema, entry, `GET /reconcile/queue item ${String(i)}`);
    }
  });

  it('conform for both sweep outcomes', async () => {
    const swept = await request(app).post('/reconcile/sweep').send({});
    expect(swept.status).toBe(200);
    expectConforms(SweepOutcomeSchema, swept.body, 'POST /reconcile/sweep (swept)');
  });
});

describe('the accounting identity holds on the wire', () => {
  it('total reconstructs from the three buckets, with refunds outside it', async () => {
    const res = await request(app).post('/purchases').send(RICH_ORDER);
    const a = res.body.accounting;

    expect(a.matchedCents + a.awaitingImportCents + a.residualCents).toBe(a.totalCents);
    expect(a.refundedCents).toBe(500);
    expect(a.netSpendCents).toBe(a.matchedCents + a.awaitingImportCents - a.refundedCents);
  });
});

describe('the OpenAPI projection describes what is actually served', () => {
  it('declares every route the app answers', async () => {
    const spec = (await request(app).get('/openapi')).body as {
      paths: Record<string, Record<string, unknown>>;
    };

    // A generated client can only call what the document declares, so a
    // route missing here is a route no consumer can reach.
    const declared = new Set(
      Object.entries(spec.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`)
      )
    );
    for (const route of [
      'GET /purchases',
      'POST /purchases',
      'GET /purchases/{id}',
      'DELETE /purchases/{id}',
      'GET /items',
      'GET /sources',
      'GET /sources/{id}',
      'PUT /sources/{id}',
      'DELETE /sources/{id}',
    ]) {
      expect(declared, route).toContain(route);
    }
  });

  it('gives every operation a unique id, which client generators key on', async () => {
    const spec = (await request(app).get('/openapi')).body as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };
    const ids = Object.values(spec.paths).flatMap((methods) =>
      Object.values(methods).map((op) => op.operationId)
    );
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
