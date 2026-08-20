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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { RECEIPT_SOURCE_ID } from '../../ingest/receipt/purchase.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

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

/** Enough of a PDF to clear the edge check; the model is canned anyway. */
const PDF_BASE64 = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n').toString(
  'base64'
);

/** An order confirmation as it would be pasted out of a mail client. */
const EMAIL_BASE64 = Buffer.from(
  [
    'Thanks for your order!',
    'Order #A-4471 placed 1 August 2026',
    '',
    'Timber Pine DAR 42x19    $12.50',
    'Screws Bugle 8g 65mm     $15.00',
    'Total                    $27.50',
    '',
    'Track your parcel: https://example.test/track/A-4471',
    'Unsubscribe: https://example.test/unsubscribe',
  ].join('\n'),
  'utf8'
).toString('base64');

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

const { requestOn } = createTestTransport();

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
  requestOn(app)
    .post('/receipts')
    .send({ parts: [{ mediaType, dataBase64 }] });

/** One receipt sent as several parts, in order. */
const uploadAll = (app: Express, parts: { mediaType: string; dataBase64: string }[]) =>
  requestOn(app).post('/receipts').send({ parts });

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
      read: async (parts) => {
        seen = parts[0]?.dataBase64 ?? null;
        return GOOD_READING;
      },
    };
    const app = appWith(capturing);
    const wrapped = JPEG_BASE64.replace(/(.{8})/u, '$1\n  ');
    expect(wrapped).toMatch(/\s/u);

    const response = await requestOn(app)
      .post('/receipts')
      .send({ parts: [{ mediaType: 'image/jpeg', dataBase64: wrapped }] });

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

  it('stores the fee the merchant added, not just the total it produced', async () => {
    // The gate reconciles with the surcharge either way, because the total
    // is read off the paper — so a write path that drops it looks correct
    // from the outside while the stored breakdown no longer adds up.
    const withFee = JSON.stringify({
      ...JSON.parse(GOOD_READING),
      total: '$27.62',
      surcharges: ['0.12'],
    });

    const response = await upload(appWith(saying(withFee)));

    expect(response.body.kind).toBe('created');
    expect(response.body.purchase.purchase.surchargeCents).toBe(12);
    expect(response.body.purchase.purchase.shippingCents).toBe(0);
    expect(response.body.purchase.purchase.totalCents).toBe(2762);
  });

  it('stores delivery as delivery, not as another fee the merchant added', async () => {
    // Through every real layer: the mapper, the NOT NULL and the CHECK on
    // `shipping_cents`, and the serializer that hands it back. An emailed
    // order almost always carries delivery, and it is the column the amazon
    // adapter already writes — a receipt row filing it as a surcharge is
    // the same money under two names in one table.
    const delivered = JSON.stringify({
      ...JSON.parse(GOOD_READING),
      total: '$37.45',
      shipping: '$9.95',
    });

    const response = await upload(appWith(saying(delivered)));

    expect(response.body.kind).toBe('created');
    expect(response.body.purchase.purchase.shippingCents).toBe(995);
    expect(response.body.purchase.purchase.surchargeCents).toBe(0);
    expect(response.body.purchase.purchase.subtotalCents).toBe(2750);
    expect(response.body.purchase.purchase.totalCents).toBe(3745);
  });

  it('reads one receipt sent as several photographs', async () => {
    // A full shop does not fit in one frame. Both images go to the model in
    // one call, and the result is one purchase carrying both as evidence.
    let sawParts = 0;
    const counting: ReceiptVision = {
      read: async (parts) => {
        sawParts = parts.length;
        return GOOD_READING;
      },
    };

    const response = await uploadAll(appWith(counting), [
      { mediaType: 'image/jpeg', dataBase64: JPEG_BASE64 },
      { mediaType: 'image/jpeg', dataBase64: OTHER_JPEG_BASE64 },
    ]);

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    expect(sawParts).toBe(2);
    expect(response.body.purchase.documents).toHaveLength(2);
    expect(readdirSync(receiptDir)).toHaveLength(2);
  });

  it('names which photograph was not what it claimed', async () => {
    // Re-taking one picture of six beats re-taking all six.
    const response = await uploadAll(appWith(saying(GOOD_READING)), [
      { mediaType: 'image/jpeg', dataBase64: JPEG_BASE64 },
      { mediaType: 'image/jpeg', dataBase64: Buffer.from('not a jpeg').toString('base64') },
    ]);

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('2 of 2');
  });

  it('does not write the image twice', async () => {
    const app = appWith(saying(GOOD_READING));
    await upload(app);
    await upload(app);
    expect(readdirSync(receiptDir)).toHaveLength(1);
  });

  it('refuses a second photograph of the same receipt', async () => {
    // What people actually do: take another picture of the same paper from
    // a slightly different angle. The bytes differ, so the image hash sees
    // nothing, and three photos of one Salvos receipt wrote three
    // purchases of $66.00 at the same minute.
    const app = appWith(saying(GOOD_READING));
    const first = await upload(app, JPEG_BASE64);
    const second = await upload(app, OTHER_JPEG_BASE64);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('ALREADY_IMPORTED');
  });

  it('keeps two genuine shops that differ only in time', async () => {
    // The case the image key was protecting: two identical coffees, an
    // hour apart. The receipts state different times, so they stay apart.
    //
    // One app, so both uploads demonstrably meet the same database and the
    // second is judged against the first rather than against nothing.
    const later = JSON.stringify({ ...JSON.parse(GOOD_READING), purchasedAt: '15:32' });
    let answer = GOOD_READING;
    const app = appWith({ read: async () => answer });

    const first = await upload(app, JPEG_BASE64);
    answer = later;
    const second = await upload(app, OTHER_JPEG_BASE64);

    expect(first.body.kind).toBe('created');
    expect(second.status).toBe(200);
    expect(second.body.kind).toBe('created');
  });

  it('keeps the same amount at the same instant in another currency', async () => {
    // 3000 is $30.00 and ¥3000. Cents are a number without a currency, so
    // a key that omits it would refuse a real shop bought abroad.
    const abroad = JSON.stringify({
      ...JSON.parse(GOOD_READING),
      currency: 'JPY',
      total: '¥27.50',
    });
    let answer = GOOD_READING;
    const app = appWith({ read: async () => answer });

    await upload(app, JPEG_BASE64);
    answer = abroad;
    const second = await upload(app, OTHER_JPEG_BASE64);

    expect(second.status).toBe(200);
    expect(second.body.kind).toBe('created');
  });

  it('does not conflate two undated receipts uploaded together', async () => {
    // An inferred date is the upload moment, so two undated receipts sent
    // in the same second could look identical. They are not one receipt,
    // and the check is skipped precisely because the date is not stated.
    const undated = JSON.stringify({ ...JSON.parse(GOOD_READING), purchasedOn: null });
    const app = appWith(saying(undated));
    const first = await upload(app, JPEG_BASE64);
    const second = await upload(app, OTHER_JPEG_BASE64);

    expect(first.body.kind).toBe('created');
    expect(second.body.kind).toBe('created');
  });
});

