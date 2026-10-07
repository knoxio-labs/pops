/**
 * Storing a receipt without reading it, and pinning it for another pillar,
 * over real HTTP into a real migrated SQLite file and a real store on disk.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { RECEIPT_SOURCE_ID } from '../../ingest/receipt/purchase.js';
import {
  DEFAULT_RECEIPT_RETENTION_MS,
  sweepUnreferencedReceipts,
} from '../../ingest/receipt/retention-sweep.js';
import { receiptSha256, receiptUri, resolveStoredReceipt } from '../../ingest/receipt/store.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';

const jpeg = (fill: number): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, fill)]);

const JPEG = jpeg(9);
const OTHER_JPEG = jpeg(4);
const JPEG_URI = receiptUri(receiptSha256(JPEG));
const OTHER_JPEG_URI = receiptUri(receiptSha256(OTHER_JPEG));
const ABSENT_URI = receiptUri('a'.repeat(64));

const OWNER = 'pops://finance/transaction/txn-1';
const OTHER_OWNER = 'pops://finance/transaction/txn-2';

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

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let dataDir: string;
let receiptDir: string;
let app: Express;

function appWith(vision: ReceiptVision | null): Express {
  return createPurchasesApiApp({
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    vision,
    merchant: { resolve: async () => null },
  });
}

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  dataDir = mkdtempSync(join(tmpdir(), 'pops-receipt-refs-'));
  process.env['PURCHASES_SQLITE_PATH'] = join(dataDir, 'purchases.db');
  receiptDir = join(dataDir, 'receipts');
  mkdirSync(receiptDir, { recursive: true });
  __resetPillarRegistryCache();
  app = appWith(null);
});

afterEach(() => {
  cleanup();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env['PURCHASES_SQLITE_PATH'];
  __resetPillarRegistryCache();
});

const part = (bytes: Buffer, mediaType = 'image/jpeg') => ({
  mediaType,
  dataBase64: bytes.toString('base64'),
});

const store = (on: Express, ...parts: { mediaType: string; dataBase64: string }[]) =>
  requestOn(on).post('/receipts/store').send({ parts });

const pin = (ownerUri: string, receiptUris: readonly string[]) =>
  requestOn(app).put('/receipts/references').send({ ownerUri, receiptUris });

const release = (body: { ownerUri: string; receiptUris?: readonly string[] }) =>
  requestOn(app).delete('/receipts/references').send(body);

function references(): { document_uri: string; owner_uri: string }[] {
  return opened.raw
    .prepare(
      'SELECT document_uri, owner_uri FROM receipt_external_references ORDER BY owner_uri, document_uri'
    )
    .all() as { document_uri: string; owner_uri: string }[];
}

function countOf(table: string): number {
  return (opened.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

/** Push every stored file past the retention window, then sweep. */
function sweepAfterRetention() {
  const old = new Date(Date.now() - DEFAULT_RECEIPT_RETENTION_MS - 60_000);
  for (const uri of [JPEG_URI, OTHER_JPEG_URI]) {
    const found = resolveStoredReceipt(uri.slice(-64));
    if (found !== null) utimesSync(found.path, old, old);
  }
  return sweepUnreferencedReceipts(opened.db);
}

describe('POST /receipts/store', () => {
  it('stores with no vision model configured, and writes no purchase', async () => {
    const response = await store(app, part(JPEG));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ receiptUris: [JPEG_URI] });
    expect(resolveStoredReceipt(receiptSha256(JPEG))?.byteLength).toBe(JPEG.length);
    expect(countOf('purchases')).toBe(0);
    expect(countOf('receipt_external_references')).toBe(0);
  });

  it('never calls the model when one is configured', async () => {
    let calls = 0;
    const counting: ReceiptVision = {
      read: async () => {
        calls += 1;
        return GOOD_READING;
      },
    };

    const response = await store(appWith(counting), part(JPEG));

    expect(response.status).toBe(200);
    expect(calls).toBe(0);
  });

  it('answers every part in the order it was sent', async () => {
    const response = await store(app, part(OTHER_JPEG), part(JPEG));

    expect(response.status).toBe(200);
    expect(response.body.receiptUris).toEqual([OTHER_JPEG_URI, JPEG_URI]);
  });

  it('refuses bytes that are not the stated media type, and stores none of the upload', async () => {
    const response = await store(app, part(JPEG), part(JPEG, 'application/pdf'));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('purchases.receipt.invalid_media_type');
    expect(response.body.message).toContain('2 of 2');
    expect(readdirSync(receiptDir)).toHaveLength(0);
  });

  it('refuses an upload with no parts', async () => {
    const response = await requestOn(app).post('/receipts/store').send({ parts: [] });

    expect(response.status).toBe(400);
  });

  it('stores a file that already became a purchase, where upload answers 409', async () => {
    const reading = appWith({ read: async () => GOOD_READING });
    const upload = () =>
      requestOn(reading)
        .post('/receipts')
        .send({ parts: [part(JPEG)] });
    expect((await upload()).body.kind).toBe('created');
    expect((await upload()).status).toBe(409);

    const response = await store(reading, part(JPEG));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ receiptUris: [JPEG_URI] });
    expect(
      opened.raw
        .prepare('SELECT COUNT(*) AS n FROM purchases WHERE source = ?')
        .get(RECEIPT_SOURCE_ID)
    ).toEqual({ n: 1 });
  });
});

