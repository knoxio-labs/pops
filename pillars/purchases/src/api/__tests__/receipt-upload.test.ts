/**
 * The drop-zone, end to end over real HTTP.
 *
 * Every layer here is the real one — the actual Express app over supertest,
 * into a real migrated SQLite file — except the vision model, which is a
 * canned answer. A schema is not a database: the payload the mapper builds
 * has to satisfy NOT NULL, the foreign key to `purchase_sources`, the
 * unique constraints and the CHECKs, and none of that is downstream of zod.
 *
 * No test here reaches a real API.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { RECEIPT_SOURCE_ID } from '../../ingest/receipt/purchase.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';
import type { MerchantResolver } from '../contacts/merchant.js';

/** A real JPEG magic number, so the edge check passes. */
const JPEG_BASE64 = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32, 9),
]).toString('base64');

const OTHER_JPEG_BASE64 = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32, 4),
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

const saying = (answer: string | null): ReceiptVision => ({ read: async () => answer });

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let receiptDir: string;

/**
 * Merchant matching is stubbed rather than left to the live resolver.
 * A test must not reach for the registry, and `resolves to nothing` is the
 * ordinary production answer anyway when contacts knows no such merchant.
 */
const NO_MERCHANT: MerchantResolver = { resolve: async () => null };

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
  receiptDir = mkdtempSync(join(tmpdir(), 'pops-upload-'));
  process.env['PURCHASES_RECEIPT_DIR'] = receiptDir;
  // Deliberately NOT seeding the `receipt` source: the drop-zone registers
  // its own, and an upload that only works after someone remembers to do it
  // by hand is a feature that does not work.
  __resetPillarRegistryCache();
});

afterEach(() => {
  cleanup();
  rmSync(receiptDir, { recursive: true, force: true });
  delete process.env['PURCHASES_RECEIPT_DIR'];
  __resetPillarRegistryCache();
});

const upload = (app: Express, dataBase64 = JPEG_BASE64, mediaType = 'image/jpeg') =>
  request(app).post('/receipts').send({ mediaType, dataBase64 });

