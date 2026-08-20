/**
 * `POST /purchases/:id/documents` — the route that lets evidence reach an
 * order the caller did not just create.
 *
 * The case that matters is the backfill's: an order is ingested, an invoice
 * is attached to it afterwards, and the same attach is made again. The second
 * one has to be a 409 rather than a second row, because that is the whole of
 * what makes re-running the Amazon backfill safe.
 */
import { afterEach, beforeEach, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, getPurchase } from '../../db/index.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

const { requestOn } = createTestTransport();

const INVOICE_URI = 'pops://purchases/receipt/sha256-8f14e45fceea167a5a36dedd4bea2543';
const OTHER_URI = 'pops://purchases/receipt/sha256-c4ca4238a0b923820dcc509a6f75849b';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;
let purchaseId: string;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  purchaseId = createPurchase(opened.db, amazonOrder());
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

function attach(id: string, body: object) {
  return requestOn(app).post(`/purchases/${id}/documents`).send(body);
}

function documentsOn(id: string) {
  return getPurchase(opened.db, id)?.documents ?? [];
}

it('attaches an invoice to an order that was ingested earlier', async () => {
  const res = await attach(purchaseId, {
    documentUri: INVOICE_URI,
    kind: 'tax_invoice',
  }).expect(201);

  expect(res.body.document).toMatchObject({
    purchaseId,
    documentUri: INVOICE_URI,
    kind: 'tax_invoice',
    shipmentId: null,
    documentStaleAt: null,
  });
  expect(documentsOn(purchaseId)).toHaveLength(1);
});

it('refuses the same invoice twice with a 409 rather than writing a twin', async () => {
  await attach(purchaseId, { documentUri: INVOICE_URI, kind: 'tax_invoice' }).expect(201);

  const repeat = await attach(purchaseId, { documentUri: INVOICE_URI, kind: 'tax_invoice' }).expect(
    409
  );

  expect(repeat.body.code).toBe('DOCUMENT_ALREADY_ATTACHED');
  expect(documentsOn(purchaseId)).toHaveLength(1);
});

it('refuses a repeat that arrives under a different kind', async () => {
  await attach(purchaseId, { documentUri: INVOICE_URI, kind: 'tax_invoice' }).expect(201);

  await attach(purchaseId, { documentUri: INVOICE_URI, kind: 'receipt' }).expect(409);

  expect(documentsOn(purchaseId).map((row) => row.kind)).toEqual(['tax_invoice']);
});

it('keeps two genuinely different invoices on one order', async () => {
  await attach(purchaseId, { documentUri: INVOICE_URI, kind: 'tax_invoice' }).expect(201);
  await attach(purchaseId, { documentUri: OTHER_URI, kind: 'tax_invoice' }).expect(201);

  expect(documentsOn(purchaseId)).toHaveLength(2);
});

it('lets the same invoice reach two different orders', async () => {
  const second = createPurchase(
    opened.db,
    amazonOrder({ sourceOrderId: '249-0000000-0000000', checksum: 'amazon:second' })
  );

  await attach(purchaseId, { documentUri: INVOICE_URI, kind: 'tax_invoice' }).expect(201);
  await attach(second, { documentUri: INVOICE_URI, kind: 'tax_invoice' }).expect(201);

  expect(documentsOn(second)).toHaveLength(1);
});

it('defaults an unstated kind to other, as ingest does', async () => {
  const res = await attach(purchaseId, { documentUri: INVOICE_URI }).expect(201);

  expect(res.body.document.kind).toBe('other');
});

it('answers 404 for an order that is not here, and writes nothing', async () => {
  const res = await attach('no-such-order', {
    documentUri: INVOICE_URI,
    kind: 'tax_invoice',
  }).expect(404);

  expect(res.body.code).toBe('NOT_FOUND');
  expect(documentsOn(purchaseId)).toHaveLength(0);
});

it('refuses a URI that is not a pops URI', async () => {
  await attach(purchaseId, { documentUri: 'https://example.com/invoice.pdf' }).expect(400);

  expect(documentsOn(purchaseId)).toHaveLength(0);
});

it('refuses a kind outside the vocabulary', async () => {
  await attach(purchaseId, { documentUri: INVOICE_URI, kind: 'not-a-kind' }).expect(400);

  expect(documentsOn(purchaseId)).toHaveLength(0);
});

it('reaches an order the create path would now refuse at the checksum', async () => {
  const duplicate = await requestOn(app).post('/purchases').send(amazonOrder()).expect(409);
  expect(duplicate.body.code).toBe('DUPLICATE_PURCHASE');

  await attach(purchaseId, { documentUri: INVOICE_URI, kind: 'tax_invoice' }).expect(201);

  expect(documentsOn(purchaseId)).toHaveLength(1);
});