describe('PUT /receipts/references', () => {
  it('pins a stored file for its owner', async () => {
    await store(app, part(JPEG));

    const response = await pin(OWNER, [JPEG_URI]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(references()).toEqual([{ document_uri: JPEG_URI, owner_uri: OWNER }]);
  });

  it('leaves one row when the same pin is sent twice', async () => {
    await store(app, part(JPEG));

    expect((await pin(OWNER, [JPEG_URI])).status).toBe(200);
    expect((await pin(OWNER, [JPEG_URI, JPEG_URI])).status).toBe(200);

    expect(references()).toHaveLength(1);
  });

  it('keeps a pin per owner on one file', async () => {
    await store(app, part(JPEG));

    await pin(OWNER, [JPEG_URI]);
    await pin(OTHER_OWNER, [JPEG_URI]);

    expect(references().map((row) => row.owner_uri)).toEqual([OWNER, OTHER_OWNER]);
  });

  it('answers 404 for a file that is not stored, and pins none of the request', async () => {
    await store(app, part(JPEG));

    const response = await pin(OWNER, [JPEG_URI, ABSENT_URI]);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('purchases.receipt.not_stored');
    expect(response.body.message).toContain(ABSENT_URI);
    expect(references()).toEqual([]);
  });

  it.each([
    ['a bare id', 'txn-1'],
    ['another scheme', 'https://finance/transaction/txn-1'],
    ['a URI with no id', 'pops://finance/transaction'],
    ['an empty string', ''],
  ])('refuses an owner that is %s', async (_label, ownerUri) => {
    await store(app, part(JPEG));

    const response = await pin(ownerUri, [JPEG_URI]);

    expect(response.status).toBe(400);
    expect(references()).toEqual([]);
  });

  it.each([
    ['a URI on another pillar', 'pops://finance/transaction/txn-1'],
    ['a hash that is not one', 'pops://purchases/receipt/not-a-sha'],
    ['a traversal', `pops://purchases/receipt/../${'a'.repeat(61)}`],
  ])('refuses a receipt that is %s', async (_label, uri) => {
    const response = await pin(OWNER, [uri]);

    expect(response.status).toBe(400);
  });

  it('refuses an empty list and one past the ceiling', async () => {
    expect((await pin(OWNER, [])).status).toBe(400);
    expect(
      (
        await pin(
          OWNER,
          Array.from({ length: 101 }, () => JPEG_URI)
        )
      ).status
    ).toBe(400);
  });
});

describe('DELETE /receipts/references', () => {
  it('releases only the named file', async () => {
    await store(app, part(JPEG), part(OTHER_JPEG));
    await pin(OWNER, [JPEG_URI, OTHER_JPEG_URI]);

    const response = await release({ ownerUri: OWNER, receiptUris: [JPEG_URI] });

    expect(response.status).toBe(200);
    expect(references()).toEqual([{ document_uri: OTHER_JPEG_URI, owner_uri: OWNER }]);
  });

  it('releases everything the owner holds when no file is named, and nothing of another owner', async () => {
    await store(app, part(JPEG), part(OTHER_JPEG));
    await pin(OWNER, [JPEG_URI, OTHER_JPEG_URI]);
    await pin(OTHER_OWNER, [JPEG_URI]);

    const response = await release({ ownerUri: OWNER });

    expect(response.status).toBe(200);
    expect(references()).toEqual([{ document_uri: JPEG_URI, owner_uri: OTHER_OWNER }]);
  });

  it('is a no-op for a pin that does not exist', async () => {
    await store(app, part(JPEG));
    await pin(OWNER, [JPEG_URI]);

    expect((await release({ ownerUri: OTHER_OWNER, receiptUris: [JPEG_URI] })).status).toBe(200);
    expect((await release({ ownerUri: OWNER, receiptUris: [ABSENT_URI] })).status).toBe(200);
    expect((await release({ ownerUri: OTHER_OWNER })).status).toBe(200);

    expect(references()).toEqual([{ document_uri: JPEG_URI, owner_uri: OWNER }]);
  });

  it('refuses an empty list rather than reading it as "all"', async () => {
    await store(app, part(JPEG));
    await pin(OWNER, [JPEG_URI]);

    const response = await release({ ownerUri: OWNER, receiptUris: [] });

    expect(response.status).toBe(400);
    expect(references()).toHaveLength(1);
  });

  it('refuses a body with no owner', async () => {
    const response = await requestOn(app).delete('/receipts/references').send({});

    expect(response.status).toBe(400);
  });
});

describe('a pinned file and the retention sweep', () => {
  it('sweeps a stored file nobody pinned, keeps a pinned one, and sweeps it once released', async () => {
    await store(app, part(JPEG), part(OTHER_JPEG));
    await pin(OWNER, [JPEG_URI]);

    expect(sweepAfterRetention()).toEqual({ scanned: 2, deleted: 1, kept: 1, malformed: 0 });
    expect(resolveStoredReceipt(receiptSha256(JPEG))).not.toBeNull();
    expect(resolveStoredReceipt(receiptSha256(OTHER_JPEG))).toBeNull();

    await release({ ownerUri: OWNER, receiptUris: [JPEG_URI] });

    expect(sweepAfterRetention()).toEqual({ scanned: 1, deleted: 1, kept: 0, malformed: 0 });
  });
});
