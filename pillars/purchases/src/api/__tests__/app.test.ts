/**
 * In-process HTTP surface: probes, the OpenAPI self-description, and the
 * REST routes end to end through ts-rest's validation layer — which is
 * where the wire schema's rejections (float cents, bad currency) actually
 * fire.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import {
  createPurchasesApiApp,
  JSON_BODY_LIMIT_BYTES,
  resolveJsonBodyLimitBytes,
  TEST_JSON_BODY_LIMIT_BYTES_ENV,
} from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

const minimalOrder = {
  source: 'amazon',
  sourceOrderId: '249-1512883-0105415',
  ingestMethod: 'export',
  orderedAt: '2026-02-02T01:41:21Z',
  currency: 'AUD',
  totalCents: 5678,
  checksum: 'http-1',
};

const fullOrder = {
  ...minimalOrder,
  shipments: [{ ref: 'box1', carrier: 'AMZL', status: 'delivered' }],
  items: [
    {
      ref: 'tamper',
      shipmentRef: 'box1',
      name: 'Espresso Tamping Station',
      sku: { value: 'B0DSVZQ8P5', scheme: 'asin' },
      unitPriceCents: 4499,
      lineTotalCents: 4499,
      kind: 'durable',
      tags: ['coffee', 'kitchen'],
      units: [{ serialNumber: 'SN-1' }],
    },
    {
      ref: 'funnel',
      shipmentRef: 'box1',
      name: 'Magnetic Dosing Funnel',
      unitPriceCents: 1179,
      lineTotalCents: 1179,
    },
  ],
  charges: [
    {
      sourceChargeRef: 'chg-1',
      shipmentRef: 'box1',
      amountCents: 5678,
      allocations: [
        { itemRef: 'tamper', amountCents: 4499 },
        { itemRef: 'funnel', amountCents: 1179 },
      ],
    },
  ],
  documents: [{ documentUri: 'pops://documents/document/inv-1', kind: 'tax_invoice' }],
};

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
  });
});

afterEach(() => {
  cleanup();
  __resetPillarRegistryCache();
});

describe('probes', () => {
  it('reports health with the build version', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, pillar: 'purchases', version: '1.2.3' });
  });

  it('fails health when the DB handle is gone rather than reporting a bogus 200', async () => {
    opened.raw.close();
    const res = await request(app).get('/health');
    expect(res.status).toBe(500);
  });

  it('lists itself in /pillars', async () => {
    const res = await request(app).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body.pillars[0]).toEqual({ id: 'purchases', baseUrl: 'http://localhost:3013' });
  });

  it('serves the committed OpenAPI projection at 3.0.x', async () => {
    const res = await request(app).get('/openapi');
    expect(res.status).toBe(200);
    expect(String(res.body.openapi)).toMatch(/^3\.0\./);
    expect(res.body.paths).toHaveProperty('/purchases');
  });
});

describe('POST /purchases', () => {
  it('returns the whole order graph on create', async () => {
    const res = await request(app).post('/purchases').send(fullOrder);

    expect(res.status).toBe(201);
    expect(res.body.shipments).toHaveLength(1);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.charges).toHaveLength(1);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.charges[0].allocations).toHaveLength(2);
    expect(res.body.items[0].units).toHaveLength(1);
  });

  it('reports the accounting split, with the charge awaiting its transaction', async () => {
    const res = await request(app).post('/purchases').send(fullOrder);
    expect(res.body.accounting).toEqual({
      totalCents: 5678,
      matchedCents: 0,
      awaitingImportCents: 5678,
      residualCents: 0,
      refundedCents: 0,
      netSpendCents: 5678,
    });
  });

  it('projects tags with their confirmation marker and computes landed cost', async () => {
    const res = await request(app).post('/purchases').send(fullOrder);
    const tamper = res.body.items.find(
      (i: { item: { sku: { value: string } | null } }) => i.item.sku?.value === 'B0DSVZQ8P5'
    );
    expect(tamper.tags.map((t: { tag: string }) => t.tag)).toEqual(['coffee', 'kitchen']);
    // Stated in the payload, so asserted — a caller supplying an item tag is
    // classifying, and nothing may later reconsider it as if it were a guess.
    for (const tag of tamper.tags) expect(tag.confirmedAt).not.toBeNull();
    expect(tamper.landedCostCents).toBe(4499);
  });

  it('stores a note exactly as sent, including the whitespace around it', async () => {
    // `notes` is documented as verbatim merchant prose, and a receipt's
    // leading indent is part of the printed text a reviewer checks a
    // reading against. The schema used to `.trim()` it, which made the
    // stored value quietly different from the submitted one.
    const padded = '  0.202 kg NET @ $2.90/kg  ';
    const res = await request(app)
      .post('/purchases')
      .send({
        ...minimalOrder,
        items: [
          {
            name: 'Loose Fuji Apples',
            unitPriceCents: 586,
            lineTotalCents: 586,
            notes: [padded],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.items[0].notes).toEqual([padded]);

    const stored = await request(app).get(`/purchases/${String(res.body.purchase.id)}`);
    expect(stored.body.items[0].notes).toEqual([padded]);
  });

  it('rejects a blank note rather than trimming it into an empty string', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({
        ...minimalOrder,
        items: [
          { name: 'Loose Fuji Apples', unitPriceCents: 586, lineTotalCents: 586, notes: ['   '] },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('rejects fractional cents rather than rounding them', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({ ...minimalOrder, totalCents: 56.78 });
    expect(res.status).toBe(400);
  });

  it('rejects a lowercase currency rather than admitting a second spelling of AUD', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({ ...minimalOrder, currency: 'aud' });
    expect(res.status).toBe(400);
  });

  it('answers 409 on a duplicate checksum so an adapter can treat it as a skip', async () => {
    await request(app).post('/purchases').send(minimalOrder);
    const res = await request(app).post('/purchases').send(minimalOrder);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_PURCHASE');
  });

  it('answers 409 DUPLICATE_PURCHASE on a re-import under a new checksum', async () => {
    // An adapter that changed how it hashes a row is still re-running the
    // same import. Asserting only the status would have hidden that this
    // used to come back as CONFLICT_UNIQUE, which an adapter branching on
    // DUPLICATE_PURCHASE to skip would treat as a hard failure.
    await request(app).post('/purchases').send(minimalOrder);
    const res = await request(app)
      .post('/purchases')
      .send({ ...minimalOrder, checksum: 'different-recipe' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_PURCHASE');
    // The message names the checksum already on file, not the one submitted.
    expect(res.body.message).toContain('http-1');
  });

  it('answers the same way whichever identity matched', async () => {
    await request(app).post('/purchases').send(minimalOrder);
    const byChecksum = await request(app).post('/purchases').send(minimalOrder);
    const byOrderId = await request(app)
      .post('/purchases')
      .send({ ...minimalOrder, checksum: 'another-recipe' });

    expect(byChecksum.body.code).toBe(byOrderId.body.code);
    expect(byChecksum.status).toBe(byOrderId.status);
  });

  it('still allows a distinct order from the same source', async () => {
    await request(app).post('/purchases').send(minimalOrder);
    const res = await request(app)
      .post('/purchases')
      .send({ ...minimalOrder, checksum: 'other', sourceOrderId: 'a-different-order' });
    expect(res.status).toBe(201);
  });

  it('does not treat two orders with no merchant order id as duplicates', async () => {
    // NULLs do not collide, so hand-entered orders are not forced to invent
    // an id — the guard must not over-reach into them.
    const bare = { ...minimalOrder, sourceOrderId: null };
    expect(
      (
        await request(app)
          .post('/purchases')
          .send({ ...bare, checksum: 'n1' })
      ).status
    ).toBe(201);
    expect(
      (
        await request(app)
          .post('/purchases')
          .send({ ...bare, checksum: 'n2' })
      ).status
    ).toBe(201);
  });

  it('answers 400, not 404, for an unregistered source', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({ ...minimalOrder, source: 'ebay' });
    expect(res.status).toBe(400);
  });
});

describe('GET /purchases', () => {
  it('404s an unknown id', async () => {
    const res = await request(app).get('/purchases/nope');
    expect(res.status).toBe(404);
  });

  it('accepts a repeated status filter', async () => {
    await request(app).post('/purchases').send(minimalOrder);
    const res = await request(app).get('/purchases?statuses=awaiting_settlement&statuses=linked');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('rejects a status outside the vocabulary', async () => {
    const res = await request(app).get('/purchases?statuses=probably_fine');
    expect(res.status).toBe(400);
  });
});

describe('GET /items', () => {
  it("finds lines by tag across orders, each with that tag's marker", async () => {
    await request(app).post('/purchases').send(fullOrder);
    const res = await request(app).get('/items?tag=coffee');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    // The identifier arrives with the namespace that says how far it
    // means anything, never as a bare string.
    expect(res.body.items[0].item.sku).toEqual({ value: 'B0DSVZQ8P5', scheme: 'asin' });
    // Without this a caller summing "everything tagged coffee" cannot tell
    // which of those labels anyone ever agreed with.
    expect(res.body.items[0].confirmedAt).not.toBeNull();
  });

  it('requires a tag', async () => {
    const res = await request(app).get('/items');
    expect(res.status).toBe(400);
  });

  it('rejects a tag that is not a lower-case slug rather than finding nothing', async () => {
    // `Coffee` and `coffee` being two tags is the drift finance already has
    // in `tag_vocabulary`. A 400 says so; an empty list would not.
    const res = await request(app).get('/items?tag=Coffee');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /purchases/:id/items/:itemId', () => {
  async function seedLine(): Promise<{ purchaseId: string; itemId: string }> {
    const created = await request(app).post('/purchases').send(fullOrder);
    return {
      purchaseId: String(created.body.purchase.id),
      // The funnel: no kind, no tags — the state every ingested line is in.
      itemId: String(created.body.items[1].item.id),
    };
  }

  it('confirms a kind and returns the line with its marker set', async () => {
    const { purchaseId, itemId } = await seedLine();
    const res = await request(app)
      .patch(`/purchases/${purchaseId}/items/${itemId}`)
      .send({ kind: 'durable' });

    expect(res.status).toBe(200);
    expect(res.body.item.kind.value).toBe('durable');
    expect(res.body.item.kind.confirmedAt).not.toBeNull();
  });

  it('retracts a confirmation to unclassified', async () => {
    const { purchaseId, itemId } = await seedLine();
    await request(app).patch(`/purchases/${purchaseId}/items/${itemId}`).send({ kind: 'durable' });

    const res = await request(app)
      .patch(`/purchases/${purchaseId}/items/${itemId}`)
      .send({ kind: null });
    expect(res.status).toBe(200);
    expect(res.body.item.kind).toBeNull();
  });

  it('rejects a kind outside the closed vocabulary', async () => {
    const { purchaseId, itemId } = await seedLine();
    const res = await request(app)
      .patch(`/purchases/${purchaseId}/items/${itemId}`)
      .send({ kind: 'vibes' });
    expect(res.status).toBe(400);
  });

  it('rejects a body that states nothing', async () => {
    const { purchaseId, itemId } = await seedLine();
    const res = await request(app).patch(`/purchases/${purchaseId}/items/${itemId}`).send({});
    expect(res.status).toBe(400);
  });

  it('404s for a line that is not on that order', async () => {
    const { purchaseId } = await seedLine();
    const res = await request(app)
      .patch(`/purchases/${purchaseId}/items/no-such-item`)
      .send({ kind: 'durable' });
    expect(res.status).toBe(404);
  });

  it('404s for an order that does not exist', async () => {
    const { itemId } = await seedLine();
    const res = await request(app)
      .patch(`/purchases/no-such-order/items/${itemId}`)
      .send({ kind: 'durable' });
    expect(res.status).toBe(404);
  });

  it('does not disturb the rest of the order', async () => {
    // The line's money, its delivery and its allocations are facts the
    // merchant stated. A classification write that touched any of them
    // would move the residual, which is the figure ADR-042 protects.
    const { purchaseId, itemId } = await seedLine();
    const before = await request(app).get(`/purchases/${purchaseId}`);
    await request(app)
      .patch(`/purchases/${purchaseId}/items/${itemId}`)
      .send({ kind: 'consumable', tags: ['snack'] });
    const after = await request(app).get(`/purchases/${purchaseId}`);

    expect(after.body.accounting).toEqual(before.body.accounting);
    expect(after.body.charges).toEqual(before.body.charges);
    expect(after.body.items[1].item.lineTotalCents).toBe(
      before.body.items[1].item.lineTotalCents as number
    );
  });
});

describe('sources', () => {
  it('upserts idempotently so a deployment seed can re-run', async () => {
    const first = await request(app)
      .put('/sources/bunnings')
      .send({ label: 'Bunnings', autoLinkPolicy: 'review' });
    const second = await request(app)
      .put('/sources/bunnings')
      .send({ label: 'Bunnings Warehouse', autoLinkPolicy: 'auto' });

    expect(first.status).toBe(200);
    expect(second.body.label).toBe('Bunnings Warehouse');
    expect(second.body.autoLinkPolicy).toBe('auto');

    const list = await request(app).get('/sources');
    expect(list.body.items.filter((s: { id: string }) => s.id === 'bunnings')).toHaveLength(1);
  });

  it('refuses to delete a source that still has orders', async () => {
    await request(app).post('/purchases').send(minimalOrder);
    const res = await request(app).delete('/sources/amazon');
    expect(res.status).toBe(409);
  });

  it('rejects a settlement window of zero days', async () => {
    const res = await request(app)
      .put('/sources/bunnings')
      .send({ label: 'Bunnings', settlementWindowDays: 0 });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /purchases/:id', () => {
  it('removes the order and reports ok', async () => {
    const created = await request(app).post('/purchases').send(fullOrder);
    const res = await request(app).delete(`/purchases/${String(created.body.purchase.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await request(app).get('/purchases')).body.items).toHaveLength(0);
  });

  it('404s an id that was never there', async () => {
    const res = await request(app).delete('/purchases/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('GET /items limit', () => {
  it('honours an explicit limit', async () => {
    await request(app)
      .post('/purchases')
      .send({
        ...minimalOrder,
        items: Array.from({ length: 5 }, (_, i) => ({
          name: `Item ${String(i)}`,
          unitPriceCents: 100,
          lineTotalCents: 100,
          tags: ['bulk'],
        })),
      });
    expect((await request(app).get('/items?tag=bulk&limit=2')).body.items).toHaveLength(2);
    expect((await request(app).get('/items?tag=bulk')).body.items).toHaveLength(5);
  });

  it('rejects a limit above the cap rather than silently truncating', async () => {
    expect((await request(app).get('/items?tag=bulk&limit=9999')).status).toBe(400);
  });
});

describe('GET /sources/:id', () => {
  it('returns a registered source', async () => {
    const res = await request(app).get('/sources/amazon');
    expect(res.status).toBe(200);
    expect(res.body.descriptorPattern).toBe('AMAZON%');
  });

  it('404s an unregistered slug', async () => {
    const res = await request(app).get('/sources/ebay');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /sources/:id', () => {
  it('deletes a source nothing references', async () => {
    await request(app).put('/sources/bunnings').send({ label: 'Bunnings' });
    expect((await request(app).delete('/sources/bunnings')).status).toBe(200);
  });

  it('404s an unregistered slug', async () => {
    expect((await request(app).delete('/sources/ebay')).status).toBe(404);
  });
});

describe('payload rejections', () => {
  it('rejects a charge allocation naming an item the payload never defined', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({
        ...minimalOrder,
        checksum: 'bad-ref',
        sourceOrderId: 'bad-ref',
        items: [{ ref: 'a', name: 'A', unitPriceCents: 100, lineTotalCents: 100 }],
        charges: [
          {
            sourceChargeRef: 'c',
            amountCents: 100,
            allocations: [{ itemRef: 'typo', amountCents: 100 }],
          },
        ],
      });
    // A client payload error, not a server fault. A 500 would leave an
    // adapter unable to tell a bad payload from a broken pillar.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INGEST_PAYLOAD');
  });

  it('rejects two lines claiming the same ref', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({
        ...minimalOrder,
        checksum: 'dupe-ref',
        sourceOrderId: 'dupe-ref',
        items: [
          { ref: 'a', name: 'A', unitPriceCents: 100, lineTotalCents: 100 },
          { ref: 'a', name: 'B', unitPriceCents: 200, lineTotalCents: 200 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INGEST_PAYLOAD');
  });

  it("rejects an explicit ref that collides with another line's positional key", async () => {
    // The silent-corruption case: line 0 has no ref so it registers under
    // '0'; line 1 declares ref '0'. Overwriting would attach line 1's
    // charge money to line 0, and the order would still balance.
    const res = await request(app)
      .post('/purchases')
      .send({
        ...minimalOrder,
        checksum: 'colliding-ref',
        sourceOrderId: 'colliding-ref',
        items: [
          { name: 'Positional', unitPriceCents: 100, lineTotalCents: 100 },
          { ref: '0', name: 'Explicit', unitPriceCents: 200, lineTotalCents: 200 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INGEST_PAYLOAD');
  });

  it('rejects a shipment status outside the vocabulary', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({ ...minimalOrder, checksum: 'bad-status', shipments: [{ ref: 'b', status: 'lost' }] });
    expect(res.status).toBe(400);
  });

  it('rejects a negative quantity', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({
        ...minimalOrder,
        checksum: 'bad-qty',
        items: [{ name: 'A', quantity: -1, unitPriceCents: 100, lineTotalCents: 100 }],
      });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown document kind', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({
        ...minimalOrder,
        checksum: 'bad-doc',
        documents: [{ documentUri: 'pops://documents/document/x', kind: 'vibes' }],
      });
    expect(res.status).toBe(400);
  });
});

describe('resolveJsonBodyLimitBytes', () => {
  it('keeps the real default when the override is unset', () => {
    expect(resolveJsonBodyLimitBytes({})).toBe(JSON_BODY_LIMIT_BYTES);
    expect(resolveJsonBodyLimitBytes({ [TEST_JSON_BODY_LIMIT_BYTES_ENV]: '' })).toBe(
      JSON_BODY_LIMIT_BYTES
    );
  });

  it('keeps the real default on a value that does not parse as a positive integer', () => {
    expect(resolveJsonBodyLimitBytes({ [TEST_JSON_BODY_LIMIT_BYTES_ENV]: 'not-a-number' })).toBe(
      JSON_BODY_LIMIT_BYTES
    );
    expect(resolveJsonBodyLimitBytes({ [TEST_JSON_BODY_LIMIT_BYTES_ENV]: '0' })).toBe(
      JSON_BODY_LIMIT_BYTES
    );
    expect(resolveJsonBodyLimitBytes({ [TEST_JSON_BODY_LIMIT_BYTES_ENV]: '-5' })).toBe(
      JSON_BODY_LIMIT_BYTES
    );
  });

  it('honours a valid override — a live-seam suite exercising the real ceiling without a huge body', () => {
    expect(resolveJsonBodyLimitBytes({ [TEST_JSON_BODY_LIMIT_BYTES_ENV]: '4096' })).toBe(4096);
  });

  it('stays closed in production even if the override is set', () => {
    expect(
      resolveJsonBodyLimitBytes({
        [TEST_JSON_BODY_LIMIT_BYTES_ENV]: '4096',
        NODE_ENV: 'production',
      })
    ).toBe(JSON_BODY_LIMIT_BYTES);
  });
});

describe('the body-limit override, wired through the real middleware', () => {
  const envKey = TEST_JSON_BODY_LIMIT_BYTES_ENV;
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env[envKey];
    process.env[envKey] = '2048';
  });

  afterEach(() => {
    if (previous === undefined) delete process.env[envKey];
    else process.env[envKey] = previous;
  });

  it('refuses a body only the override, not the real 20mb default, would reject', async () => {
    const overridden = createPurchasesApiApp({
      vision: null,
      purchasesDb: opened,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3013',
    });

    const res = await request(overridden)
      .post('/purchases')
      .send({ ...minimalOrder, checksum: 'x'.repeat(4000) });

    expect(res.status).toBe(413);
  });
});

describe('source handler edge paths', () => {
  it('rejects an upsert with an empty label rather than storing a blank source', async () => {
    const res = await request(app).put('/sources/bunnings').send({ label: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown auto-link policy', async () => {
    const res = await request(app)
      .put('/sources/bunnings')
      .send({ label: 'Bunnings', autoLinkPolicy: 'sometimes' });
    expect(res.status).toBe(400);
  });

  it('clears a descriptor pattern when the caller passes null', async () => {
    await request(app)
      .put('/sources/bunnings')
      .send({ label: 'Bunnings', descriptorPattern: 'BUNNINGS%' });
    const res = await request(app)
      .put('/sources/bunnings')
      .send({ label: 'Bunnings', descriptorPattern: null });
    expect(res.status).toBe(200);
    expect(res.body.descriptorPattern).toBeNull();
  });

  it('reports an empty list before any source beyond the seed exists', async () => {
    const res = await request(app).get('/sources');
    expect(res.body.items.map((s: { id: string }) => s.id)).toEqual(['amazon']);
  });
});

describe('purchase handler edge paths', () => {
  it('paginates the index deterministically', async () => {
    for (const n of [1, 2, 3]) {
      await request(app)
        .post('/purchases')
        .send({
          ...minimalOrder,
          checksum: `p${String(n)}`,
          sourceOrderId: `p${String(n)}`,
          orderedAt: `2026-0${String(n)}-01T00:00:00Z`,
        });
    }
    const page1 = await request(app).get('/purchases?limit=2&offset=0');
    const page2 = await request(app).get('/purchases?limit=2&offset=2');

    expect(page1.body.items.map((p: { checksum: string }) => p.checksum)).toEqual(['p3', 'p2']);
    expect(page2.body.items.map((p: { checksum: string }) => p.checksum)).toEqual(['p1']);
  });

  it('filters by source', async () => {
    await request(app).post('/purchases').send(minimalOrder);
    expect((await request(app).get('/purchases?sources=amazon')).body.items).toHaveLength(1);
    expect((await request(app).get('/purchases?sources=ebay')).body.items).toHaveLength(0);
  });

  it('bounds an orderedAt range inclusively', async () => {
    await request(app).post('/purchases').send(minimalOrder);
    const inside = await request(app).get(
      '/purchases?from=2026-02-02T01:41:21Z&to=2026-02-02T01:41:21Z'
    );
    const outside = await request(app).get('/purchases?from=2026-03-01T00:00:00Z');
    expect(inside.body.items).toHaveLength(1);
    expect(outside.body.items).toHaveLength(0);
  });

  it('rejects a non-ISO range bound rather than silently matching nothing', async () => {
    expect((await request(app).get('/purchases?from=last%20tuesday')).status).toBe(400);
  });

  describe('the merchant filter a roll-up row opens', () => {
    async function seedMerchants(): Promise<void> {
      const merchants = [
        { merchantEntityId: 'ent-woolies', merchantEntityName: 'Woolworths' },
        { merchantEntityId: null, merchantEntityName: 'Woolworths' },
        { merchantEntityId: null, merchantEntityName: null },
      ];
      for (const [index, merchant] of merchants.entries()) {
        await request(app)
          .post('/purchases')
          .send({
            ...minimalOrder,
            ...merchant,
            checksum: `merchant-${String(index)}`,
            sourceOrderId: `merchant-${String(index)}`,
          });
      }
    }

    function checksums(body: { items: { checksum: string }[] }): string[] {
      return body.items.map((item) => item.checksum);
    }

    it('opens an entity group without the label group that shares its name', async () => {
      await seedMerchants();
      const res = await request(app).get('/purchases?merchantEntityId=ent-woolies');

      expect(res.status).toBe(200);
      expect(checksums(res.body)).toEqual(['merchant-0']);
    });

    it('opens a label group without the entity group that shares its name', async () => {
      await seedMerchants();
      const res = await request(app).get('/purchases?merchantEntityName=Woolworths');

      expect(res.status).toBe(200);
      expect(checksums(res.body)).toEqual(['merchant-1']);
    });

    it('opens the unattributed bucket', async () => {
      await seedMerchants();
      const res = await request(app).get('/purchases?merchantUnattributed=true');

      expect(res.status).toBe(200);
      expect(checksums(res.body)).toEqual(['merchant-2']);
    });

    // A client sending its control's state unconditionally must not thereby
    // forbid the other two parameters, so `false` is the absence of a filter
    // rather than a request to exclude the bucket.
    it('treats merchantUnattributed=false as no merchant filter at all', async () => {
      await seedMerchants();
      const res = await request(app).get(
        '/purchases?merchantUnattributed=false&merchantEntityName=Woolworths'
      );

      expect(res.status).toBe(200);
      expect(checksums(res.body)).toEqual(['merchant-1']);
    });

    it('refuses two merchant parameters rather than answering one of them', async () => {
      await seedMerchants();
      const res = await request(app).get(
        '/purchases?merchantEntityId=ent-woolies&merchantEntityName=Woolworths'
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MERCHANT_FILTER_CONFLICT');
      expect(res.body.message).toContain('merchantEntityId');
      expect(res.body.message).toContain('merchantEntityName');
    });

    it('refuses the same combination on the roll-up the row came from', async () => {
      await seedMerchants();
      const res = await request(app).get(
        '/analytics/merchant-spend?merchantEntityName=Woolworths&merchantUnattributed=true'
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MERCHANT_FILTER_CONFLICT');
    });

    it('scopes a roll-up to one merchant, so a row and its orders agree', async () => {
      await seedMerchants();
      const rollup = await request(app).get(
        '/analytics/merchant-spend?merchantEntityName=Woolworths&currency=AUD'
      );
      const orders = await request(app).get(
        '/purchases?merchantEntityName=Woolworths&currency=AUD'
      );

      expect(rollup.body.merchants).toHaveLength(1);
      expect(rollup.body.merchants[0].orderCount).toBe(orders.body.items.length);
    });

    it('rejects a currency that is not an ISO code rather than matching nothing', async () => {
      expect((await request(app).get('/purchases?currency=dollars')).status).toBe(400);
    });

    // The leaderboard takes the roll-up's whole scope vocabulary, so a
    // parameter it advertises and ignores would answer a narrowed question
    // with the unnarrowed figure. `amazon` keys chain-wide, so both orders
    // land in one group and an ignored filter shows up as orderCount 2.
    async function seedSameSkuAtTwoMerchants(): Promise<void> {
      const merchants = ['Woolworths', 'Coles'];
      for (const [index, merchantEntityName] of merchants.entries()) {
        await request(app)
          .post('/purchases')
          .send({
            ...minimalOrder,
            merchantEntityName,
            checksum: `leaderboard-${String(index)}`,
            sourceOrderId: `leaderboard-${String(index)}`,
            items: [
              {
                ref: 'pods',
                name: 'Coffee Pods',
                sku: { value: 'B0POD', scheme: 'merchant' },
                unitPriceCents: 1200,
                lineTotalCents: 1200,
              },
            ],
          });
      }
    }

    it('scopes the leaderboard to one merchant rather than counting both', async () => {
      await seedSameSkuAtTwoMerchants();
      const scoped = await request(app).get(
        '/analytics/product-leaderboard?merchantEntityName=Woolworths'
      );
      const unscoped = await request(app).get('/analytics/product-leaderboard');

      expect(unscoped.body.products).toHaveLength(1);
      expect(unscoped.body.products[0].orderCount).toBe(2);
      expect(scoped.body.products).toHaveLength(1);
      expect(scoped.body.products[0].orderCount).toBe(1);
    });

    it('refuses two merchant parameters on the leaderboard as well', async () => {
      await seedSameSkuAtTwoMerchants();
      const res = await request(app).get(
        '/analytics/product-leaderboard?merchantEntityId=ent-woolies&merchantEntityName=Woolworths'
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MERCHANT_FILTER_CONFLICT');
    });
  });

  it('rejects a malformed pops:// document uri', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({
        ...minimalOrder,
        checksum: 'bad-uri',
        sourceOrderId: 'bad-uri',
        documents: [{ documentUri: 'https://example.com/invoice.pdf' }],
      });
    expect(res.status).toBe(400);
  });

  it('rejects a non-ISO orderedAt', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({ ...minimalOrder, checksum: 'bad-date', orderedAt: '2 Feb 2026' });
    expect(res.status).toBe(400);
  });
});
