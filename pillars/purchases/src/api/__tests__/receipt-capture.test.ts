/**
 * Capture metadata over real HTTP, into a real migrated database.
 *
 * The two halves are asserted against each other: what the mobile bridge
 * will send in the body, and what a photograph says about itself when the
 * body says nothing. A schema is not a database — the row has to satisfy
 * the CHECKs on the coordinates, the offset and the two provenance columns,
 * and none of that is downstream of zod.
 *
 * The sensitivity rules are asserted here too, because they are properties
 * of the endpoint rather than of a function: a location never appears in a
 * response, a refused one is never echoed back, and none of it reaches the
 * vision prompt.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { purchaseCapture } from '../../db/schema.js';
import { dms } from '../../ingest/receipt/__tests__/exif-fixtures.js';
import { jpegWithExif, jpegWithTiff } from '../../ingest/receipt/__tests__/image-fixtures.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb, PurchaseCaptureRow } from '../../db/index.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';
import type { MerchantResolver } from '../contacts/merchant.js';

const READING = {
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
};

const saying = (answer: unknown): ReceiptVision => ({ read: async () => JSON.stringify(answer) });
const NO_MERCHANT: MerchantResolver = { resolve: async () => null };

/** A photograph the reader finds nothing in — the ordinary stripped case. */
const PLAIN_JPEG = jpegWithTiff(null).toString('base64');

const PHOTOGRAPHED_IN_SYDNEY = jpegWithExif({
  dateTimeOriginal: '2026:08:01 14:32:07',
  offsetTimeOriginal: '+10:00',
  gps: {
    latitude: dms(33, 52, 4.2),
    latitudeRef: 'S',
    longitude: dms(151, 12, 26),
    longitudeRef: 'E',
  },
}).toString('base64');

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let receiptDir: string;

function appWith(reading: unknown = READING): Express {
  return createPurchasesApiApp({
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    vision: saying(reading),
    merchant: NO_MERCHANT,
  });
}

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  receiptDir = mkdtempSync(join(tmpdir(), 'pops-capture-'));
  process.env['PURCHASES_RECEIPT_DIR'] = receiptDir;
  __resetPillarRegistryCache();
});

afterEach(() => {
  cleanup();
  rmSync(receiptDir, { recursive: true, force: true });
  delete process.env['PURCHASES_RECEIPT_DIR'];
  __resetPillarRegistryCache();
});

const post = (app: Express, body: object) => request(app).post('/receipts').send(body);

const captureRows = (): PurchaseCaptureRow[] => opened.db.select().from(purchaseCapture).all();

describe('what the client sends', () => {
  it('records the device clock, its zone and its location', async () => {
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
      capture: {
        capturedAt: '2026-08-01T14:32:07+10:00',
        timeZone: 'Australia/Perth',
        location: { latitude: -31.9523, longitude: 115.8613 },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    const [row] = captureRows();
    expect(row?.capturedAt).toBe('2026-08-01T04:32:07.000Z');
    expect(row?.capturedAtSource).toBe('client');
    expect(row?.declaredTimeZone).toBe('Australia/Perth');
    expect(row?.latitude).toBeCloseTo(-31.9523, 4);
    expect(row?.locationSource).toBe('client');
  });

  it('places the receipt with the zone the device declared', async () => {
    // The model read `Australia/Sydney` off the printed address; Perth is
    // two hours behind it, and the device outranks an inference.
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
      capture: { timeZone: 'Australia/Perth' },
    });
    expect(response.body.purchase.purchase.orderedAt).toBe('2026-08-01T06:32:00.000Z');
  });

  it('dates an undated receipt from the capture instant, and still tags it', async () => {
    const response = await post(appWith({ ...READING, purchasedOn: null }), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
      capture: { capturedAt: '2026-08-01T14:32:07+10:00' },
    });
    expect(response.body.purchase.purchase.orderedAt).toBe('2026-08-01T04:32:07.000Z');
    expect(response.body.purchase.tags).toContain('date-uncertain');
  });

  it('keeps the receipt when the device states an offset the earth does not have', async () => {
    // `+20:00` satisfies the contract's date-time pattern, and the column
    // that would hold it refuses anything past +/-14:00. Storing it anyway
    // aborts the one transaction that writes the purchase, its items, its
    // charges and its documents — so the shop is lost, after the reading
    // has already been paid for.
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
      capture: { capturedAt: '2026-08-01T14:32:07+20:00' },
    });

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    const [row] = captureRows();
    expect(row?.capturedAt).toBe('2026-07-31T18:32:07.000Z');
    expect(row?.utcOffsetMinutes).toBeNull();
  });

  it('keeps the receipt when the camera wrote one', async () => {
    const photographed = jpegWithExif({
      dateTimeOriginal: '2026:08:01 14:32:07',
      offsetTimeOriginal: '+20:00',
    }).toString('base64');

    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: photographed }],
    });

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe('created');
    expect(captureRows()[0]?.utcOffsetMinutes).toBeNull();
  });

  it('changes nothing for an upload that sends no capture block', async () => {
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
    });
    expect(response.status).toBe(200);
    expect(response.body.purchase.purchase.orderedAt).toBe('2026-08-01T04:32:00.000Z');
    // No claim was made, so no row asserts that one was examined.
    expect(captureRows()).toHaveLength(0);
  });
});

