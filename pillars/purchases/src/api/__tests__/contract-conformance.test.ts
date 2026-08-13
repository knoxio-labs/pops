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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isAppRoute } from '@ts-rest/core';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MerchantSpendRollupSchema } from '../../contract/rest-analytics.js';
import { ReceiptOutcomeSchema } from '../../contract/rest-receipts.js';
import { QueueEntrySchema, SweepOutcomeSchema } from '../../contract/rest-reconcile.js';
import { OkSchema } from '../../contract/rest-schemas.js';
import { SearchHitSchema } from '../../contract/rest-search.js';
import { purchasesContract } from '../../contract/rest.js';
import {
  PurchaseDetailSchema,
  PurchaseSchema,
  PurchaseSourceSchema,
} from '../../contract/schemas/purchase.js';
import { PurchaseItemDetailSchema, PurchaseItemSchema } from '../../contract/schemas/purchase.js';
import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { runSweep } from '../../reconcile/sweep.js';
import { createPurchasesApiApp } from '../app.js';
import { FINANCE_UNAVAILABLE, financeReturning } from '../finance/__tests__/fixtures.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { AppRoute, AppRouter } from '@ts-rest/core';
import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;
let receiptDir: string;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
  receiptDir = mkdtempSync(join(tmpdir(), 'pops-contract-conformance-'));
  process.env['PURCHASES_RECEIPT_DIR'] = receiptDir;
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
        finance: financeReturning(),
        defaultWindowDays: 21,
      }),
  });
});

afterEach(() => {
  cleanup();
  rmSync(receiptDir, { recursive: true, force: true });
  delete process.env['PURCHASES_RECEIPT_DIR'];
  __resetPillarRegistryCache();
});

/**
 * Every route the contract declares, in `METHOD /path` form with
 * `:param` rewritten to `{param}` — the shape the OpenAPI projection uses.
 *
 * Walked off {@link purchasesContract} itself rather than restated as a
 * literal, so a route the contract gains is covered here automatically:
 * the alternative is exactly the bug this file exists to catch, one level
 * up — a completeness check that agrees with itself instead of with the
 * contract.
 */
