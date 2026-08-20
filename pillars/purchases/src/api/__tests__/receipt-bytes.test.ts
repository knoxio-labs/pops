/**
 * Dereferencing a `pops://purchases/receipt/<sha256>` URI, over real HTTP.
 *
 * The store is the real one, the Express app is the real one and the images
 * are synthetic — generated here rather than committed, because a receipt
 * fixture checked into a repository is either a real receipt or a lie about
 * what one looks like.
 *
 * The four answers this surface can give are each pinned: the bytes, a
 * malformed address, an address naming nothing, and a receipt that exists and
 * is not a picture. Three of them are the ones a client gets wrong if the
 * server folds them together.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { storeReceiptBytes } from '../../ingest/receipt/store.js';
import { THUMBNAIL_LONGEST_EDGE, thumbnailPath } from '../../ingest/receipt/thumbnail.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

const { requestOn } = createTestTransport();

/**
 * Receipt-shaped: far taller than it is wide, like a till slip. The aspect
 * ratio is the thing under test in the thumbnail case, so a square would
 * pass a resize that quietly cropped.
 */
async function receiptPhotograph(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1200,
      height: 2000,
      channels: 3,
      background: { r: 210, g: 205, b: 195 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Passes the upload edge's magic-number check and decodes as nothing. This is
 * a real state a stored receipt can be in — the edge reads the first bytes,
 * not the whole image — and it is the one that separates "no thumbnail is
 * possible" from "the pillar fell over".
 */
const UNDECODABLE_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');

/** Well-formed, and nothing was ever stored under it. */
const ABSENT_SHA = 'a'.repeat(64);

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let receiptDir: string;
let app: Express;

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  receiptDir = mkdtempSync(join(tmpdir(), 'pops-receipt-bytes-'));
  process.env['PURCHASES_RECEIPT_DIR'] = receiptDir;
  __resetPillarRegistryCache();
  app = createPurchasesApiApp({
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    vision: null,
  });
});

afterEach(() => {
  cleanup();
  rmSync(receiptDir, { recursive: true, force: true });
  delete process.env['PURCHASES_RECEIPT_DIR'];
  __resetPillarRegistryCache();
});