describe('what the photograph says about itself', () => {
  it('records the shutter time and the coordinates the camera wrote', async () => {
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PHOTOGRAPHED_IN_SYDNEY }],
    });

    expect(response.status).toBe(200);
    const [row] = captureRows();
    expect(row?.capturedAt).toBe('2026-08-01T04:32:07.000Z');
    expect(row?.capturedAtSource).toBe('exif');
    expect(row?.utcOffsetMinutes).toBe(600);
    expect(row?.latitude).toBeCloseTo(-33.8678, 3);
    expect(row?.longitude).toBeCloseTo(151.2072, 3);
    expect(row?.locationSource).toBe('exif');
  });

  it('dates an undated receipt from the shutter rather than from the upload', async () => {
    const response = await post(appWith({ ...READING, purchasedOn: null }), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PHOTOGRAPHED_IN_SYDNEY }],
    });
    expect(response.body.purchase.purchase.orderedAt).toBe('2026-08-01T04:32:07.000Z');
    expect(response.body.purchase.tags).toContain('date-uncertain');
  });

  it('lets the client override the camera, fact by fact', async () => {
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PHOTOGRAPHED_IN_SYDNEY }],
      capture: { location: { latitude: 1.5, longitude: 2.5 } },
    });

    expect(response.status).toBe(200);
    const [row] = captureRows();
    expect(row?.latitude).toBeCloseTo(1.5, 6);
    expect(row?.locationSource).toBe('client');
    // Nothing in the body said when, so the camera still answers that.
    expect(row?.capturedAtSource).toBe('exif');
  });

  it('accepts a photograph whose metadata was stripped, as most are', async () => {
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
    });
    expect(response.status).toBe(200);
    expect(captureRows()).toHaveLength(0);
  });
});