describe('a receipt the model reads and the paper agrees with', () => {
  it('creates the purchase, its line items and its charge', async () => {
    const response = await upload(appWith(saying(GOOD_READING)));

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    const { purchase } = response.body.purchase;
    expect(purchase.totalCents).toBe(2750);
    expect(purchase.ingestMethod).toBe('upload');
    expect(purchase.source).toBe(RECEIPT_SOURCE_ID);
    expect(response.body.purchase.items).toHaveLength(2);
    expect(response.body.purchase.charges).toHaveLength(1);
  });

  it('says it does not know how it was paid for', async () => {
    const response = await upload(appWith(saying(GOOD_READING)));
    expect(response.body.purchase.purchase.settlementMode).toBe('unknown');
  });

  it('surfaces the uncertainty tags a reviewer needs to see', async () => {
    // A mark nobody can read is not a mark. These exist to tell a human
    // which figures the receipt did not actually state.
    const undated = JSON.stringify({ ...JSON.parse(GOOD_READING), purchasedOn: null });
    const response = await upload(appWith(saying(undated)));
    expect(response.body.purchase.tags).toContain('date-uncertain');
  });

  it('dates an undated receipt from the upload, not from when the model replied', async () => {
    // The inferred date is the upload instant, and a vision call takes
    // seconds. Stamping it after the call lets model latency carry a shop
    // uploaded at 23:59 into the next day — the one moment the difference
    // between "when you sent it" and "when the model answered" is a
    // different date entirely.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-01T13:59:58.000Z'));
      const undated = JSON.stringify({ ...JSON.parse(GOOD_READING), purchasedOn: null });
      const slow: ReceiptVision = {
        read: async () => {
          vi.advanceTimersByTime(5_000);
          return undated;
        },
      };

      const response = await upload(appWith(slow));

      expect(response.body.purchase.tags).toContain('date-uncertain');
      expect(response.body.purchase.purchase.orderedAt).toBe('2026-08-01T13:59:58.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries no tags for a receipt that stated everything', async () => {
    const response = await upload(appWith(saying(GOOD_READING)));
    expect(response.body.purchase.tags).toEqual([]);
  });

  it('links the merchant when contacts recognises it', async () => {
    const known: MerchantResolver = { resolve: async () => 'entity-bunnings' };
    const response = await upload(appWith(saying(GOOD_READING), known));
    expect(response.body.purchase.purchase.merchantEntityId).toBe('entity-bunnings');
    // The receipt's own wording is kept either way.
    expect(response.body.purchase.purchase.merchantEntityName).toBe('Bunnings Warehouse');
  });

  it('still creates the purchase when contacts recognises nothing', async () => {
    // Unknown is a valid outcome, not a failure — the drop-zone exists for
    // merchants nothing recognises.
    const response = await upload(appWith(saying(GOOD_READING)));
    expect(response.body.kind).toBe('created');
    expect(response.body.purchase.purchase.merchantEntityId).toBeNull();
    expect(response.body.purchase.purchase.merchantEntityName).toBe('Bunnings Warehouse');
  });

  it('still creates the purchase when the merchant lookup blows up', async () => {
    // A peer being down must cost a link, not a receipt — and that has to
    // be guaranteed by the handler rather than by whichever resolver
    // happens to be wired in.
    const down: MerchantResolver = { resolve: () => Promise.reject(new Error('unreachable')) };
    const response = await upload(appWith(saying(GOOD_READING), down));
    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    expect(response.body.purchase.purchase.merchantEntityId).toBeNull();
  });

  it('keeps the photograph and points the purchase at it', async () => {
    const response = await upload(appWith(saying(GOOD_READING)));
    expect(response.body.purchase.documents).toHaveLength(1);
    expect(response.body.purchase.documents[0].documentUri).toMatch(
      /^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u
    );
    // The bytes are on disk, sharded, not merely referenced.
    expect(readdirSync(receiptDir)).toHaveLength(1);
  });
});

describe('re-uploading the same photograph', () => {
  it('is a 409 rather than a twin', async () => {
    const app = appWith(saying(GOOD_READING));
    const first = await upload(app);
    const second = await upload(app);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it('hands the model base64 with no line breaks in it', async () => {
    // A pasted or `base64`-piped payload arrives wrapped. It decodes fine,
    // but some providers refuse it, which would turn a good upload into a
    // model-call failure the user cannot act on.
    let seen: string | null = null;
    const capturing: ReceiptVision = {
      read: async (image) => {
        seen = image.dataBase64;
        return GOOD_READING;
      },
    };
    const app = appWith(capturing);
    const wrapped = JPEG_BASE64.replace(/(.{8})/u, '$1\n  ');
    expect(wrapped).toMatch(/\s/u);

    const response = await request(app)
      .post('/receipts')
      .send({ mediaType: 'image/jpeg', dataBase64: wrapped });

    expect(response.status).toBe(200);
    expect(seen).not.toBeNull();
    expect(seen).not.toMatch(/\s/u);
  });

  it('does not pay for a vision call to discover the duplicate', async () => {
    // The photograph's hash IS the key, so a re-upload is knowable before
    // the model is asked. Re-photographing a receipt you already sent is an
    // ordinary mistake and should be free.
    let calls = 0;
    const counting: ReceiptVision = {
      read: async () => {
        calls += 1;
        return GOOD_READING;
      },
    };
    const app = appWith(counting);
    await upload(app);
    await upload(app);
    await upload(app);

    expect(calls).toBe(1);
  });

  it('does not write the image twice', async () => {
    const app = appWith(saying(GOOD_READING));
    await upload(app);
    await upload(app);
    expect(readdirSync(receiptDir)).toHaveLength(1);
  });

  it('still creates a second purchase from a different photograph', async () => {
    // Two identical coffees an hour apart are two purchases. Keying on the
    // image rather than on date-plus-total is what keeps them apart.
    const app = appWith(saying(GOOD_READING));
    const first = await upload(app, JPEG_BASE64);
    const second = await upload(app, OTHER_JPEG_BASE64);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.kind).toBe('created');
  });
});

describe('a reading the paper disagrees with', () => {
  it('goes to review, writes nothing, and keeps the photograph', async () => {
    const wrong = JSON.stringify({ ...JSON.parse(GOOD_READING), total: '$99.99' });
    const response = await upload(appWith(saying(wrong)));

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('needs-review');
    expect(response.body.failures[0].kind).toBe('sum-mismatch');
    // The evidence survives even though nothing was written.
    expect(response.body.receiptUri).toMatch(/^pops:\/\/purchases\/receipt\//u);
    expect(readdirSync(receiptDir)).toHaveLength(1);

    const listed = await request(appWith(saying(wrong))).get('/purchases');
    expect(listed.body.items).toHaveLength(0);
  });

  it('still creates a receipt that states no date, tagged rather than refused', async () => {
    // The shop happened and the photograph exists. Losing it would be worse
    // than carrying an inferred date, provided the tag stops anyone
    // mistaking that date for something the paper stated.
    const undated = JSON.stringify({ ...JSON.parse(GOOD_READING), purchasedOn: null });
    const response = await upload(appWith(saying(undated)));
    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    expect(response.body.purchase.purchase.totalCents).toBe(2750);
  });
});

describe('uploads it declines before the model sees them', () => {
  it('refuses something that is not the image type it claims', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const response = await upload(appWith(saying(GOOD_READING)), png.toString('base64'));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('NOT_AN_IMAGE');
  });

  it('refuses a media type no vision model accepts', async () => {
    const response = await upload(appWith(saying(GOOD_READING)), JPEG_BASE64, 'application/pdf');
    expect(response.status).toBe(400);
  });

  it('declines every upload when no model is configured', async () => {
    // Said at the edge, so the user is told rather than left with an upload
    // that failed somewhere they cannot see.
    const response = await upload(appWith(null));
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('VISION_UNAVAILABLE');
  });
});

describe('a model that says nothing usable', () => {
  it('reports it as unreadable and writes nothing', async () => {
    const response = await upload(appWith(saying('I cannot read this receipt.')));
    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('unreadable');
    expect(response.body.receiptUri).toMatch(/^pops:\/\/purchases\/receipt\//u);
  });

  it('keeps the photograph even then, so it can be read again later', async () => {
    await upload(appWith(saying(null)));
    expect(readdirSync(receiptDir)).toHaveLength(1);
  });
});
