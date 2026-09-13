/**
 * Extracting a receipt into an editable draft, and saving one — or a manual
 * entry — as a purchase (POPS-2454).
 *
 * Same posture as `receipt-upload.test.ts`: a real Express app over
 * supertest, a real migrated SQLite file, a canned vision model. What this
 * file proves that the upload tests do not: extraction persists nothing,
 * saving a draft or a manual entry DOES persist exactly once per
 * idempotency key, a manual entry never lands under the receipt source, and
 * an inconsistent or duplicate write is refused before anything is written.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { RECEIPT_SOURCE_ID } from '../../ingest/receipt/purchase.js';
import { MANUAL_SOURCE_ID } from '../../ingest/source-ids.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';
import type { MerchantResolver } from '../contacts/merchant.js';

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

/** A reading whose lines do not sum to the stated total. */
const MISMATCHED_READING = JSON.stringify({
  ...JSON.parse(GOOD_READING),
  total: '$99.00',
});

const saying = (answer: string | null): ReceiptVision => ({ read: async () => answer });
const NO_MERCHANT: MerchantResolver = { resolve: async () => null };

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let dataDir: string;

function appWith(vision: ReceiptVision | null, merchant: MerchantResolver = NO_MERCHANT): Express {
  return createPurchasesApiApp({
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    vision,
    merchant,
  });
}

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  dataDir = mkdtempSync(join(tmpdir(), 'pops-draft-'));
  process.env['PURCHASES_SQLITE_PATH'] = join(dataDir, 'purchases.db');
  mkdirSync(join(dataDir, 'receipts'), { recursive: true });
  __resetPillarRegistryCache();
});

afterEach(() => {
  cleanup();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env['PURCHASES_SQLITE_PATH'];
  __resetPillarRegistryCache();
});

const extract = (app: Express, dataBase64 = JPEG_BASE64) =>
  requestOn(app)
    .post('/receipts/extract')
    .send({ parts: [{ mediaType: 'image/jpeg', dataBase64 }] });

describe('POST /receipts/extract', () => {
  it('reads an admissible receipt into a draft and persists no purchase', async () => {
    const response = await extract(appWith(saying(GOOD_READING)));

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('draft');
    expect(response.body.reconciled).toBe(true);
    expect(response.body.failures).toEqual([]);
    expect(response.body.draft.totalCents).toBe(2750);
    expect(response.body.draft.items).toHaveLength(2);
    // No provenance fields — the caller decides those at save time.
    expect(response.body.draft.source).toBeUndefined();
    expect(response.body.draft.ingestMethod).toBeUndefined();

    const list = await requestOn(appWith(saying(GOOD_READING))).get('/purchases');
    expect(list.body.items).toEqual([]);
  });

  it('reads an inadmissible receipt into the same draft shape, with its objections', async () => {
    const response = await extract(appWith(saying(MISMATCHED_READING)));

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('draft');
    expect(response.body.reconciled).toBe(false);
    expect(response.body.failures.length).toBeGreaterThan(0);
    // Every usable outcome reaches the same editable fields.
    expect(response.body.draft.items).toHaveLength(2);
  });

  it('answers unreadable when the model returns nothing usable', async () => {
    const response = await extract(appWith(saying(null)));
    expect(response.body.kind).toBe('unreadable');
  });

  it('refuses to re-extract a file that already became a purchase', async () => {
    const app = appWith(saying(GOOD_READING));
    const first = await extract(app);
    await requestOn(app)
      .post('/receipts/draft')
      .send({
        ...first.body.draft,
        documents: first.body.draft.documents,
        idempotencyKey: 'save-1',
      });

    const second = await extract(app, JPEG_BASE64);
    expect(second.status).toBe(409);
  });
});

const saveDraft = (app: Express, overrides: Record<string, unknown> = {}) =>
  requestOn(app)
    .post('/receipts/draft')
    .send({
      merchantEntityName: 'Bunnings Warehouse',
      orderedAt: '2026-08-01T14:32:00+10:00',
      currency: 'AUD',
      totalCents: 2750,
      items: [
        { name: 'Timber Pine DAR 42x19', unitPriceCents: 1250, lineTotalCents: 1250 },
        { name: 'Screws Bugle 8g 65mm', unitPriceCents: 1500, lineTotalCents: 1500 },
      ],
      documents: [{ documentUri: 'pops://purchases/receipt/' + 'a'.repeat(64), kind: 'receipt' }],
      idempotencyKey: 'draft-key-1',
      ...overrides,
    });