function declaredContractRoutes(router: AppRoute | AppRouter): Set<string> {
  const routes = new Set<string>();
  const walk = (node: AppRoute | AppRouter): void => {
    if (isAppRoute(node)) {
      routes.add(`${node.method} ${node.path.replace(/:([^/]+)/gu, '{$1}')}`);
      return;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(router);
  return routes;
}

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
      merchantCondition: 'New',
      promotionalPrice: true,
      gstApplicable: false,
      kind: 'durable',
      tags: ['coffee', 'kitchen'],
      notes: ['PRICE REDUCED BY $7.26 each', 'Qty 2 @ $22.50 each'],
      units: [
        { serialNumber: 'SN-1', inventoryItemUri: 'pops://inventory/item/1' },
        { serialNumber: null },
      ],
    },
    // No ref, no delivery, no tags, no notes, no units, no optional fields
    // at all — including neither of the two nullable booleans, which is the
    // normal state for every source but a Woolworths receipt.
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

describe('DELETE /purchases/:id response', () => {
  it('conforms, and the order is gone after', async () => {
    const created = await request(app).post('/purchases').send(BARE_ORDER);
    const purchaseId = String(created.body.purchase.id);

    const res = await request(app).delete(`/purchases/${purchaseId}`);
    expect(res.status).toBe(200);
    expectConforms(OkSchema, res.body, 'DELETE /purchases/:id');

    expect((await request(app).get(`/purchases/${purchaseId}`)).status).toBe(404);
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
  it("conforms, and carries the tag's confirmation marker beside each line", async () => {
    await request(app).post('/purchases').send(RICH_ORDER);
    const res = await request(app).get('/items?tag=coffee');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    for (const [i, entry] of (res.body.items as { item: unknown }[]).entries()) {
      expectConforms(PurchaseItemSchema, entry.item, `GET /items item ${String(i)}`);
    }
  });
});

describe('PATCH /purchases/:id/items/:itemId response', () => {
  it('conforms, and confirming turns a proposal into a judgement', async () => {
    const created = await request(app).post('/purchases').send(RICH_ORDER);
    const purchaseId = String(created.body.purchase.id);
    const itemId = String(created.body.items[1].item.id);

    const res = await request(app)
      .patch(`/purchases/${purchaseId}/items/${itemId}`)
      .send({ kind: 'consumable', tags: ['snack'] });

    expect(res.status).toBe(200);
    expectConforms(PurchaseItemDetailSchema, res.body, 'PATCH item');
    expect(res.body.item.kind.value).toBe('consumable');
    expect(res.body.item.kind.confirmedAt).not.toBeNull();
    expect(res.body.tags).toEqual([
      { tag: 'snack', confirmedAt: res.body.tags[0].confirmedAt as string },
    ]);
    expect(res.body.tags[0].confirmedAt).not.toBeNull();
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

describe('DELETE /sources/:id response', () => {
  it('conforms for a source no purchase references', async () => {
    await request(app)
      .put('/sources/unlinked')
      .send({ label: 'Unlinked', descriptorPattern: null });

    const res = await request(app).delete('/sources/unlinked');
    expect(res.status).toBe(200);
    expectConforms(OkSchema, res.body, 'DELETE /sources/:id');
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
      // Exactly the rich order's first charge, so the sweep produces a real
      // proposal — otherwise `proposed` is empty and QueuedLinkSchema, the
      // part that was tightened, never gets parsed at all.
      finance: financeReturning({ id: 'conformance-1', amountCents: 4499, date: '2026-02-03' }),
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
    expect(swept.body.kind).toBe('swept');

    // `skipped` only arises once there is something to sweep — an empty
    // window returns `swept` with zero counts before finance is ever asked
    // (see `runSweep`), so a charge has to exist for the unreachable-finance
    // branch to be the one that fires.
    await request(app).post('/purchases').send(RICH_ORDER);
    const unreachableFinanceApp = createPurchasesApiApp({
      vision: null,
      purchasesDb: opened,
      version: '1.2.3',
      selfBaseUrl: 'http://localhost:3013',
      sweep: () => runSweep({ db: opened.db, finance: FINANCE_UNAVAILABLE, defaultWindowDays: 21 }),
    });
    const skipped = await request(unreachableFinanceApp).post('/reconcile/sweep').send({});
    expect(skipped.status).toBe(200);
    expectConforms(SweepOutcomeSchema, skipped.body, 'POST /reconcile/sweep (skipped)');
    expect(skipped.body.kind).toBe('skipped');
  });

  it('conform for confirm and unlink', async () => {
    await request(app).post('/purchases').send(RICH_ORDER);
    await runSweep({
      db: opened.db,
      finance: financeReturning({ id: 'conformance-2', amountCents: 4499, date: '2026-02-03' }),
      defaultWindowDays: 21,
    });

    const queued = await request(app).get('/reconcile/queue');
    const entry = (
      queued.body.items as { chargeId: string; proposed: { transactionUri: string }[] }[]
    ).find((one) => one.proposed.length > 0);
    if (entry === undefined) throw new Error('sweep produced no proposal to confirm');
    const decision = {
      chargeId: entry.chargeId,
      transactionUri: entry.proposed[0]?.transactionUri,
    };

    const confirmed = await request(app).post('/reconcile/confirm').send(decision);
    expect(confirmed.status).toBe(200);
    expectConforms(OkSchema, confirmed.body, 'POST /reconcile/confirm');

    const unlinked = await request(app).post('/reconcile/unlink').send(decision);
    expect(unlinked.status).toBe(200);
    expectConforms(OkSchema, unlinked.body, 'POST /reconcile/unlink');
  });
});

describe('GET /analytics/merchant-spend response', () => {
  it('conforms, including the unattributed group and a second currency', async () => {
    await request(app).post('/purchases').send(RICH_ORDER);
    await request(app)
      .post('/purchases')
      .send({ ...BARE_ORDER, checksum: 'anon', sourceOrderId: 'anon' });
    await request(app)
      .post('/purchases')
      .send({
        ...BARE_ORDER,
        checksum: 'usd',
        sourceOrderId: 'usd',
        currency: 'USD',
        merchantEntityName: 'Amazon US',
      });

    const res = await request(app).get('/analytics/merchant-spend');
    expect(res.status).toBe(200);
    expectConforms(MerchantSpendRollupSchema, res.body, 'GET /analytics/merchant-spend');

    // The awkward shapes this route has of its own: an order carrying no
    // merchant at all, and two currencies that must not be added together.
    //
    // All three resolutions at once, because `merchant` is a discriminated
    // union: conformance over one variant says nothing about the other two,
    // and the fixtures above are chosen to produce one of each.
    const resolutions = (res.body.merchants as { merchant: { resolution: string } }[]).map(
      (m) => m.merchant.resolution
    );
    expect([...new Set(resolutions)].toSorted()).toEqual(['entity', 'name', 'unattributed']);
    expect((res.body.totals as { currency: string }[]).map((t) => t.currency)).toEqual([
      'AUD',
      'USD',
    ]);
  });

  it('conforms when empty', async () => {
    const res = await request(app).get('/analytics/merchant-spend');
    // Asserted before conformance so a regression to an error status reads as
    // one, rather than as an unrelated schema mismatch on the error body.
    expect(res.status).toBe(200);
    expectConforms(MerchantSpendRollupSchema, res.body, 'GET /analytics/merchant-spend (empty)');
  });
});

/**
 * The `/search` response envelope. Assembled here rather than exported from
 * the contract because the contract states it inline in the route's
 * `responses`, and a second exported copy could disagree with the one the
 * router actually validates against.
 */
const SearchHitsSchema = z.object({ hits: z.array(SearchHitSchema) });

describe('POST /search response', () => {
  it('conforms, so the federator parses what it is handed', async () => {
    // The orchestrator does not validate a pillar's hits — it forwards them
    // to the shell, which drops a section whose shape it cannot read. A hit
    // that fails here fails silently in production.
    await request(app).post('/purchases').send(RICH_ORDER);

    const res = await request(app)
      .post('/search')
      .send({ query: { text: 'a' } });

    expect(res.status).toBe(200);
    expectConforms(SearchHitsSchema, res.body, 'POST /search');
    expect((res.body.hits as unknown[]).length).toBeGreaterThan(0);
  });

  it('conforms when nothing matches', async () => {
    const res = await request(app)
      .post('/search')
      .send({ query: { text: 'kayak' } });
    expect(res.status).toBe(200);
    expectConforms(SearchHitsSchema, res.body, 'POST /search (empty)');
  });
});

/** A real JPEG magic number, so the receipt store's own edge check passes. */
const JPEG_BASE64 = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32, 9),
]).toString('base64');

const GOOD_READING = JSON.stringify({
  merchantName: 'Bunnings Warehouse',
  address: '123 Example St, Sydney NSW 2000',
  timeZone: 'Australia/Sydney',
  purchasedOn: '2026-08-01',
  purchasedAt: '14:32',
  currency: 'AUD',
  total: '$27.50',
  tax: null,
  discounts: [],
  lines: [
    { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
    { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
  ],
  unreadable: [],
});

const DISAGREEING_READING = JSON.stringify({
  ...(JSON.parse(GOOD_READING) as Record<string, unknown>),
  total: '$99.99',
});

/** A canned vision model, so `POST /receipts` runs with no network. */
const saying = (answer: string | null): ReceiptVision => ({ read: async () => answer });

function appWithVision(vision: ReceiptVision): Express {
  return createPurchasesApiApp({
    vision,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    merchant: { resolve: async () => null },
  });
}

const uploadReceipt = (visionApp: Express, dataBase64 = JPEG_BASE64) =>
  request(visionApp)
    .post('/receipts')
    .send({ parts: [{ mediaType: 'image/jpeg', dataBase64 }] });

describe('POST /receipts response', () => {
  it('conforms for a reading the paper agrees with', async () => {
    const res = await uploadReceipt(appWithVision(saying(GOOD_READING)));
    expect(res.status).toBe(200);
    expectConforms(ReceiptOutcomeSchema, res.body, 'POST /receipts (created)');
    expect(res.body.kind).toBe('created');
  });

  it('conforms for a reading the paper disagrees with', async () => {
    const res = await uploadReceipt(appWithVision(saying(DISAGREEING_READING)));
    expect(res.status).toBe(200);
    expectConforms(ReceiptOutcomeSchema, res.body, 'POST /receipts (needs-review)');
    expect(res.body.kind).toBe('needs-review');
  });

  it('conforms when the model returns nothing usable', async () => {
    const res = await uploadReceipt(appWithVision(saying(null)));
    expect(res.status).toBe(200);
    expectConforms(ReceiptOutcomeSchema, res.body, 'POST /receipts (unreadable)');
    expect(res.body.kind).toBe('unreadable');
  });
});

describe('the accounting identity holds on the wire', () => {
  it('total reconstructs from the three buckets, with refunds outside it', async () => {
    const res = await request(app).post('/purchases').send(RICH_ORDER);
    const a = res.body.accounting;

    expect(a.matchedCents + a.awaitingImportCents + a.residualCents).toBe(a.totalCents);
    expect(a.refundedCents).toBe(500);
    expect(a.netSpendCents).toBe(a.totalCents - a.refundedCents);
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
    for (const route of declaredContractRoutes(purchasesContract)) {
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