describe('GET /receipts/:sha256', () => {
  it('answers with the exact bytes that were stored, and the type they were stored as', async () => {
    const photograph = await receiptPhotograph();
    const stored = storeReceiptBytes(photograph, 'image/jpeg', receiptDir);

    const response = await requestOn(app).get(`/receipts/${stored.sha256}`);

    expect(response.status).toBe(200);
    expect(response.body.sha256).toBe(stored.sha256);
    expect(response.body.mediaType).toBe('image/jpeg');
    expect(response.body.byteLength).toBe(photograph.length);
    // Byte-for-byte, not merely the same length: a store that served a
    // neighbouring shard's file would pass a length check on two receipts
    // photographed a second apart.
    expect(Buffer.from(response.body.dataBase64, 'base64').equals(photograph)).toBe(true);
  });

  it('serves a receipt that no purchase row references', async () => {
    // The outcome a refused or unreadable receipt produces: the bytes are
    // stored and their URI is handed to the caller, and no purchase — and so
    // no `purchase_documents` row — is written. Resolving through the
    // document table instead of the store would 404 exactly the receipts a
    // human has to look at.
    const stored = storeReceiptBytes(await receiptPhotograph(), 'image/jpeg', receiptDir);
    const rows = opened.raw
      .prepare('SELECT COUNT(*) AS n FROM purchase_documents')
      .get() as { n: number };
    expect(rows.n).toBe(0);

    const response = await requestOn(app).get(`/receipts/${stored.sha256}`);
    expect(response.status).toBe(200);
  });

  it('finds a receipt under every extension the store can write', async () => {
    // The reader probes candidate names rather than listing the directory, so
    // a media type the writer supports and the reader does not would be a
    // receipt that is on disk and unreachable — invisible to a test that only
    // ever stores a JPEG.
    const cases = [
      { bytes: await receiptPhotograph(), mediaType: 'image/jpeg' },
      {
        bytes: await sharp({
          create: { width: 40, height: 60, channels: 3, background: { r: 1, g: 2, b: 3 } },
        })
          .png()
          .toBuffer(),
        mediaType: 'image/png',
      },
      {
        bytes: await sharp({
          create: { width: 40, height: 60, channels: 3, background: { r: 4, g: 5, b: 6 } },
        })
          .webp()
          .toBuffer(),
        mediaType: 'image/webp',
      },
      { bytes: PDF, mediaType: 'application/pdf' },
      { bytes: Buffer.from('Total  $12.50\n', 'utf8'), mediaType: 'text/plain' },
    ] as const;

    for (const one of cases) {
      const stored = storeReceiptBytes(one.bytes, one.mediaType, receiptDir);
      const response = await requestOn(app).get(`/receipts/${stored.sha256}`);
      expect(response.status).toBe(200);
      expect(response.body.mediaType).toBe(one.mediaType);
    }
  });

  it('caches immutably and privately, because the bytes cannot change and are personal', async () => {
    const stored = storeReceiptBytes(await receiptPhotograph(), 'image/jpeg', receiptDir);

    const response = await requestOn(app).get(`/receipts/${stored.sha256}`);

    expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(response.headers['etag']).toBe(`"${stored.sha256}"`);
  });

  it('says the store does not have it, rather than failing or answering empty', async () => {
    const response = await requestOn(app).get(`/receipts/${ABSENT_SHA}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RECEIPT_NOT_STORED');
  });

  it('refuses a hash that is not one, distinctly from a hash that names nothing', async () => {
    for (const notAHash of ['nonsense', 'A'.repeat(64), 'b'.repeat(63), 'c'.repeat(65)]) {
      const response = await requestOn(app).get(`/receipts/${notAHash}`);
      expect(response.status).toBe(400);
    }
  });

  it('cannot be walked out of the store', async () => {
    // Both the encoded and the raw form: Express normalises one of them
    // before routing, and the contract's own path schema is what refuses the
    // other. A 200 here would mean the pillar serves arbitrary files.
    const outside = join(receiptDir, 'escaped.txt');
    writeFileSync(outside, 'not a receipt');

    for (const attempt of ['..%2F..%2Fetc%2Fpasswd', '%2E%2E%2Fescaped.txt']) {
      const response = await requestOn(app).get(`/receipts/${attempt}`);
      expect(response.status).not.toBe(200);
    }
  });
});

describe('GET /receipts/:sha256/thumbnail', () => {
  it('answers with a smaller image that keeps the receipt’s shape', async () => {
    const photograph = await receiptPhotograph();
    const stored = storeReceiptBytes(photograph, 'image/jpeg', receiptDir);

    const response = await requestOn(app).get(`/receipts/${stored.sha256}/thumbnail`);

    expect(response.status).toBe(200);
    expect(response.body.mediaType).toBe('image/jpeg');

    const bytes = Buffer.from(response.body.dataBase64, 'base64');
    expect(bytes.length).toBeLessThan(photograph.length);

    const meta = await sharp(bytes).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(THUMBNAIL_LONGEST_EDGE);
    // 1200x2000 fitted inside 480 is 288x480. A crop to a square would also
    // satisfy the bound above while throwing away the proportions that make a
    // till slip recognisable in a row.
    expect(meta.width).toBe(288);
    expect(meta.height).toBe(THUMBNAIL_LONGEST_EDGE);
  });

  it('reports the length of the thumbnail, not of the receipt it came from', async () => {
    const photograph = await receiptPhotograph();
    const stored = storeReceiptBytes(photograph, 'image/jpeg', receiptDir);

    const response = await requestOn(app).get(`/receipts/${stored.sha256}/thumbnail`);

    expect(response.body.byteLength).toBe(
      Buffer.from(response.body.dataBase64, 'base64').length
    );
    expect(response.body.byteLength).not.toBe(photograph.length);
  });

  it('keeps the derived image, so only the first reader pays for it', async () => {
    const stored = storeReceiptBytes(await receiptPhotograph(), 'image/jpeg', receiptDir);
    const derived = thumbnailPath(stored.sha256, receiptDir);
    expect(existsSync(derived)).toBe(false);

    const first = await requestOn(app).get(`/receipts/${stored.sha256}/thumbnail`);
    expect(first.status).toBe(200);
    expect(existsSync(derived)).toBe(true);

    // Proven by substitution rather than by counting calls: the second
    // response carries bytes that only the file can be the source of, so a
    // handler that silently re-derived would fail here.
    const sentinel = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .jpeg()
      .toBuffer();
    writeFileSync(derived, sentinel);

    const second = await requestOn(app).get(`/receipts/${stored.sha256}/thumbnail`);
    expect(Buffer.from(second.body.dataBase64, 'base64').equals(sentinel)).toBe(true);
  });

  it('carries its own entity tag, so a cache cannot answer it with the full receipt', async () => {
    const stored = storeReceiptBytes(await receiptPhotograph(), 'image/jpeg', receiptDir);

    const full = await requestOn(app).get(`/receipts/${stored.sha256}`);
    const thumb = await requestOn(app).get(`/receipts/${stored.sha256}/thumbnail`);

    expect(thumb.headers['etag']).not.toBe(full.headers['etag']);
    expect(thumb.headers['cache-control']).toBe('private, max-age=31536000, immutable');
  });

  it('says a document is not a photograph, settled rather than transient', async () => {
    const stored = storeReceiptBytes(PDF, 'application/pdf', receiptDir);

    const response = await requestOn(app).get(`/receipts/${stored.sha256}/thumbnail`);

    expect(response.status).toBe(415);
    expect(response.body.code).toBe('RECEIPT_NOT_AN_IMAGE');
  });

  it('says a pasted body is not a photograph either', async () => {
    const stored = storeReceiptBytes(Buffer.from('Total $9.99\n', 'utf8'), 'text/plain', receiptDir);

    const response = await requestOn(app).get(`/receipts/${stored.sha256}/thumbnail`);

    expect(response.status).toBe(415);
    expect(response.body.code).toBe('RECEIPT_NOT_AN_IMAGE');
  });

  it('reports an image it cannot decode as this receipt’s problem, not as a fault', async () => {
    const stored = storeReceiptBytes(UNDECODABLE_JPEG, 'image/jpeg', receiptDir);

    const response = await requestOn(app).get(`/receipts/${stored.sha256}/thumbnail`);

    expect(response.status).toBe(415);
    expect(response.body.code).toBe('RECEIPT_UNDECODABLE');
    // The receipt itself is still reachable. Refusing to draw it must not
    // make the evidence unavailable — that is the whole reason it is stored.
    const full = await requestOn(app).get(`/receipts/${stored.sha256}`);
    expect(full.status).toBe(200);
    expect(Buffer.from(full.body.dataBase64, 'base64').equals(UNDECODABLE_JPEG)).toBe(true);
  });

  it('says the store does not have it, for a hash naming nothing', async () => {
    const response = await requestOn(app).get(`/receipts/${ABSENT_SHA}/thumbnail`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RECEIPT_NOT_STORED');
  });

  it('refuses a hash that is not one', async () => {
    const response = await requestOn(app).get('/receipts/not-a-hash/thumbnail');
    expect(response.status).toBe(400);
  });

  it('does not leave a partial file behind when it cannot decode', async () => {
    const stored = storeReceiptBytes(UNDECODABLE_JPEG, 'image/jpeg', receiptDir);
    await requestOn(app).get(`/receipts/${stored.sha256}/thumbnail`);

    expect(existsSync(thumbnailPath(stored.sha256, receiptDir))).toBe(false);
    // And the original is untouched.
    expect(readFileSync(stored.path).equals(UNDECODABLE_JPEG)).toBe(true);
  });
});
