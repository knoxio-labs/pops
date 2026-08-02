import request from 'supertest';
/**
 * In-process HTTP surface: probes, the OpenAPI self-description, and the
 * REST routes end to end through ts-rest's validation layer — which is
 * where the wire schema's rejections (float cents, bad currency) actually
 * fire.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

const validBody = {
  source: 'amazon',
  ingestMethod: 'export',
  orderedAt: '2026-02-02T01:41:21Z',
  currency: 'AUD',
  totalCents: 5678,
  checksum: 'http-1',
};

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
  app = createPurchasesApiApp({
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
    expect(res.body.pillars[0]).toEqual({
      id: 'purchases',
      baseUrl: 'http://localhost:3013',
    });
  });

  it('serves the committed OpenAPI projection at 3.0.x', async () => {
    const res = await request(app).get('/openapi');
    expect(res.status).toBe(200);
    expect(String(res.body.openapi)).toMatch(/^3\.0\./);
    expect(res.body.paths).toHaveProperty('/purchases');
  });
});

describe('POST /purchases', () => {
  it('creates and returns the detail envelope with a residual', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({
        ...validBody,
        items: [{ name: 'Tamping station', unitPriceCents: 4499, lineTotalCents: 4499 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.residualCents).toBe(5678);
    expect(res.body.items[0].tags).toEqual([]);
  });

  it('projects tags back out as an array', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({
        ...validBody,
        items: [
          {
            name: 'Beans',
            unitPriceCents: 2200,
            lineTotalCents: 2200,
            tags: ['groceries', 'coffee'],
          },
        ],
      });
    expect(res.body.items[0].tags).toEqual(['groceries', 'coffee']);
  });

  it('rejects fractional cents rather than rounding them', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({ ...validBody, totalCents: 56.78 });
    expect(res.status).toBe(400);
  });

  it('rejects a lowercase currency rather than admitting a second spelling of AUD', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({ ...validBody, currency: 'aud' });
    expect(res.status).toBe(400);
  });

  it('rejects a negative discount', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({ ...validBody, discountCents: -100 });
    expect(res.status).toBe(400);
  });

  it('answers 409 on a duplicate checksum so an adapter can treat it as a skip', async () => {
    await request(app).post('/purchases').send(validBody);
    const res = await request(app).post('/purchases').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_PURCHASE');
  });

  it('answers 400, not 404, for an unregistered source', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({ ...validBody, source: 'ebay' });
    expect(res.status).toBe(400);
  });
});

describe('GET /purchases', () => {
  it('404s an unknown id', async () => {
    const res = await request(app).get('/purchases/nope');
    expect(res.status).toBe(404);
  });

  it('accepts a repeated status filter', async () => {
    await request(app).post('/purchases').send(validBody);
    const res = await request(app).get('/purchases?statuses=awaiting_settlement&statuses=linked');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('accepts a single status filter without an array wrapper', async () => {
    await request(app).post('/purchases').send(validBody);
    const res = await request(app).get('/purchases?statuses=awaiting_settlement');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('rejects a status outside the vocabulary', async () => {
    const res = await request(app).get('/purchases?statuses=probably_fine');
    expect(res.status).toBe(400);
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
    expect(second.status).toBe(200);
    expect(second.body.label).toBe('Bunnings Warehouse');
    expect(second.body.autoLinkPolicy).toBe('auto');

    const list = await request(app).get('/sources');
    expect(list.body.items.filter((s: { id: string }) => s.id === 'bunnings')).toHaveLength(1);
  });

  it('refuses to delete a source that still has purchases', async () => {
    await request(app).post('/purchases').send(validBody);
    const res = await request(app).delete('/sources/amazon');
    expect(res.status).toBe(409);
  });

  it('deletes a source nothing references', async () => {
    await request(app).put('/sources/bunnings').send({ label: 'Bunnings' });
    const res = await request(app).delete('/sources/bunnings');
    expect(res.status).toBe(200);
  });

  it('rejects a settlement window of zero days', async () => {
    const res = await request(app)
      .put('/sources/bunnings')
      .send({ label: 'Bunnings', settlementWindowDays: 0 });
    expect(res.status).toBe(400);
  });
});