describe('POST /receipts/draft', () => {
  it('persists a corrected draft under the receipt source', async () => {
    const response = await saveDraft(appWith(saying(GOOD_READING)));

    expect(response.status).toBe(200);
    expect(response.body.purchase.source).toBe(RECEIPT_SOURCE_ID);
    expect(response.body.purchase.ingestMethod).toBe('upload');
    expect(response.body.purchase.totalCents).toBe(2750);
  });

  it('reflects an edit the reviewer made — a corrected total the model never read', async () => {
    const response = await saveDraft(appWith(saying(GOOD_READING)), {
      totalCents: 3000,
      items: [
        { name: 'Timber Pine DAR 42x19', unitPriceCents: 1250, lineTotalCents: 1250 },
        { name: 'Screws Bugle 8g 65mm', unitPriceCents: 1750, lineTotalCents: 1750 },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body.purchase.totalCents).toBe(3000);
  });

  it('rejects a draft whose lines do not sum to its stated total', async () => {
    const response = await saveDraft(appWith(saying(GOOD_READING)), { totalCents: 999_999 });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INCONSISTENT_TOTAL');

    const list = await requestOn(appWith(saying(GOOD_READING))).get('/purchases');
    expect(list.body.items).toEqual([]);
  });

  it('rejects a malformed draft — no line items at all — before it reaches the schema', async () => {
    const response = await requestOn(appWith(saying(GOOD_READING)))
      .post('/receipts/draft')
      .send({
        merchantEntityName: 'Bunnings Warehouse',
        orderedAt: '2026-08-01T14:32:00+10:00',
        currency: 'AUD',
        totalCents: 0,
        items: [],
        documents: [{ documentUri: 'pops://purchases/receipt/' + 'a'.repeat(64), kind: 'receipt' }],
        idempotencyKey: 'draft-key-empty',
      });
    expect(response.status).toBe(400);
  });

  it('rejects a save with no receipt attached — that is a manual entry, not a draft', async () => {
    const response = await requestOn(appWith(saying(GOOD_READING)))
      .post('/receipts/draft')
      .send({
        merchantEntityName: 'Bunnings Warehouse',
        orderedAt: '2026-08-01T14:32:00+10:00',
        currency: 'AUD',
        totalCents: 1250,
        items: [{ name: 'Timber Pine DAR 42x19', unitPriceCents: 1250, lineTotalCents: 1250 }],
        documents: [],
        idempotencyKey: 'draft-key-nodocs',
      });
    expect(response.status).toBe(400);
  });

  it('refuses the same idempotency key twice — a retry, not a twin', async () => {
    const app = appWith(saying(GOOD_READING));
    const first = await saveDraft(app);
    expect(first.status).toBe(200);

    const second = await saveDraft(app);
    expect(second.status).toBe(409);

    const list = await requestOn(app).get('/purchases');
    expect(list.body.items).toHaveLength(1);
  });

  it('links the merchant when contacts recognises it', async () => {
    const known: MerchantResolver = { resolve: async () => 'entity-bunnings' };
    const response = await saveDraft(appWith(saying(GOOD_READING), known));
    expect(response.body.purchase.merchantEntityId).toBe('entity-bunnings');
  });
});

const createManual = (app: Express, overrides: Record<string, unknown> = {}) =>
  requestOn(app)
    .post('/purchases/manual')
    .send({
      merchantEntityName: 'Corner Store',
      orderedAt: '2026-08-01T09:00:00+10:00',
      currency: 'AUD',
      totalCents: 500,
      items: [{ name: 'Coffee', unitPriceCents: 500, lineTotalCents: 500 }],
      idempotencyKey: 'manual-key-1',
      ...overrides,
    });

describe('POST /purchases/manual', () => {
  it('persists a purchase under the manual source, never the receipt one', async () => {
    const response = await createManual(appWith(null));

    expect(response.status).toBe(200);
    expect(response.body.purchase.source).toBe(MANUAL_SOURCE_ID);
    expect(response.body.purchase.source).not.toBe(RECEIPT_SOURCE_ID);
    expect(response.body.purchase.ingestMethod).toBe('manual');
  });

  it('carries no documents — a manual entry is not a receipt in disguise', async () => {
    const response = await createManual(appWith(null));
    expect(response.body.purchase.documents ?? []).toEqual([]);
  });

  it('rejects an inconsistent manual entry before writing anything', async () => {
    const response = await createManual(appWith(null), { totalCents: 999 });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INCONSISTENT_TOTAL');
  });

  it('refuses a repeated idempotency key', async () => {
    const app = appWith(null);
    const first = await createManual(app);
    expect(first.status).toBe(200);

    const second = await createManual(app);
    expect(second.status).toBe(409);
  });

  it('works with no vision model configured — manual entry never calls one', async () => {
    const response = await createManual(appWith(null));
    expect(response.status).toBe(200);
  });

  it('ignores a caller-supplied source, never lets it masquerade as an upload', async () => {
    const response = await createManual(appWith(null), {
      // A manual body's schema carries no `source` field at all, so this
      // key is simply unknown to the schema — the point being proven is
      // that it has NO effect, not that it is silently accepted.
      source: RECEIPT_SOURCE_ID,
    });
    expect(response.body.purchase.source).toBe(MANUAL_SOURCE_ID);
  });
});