describe('a location is sensitive data', () => {
  it('never appears in the response that stored it', async () => {
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PHOTOGRAPHED_IN_SYDNEY }],
      capture: { location: { latitude: -31.9523, longitude: 115.8613 } },
    });

    expect(captureRows()).toHaveLength(1);
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('31.95');
    expect(serialised).not.toContain('115.86');
    expect(serialised).not.toContain('latitude');
  });

  it('is not echoed back when the contract refuses it', async () => {
    // A validation error that quotes the value it refused has published the
    // value. ts-rest's own issue list is dropped for exactly this reason.
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
      capture: { location: { latitude: -931.9523, longitude: 115.8613 } },
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('931.95');
    expect(captureRows()).toHaveLength(0);
  });

  it('refuses a coordinate that is not on the globe rather than storing it', async () => {
    for (const location of [
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: 181 },
    ]) {
      const response = await post(appWith(), {
        parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
        capture: { location },
      });
      expect(response.status).toBe(400);
    }
    expect(captureRows()).toHaveLength(0);
  });

  it('never reaches the vision prompt', async () => {
    // The pillar's standing rule is that only what the paper shows goes to
    // the Anthropic API — merchant descriptions, never account or card
    // numbers. A coordinate is on the same side of that line, along with the
    // device clock and the device zone.
    //
    // `ReceiptVision.read` takes the parts and nothing else, so this is
    // structural today. The assertion exists because that is precisely how it
    // stops being structural: somebody widens the struct the prompt is built
    // from, and every other test in this pillar still passes.
    const seen: unknown[] = [];
    const watching: ReceiptVision = {
      read: async (parts) => {
        seen.push(parts);
        return JSON.stringify(READING);
      },
    };
    const app = createPurchasesApiApp({
      purchasesDb: opened,
      version: '1.2.3',
      selfBaseUrl: 'http://localhost:3013',
      vision: watching,
      merchant: NO_MERCHANT,
    });

    await post(app, {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PHOTOGRAPHED_IN_SYDNEY }],
      capture: {
        capturedAt: '2026-08-01T14:32:00+10:00',
        timeZone: 'Australia/Perth',
        location: { latitude: -31.9523, longitude: 115.8613 },
      },
    });

    expect(seen).toHaveLength(1);
    const serialised = JSON.stringify(seen);
    for (const forbidden of [
      'latitude',
      'longitude',
      'location',
      '31.95',
      '115.86',
      'Australia/Perth',
      'capturedAt',
      'timeZone',
    ]) {
      expect(serialised).not.toContain(forbidden);
    }

    // The photograph's own bytes DO go to the model, and those bytes contain
    // the EXIF block this receipt's location was read out of. That is the
    // file rather than a field the pillar extracted and forwarded, and the
    // model has to see it to read the receipt at all.
    expect(serialised).toContain('dataBase64');
  });
});

describe('a receiver that had nothing to say', () => {
  it('does not store Null Island when the client sends it', async () => {
    // A geolocation call that failed reports `0, 0` as readily as one that
    // succeeded reports a place. It satisfies every bound and both column
    // CHECKs, so nothing downstream would catch it — and every fixless
    // upload would land at the same plausible-looking point in open water
    // off Ghana.
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
      capture: {
        capturedAt: '2026-08-01T14:32:00+10:00',
        location: { latitude: 0, longitude: 0 },
      },
    });

    expect(response.status).toBe(200);
    const [row] = captureRows();
    // The upload is kept and the clock is still recorded — only the
    // non-place is dropped.
    expect(row?.capturedAt).not.toBeNull();
    expect(row?.latitude).toBeNull();
    expect(row?.longitude).toBeNull();
    expect(row?.locationSource).toBeNull();
  });

  it('does not store Null Island when a camera wrote it into the file', async () => {
    const fixless = jpegWithExif({
      dateTimeOriginal: '2026:08:01 14:32:07',
      offsetTimeOriginal: '+10:00',
      gps: {
        latitude: dms(0, 0, 0),
        latitudeRef: 'N',
        longitude: dms(0, 0, 0),
        longitudeRef: 'E',
      },
    }).toString('base64');

    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: fixless }],
    });

    expect(response.status).toBe(200);
    const [row] = captureRows();
    expect(row?.capturedAt).not.toBeNull();
    expect(row?.latitude).toBeNull();
    expect(row?.locationSource).toBeNull();
  });

  it('still stores a coordinate that is only nearly zero', async () => {
    // The rule is exactly `0, 0`, not "near the origin". A real fix in the
    // Gulf of Guinea is a place, and rounding the rule outwards would start
    // discarding them.
    const response = await post(appWith(), {
      parts: [{ mediaType: 'image/jpeg', dataBase64: PLAIN_JPEG }],
      capture: { location: { latitude: 0, longitude: 0.0001 } },
    });

    expect(response.status).toBe(200);
    const [row] = captureRows();
    expect(row?.longitude).toBeCloseTo(0.0001, 6);
    expect(row?.locationSource).toBe('client');
  });
});