describe('the shapes a receipt arrives in other than a photograph', () => {
  it('creates a purchase from a PDF invoice, through the same gate', async () => {
    const response = await upload(appWith(saying(GOOD_READING)), PDF_BASE64, 'application/pdf');

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    expect(response.body.purchase.purchase.totalCents).toBe(2750);
    expect(response.body.purchase.purchase.ingestMethod).toBe('upload');
    expect(response.body.purchase.items).toHaveLength(2);
  });

  it('creates a purchase from a pasted order confirmation', async () => {
    const response = await upload(appWith(saying(GOOD_READING)), EMAIL_BASE64, 'text/plain');

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    expect(response.body.purchase.purchase.totalCents).toBe(2750);
    expect(response.body.purchase.items).toHaveLength(2);
  });

  it('sends the model what was uploaded, not a re-encoding of it', async () => {
    // The port is what the adapter turns into a content block, so a media
    // type lost here is a PDF sent as an image — which the API rejects with
    // an error that reads as though the file were corrupt.
    const seen: { mediaType: string; dataBase64: string }[] = [];
    const capturing: ReceiptVision = {
      read: async (parts) => {
        seen.push(...parts);
        return GOOD_READING;
      },
    };

    await upload(appWith(capturing), PDF_BASE64, 'application/pdf');

    expect(seen).toHaveLength(1);
    expect(seen[0]?.mediaType).toBe('application/pdf');
    expect(seen[0]?.dataBase64).toBe(PDF_BASE64);
  });

  it('keeps every shape as evidence, under its own extension', async () => {
    // Two different shops, not one read twice: both uploads meet the same
    // database, and identical readings would be refused as a repeat of the
    // same receipt — which is the behaviour a later test asserts on purpose.
    const anHourLater = JSON.stringify({ ...JSON.parse(GOOD_READING), purchasedAt: '15:32' });
    const pdf = await upload(appWith(saying(GOOD_READING)), PDF_BASE64, 'application/pdf');
    const paste = await upload(appWith(saying(anHourLater)), EMAIL_BASE64, 'text/plain');

    for (const response of [pdf, paste]) {
      expect(response.body.purchase.documents).toHaveLength(1);
      expect(response.body.purchase.documents[0].documentUri).toMatch(
        /^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u
      );
    }

    const stored = readdirSync(receiptDir, { recursive: true }).map(String);
    expect(stored.some((name) => name.endsWith('.pdf'))).toBe(true);
    expect(stored.some((name) => name.endsWith('.txt'))).toBe(true);
  });

  it('keeps a PDF that failed the gate, so a reviewer can open it', async () => {
    // The whole reason evidence is stored before the reading: a mismatch is
    // exactly when someone has to look at the original.
    const wrong = JSON.stringify({ ...JSON.parse(GOOD_READING), total: '$99.99' });
    const response = await upload(appWith(saying(wrong)), PDF_BASE64, 'application/pdf');

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('needs-review');
    expect(response.body.receiptUris).toHaveLength(1);
    expect(readdirSync(receiptDir, { recursive: true }).map(String)).toContainEqual(
      expect.stringMatching(/\.pdf$/u)
    );
  });

  it('refuses the same PDF twice without paying for a second reading', async () => {
    let calls = 0;
    const counting: ReceiptVision = {
      read: async () => {
        calls += 1;
        return GOOD_READING;
      },
    };
    const app = appWith(counting);

    const first = await upload(app, PDF_BASE64, 'application/pdf');
    const second = await upload(app, PDF_BASE64, 'application/pdf');

    expect(first.body.kind).toBe('created');
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('ALREADY_IMPORTED');
    expect(calls).toBe(1);
  });

  it('recognises a PDF of a receipt already photographed', async () => {
    // Different bytes, so the content-addressed key cannot see it — this is
    // the one case where the receipt's own stated instant and amount are
    // all there is. Getting it wrong writes the same $27.50 shop twice.
    const app = appWith(saying(GOOD_READING));
    const photographed = await upload(app, JPEG_BASE64, 'image/jpeg');
    const invoiced = await upload(app, PDF_BASE64, 'application/pdf');

    expect(photographed.body.kind).toBe('created');
    expect(invoiced.status).toBe(409);
    expect(invoiced.body.code).toBe('ALREADY_IMPORTED');
    expect(invoiced.body.message).toContain('another upload of the same receipt');
  });

  it('reads a photograph and the merchant PDF as one submission', async () => {
    // Nothing forbids sending both, and one purchase carrying both as
    // evidence is a better answer than a 409 the sender cannot act on.
    const response = await uploadAll(appWith(saying(GOOD_READING)), [
      { mediaType: 'image/jpeg', dataBase64: JPEG_BASE64 },
      { mediaType: 'application/pdf', dataBase64: PDF_BASE64 },
    ]);

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    expect(response.body.purchase.documents).toHaveLength(2);
  });

  it('names which part was not what it claimed, in that part’s own terms', async () => {
    const response = await uploadAll(appWith(saying(GOOD_READING)), [
      { mediaType: 'image/jpeg', dataBase64: JPEG_BASE64 },
      { mediaType: 'application/pdf', dataBase64: JPEG_BASE64 },
    ]);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Document 2 of 2 is not a valid application/pdf file');
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
    expect(response.body.receiptUris).toHaveLength(1);
    expect(response.body.receiptUris[0]).toMatch(/^pops:\/\/purchases\/receipt\//u);
    expect(readdirSync(receiptDir)).toHaveLength(1);

    const listed = await requestOn(appWith(saying(wrong))).get('/purchases');
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
    expect(response.body.code).toBe('NOT_THE_STATED_TYPE');
  });

  it('refuses a JPEG claiming to be a PDF, and a PDF claiming to be a JPEG', async () => {
    // The inverse of the check this endpoint used to make. `application/pdf`
    // is now an accepted media type, so the question stopped being "is this
    // an image" and became "are these the bytes you said they were".
    const asPdf = await upload(appWith(saying(GOOD_READING)), JPEG_BASE64, 'application/pdf');
    expect(asPdf.status).toBe(400);
    expect(asPdf.body.code).toBe('NOT_THE_STATED_TYPE');

    const asJpeg = await upload(appWith(saying(GOOD_READING)), PDF_BASE64, 'image/jpeg');
    expect(asJpeg.status).toBe(400);
    expect(asJpeg.body.code).toBe('NOT_THE_STATED_TYPE');
  });

  it('refuses a media type the drop-zone does not accept at all', async () => {
    // Rejected by the contract's own enum, before any handler runs.
    const response = await upload(appWith(saying(GOOD_READING)), JPEG_BASE64, 'application/zip');
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
    expect(response.body.receiptUris).toHaveLength(1);
    expect(response.body.receiptUris[0]).toMatch(/^pops:\/\/purchases\/receipt\//u);
  });

  it('keeps the photograph even then, so it can be read again later', async () => {
    await upload(appWith(saying(null)));
    expect(readdirSync(receiptDir)).toHaveLength(1);
  });
});
