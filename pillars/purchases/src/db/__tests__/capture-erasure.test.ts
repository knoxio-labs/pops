/**
 * `eraseCaptureLocation` — the one way to take a stored capture location
 * back without deleting the order it belongs to.
 *
 * The cascade off `purchases` (asserted in `schema-invariants.test.ts`,
 * "goes with the order it describes") stays the only path that removes the
 * whole `purchase_capture` row. This is narrower: it nulls the coordinate
 * pair and `location_source`, leaving `capturedAt` and its timezone
 * provenance — the row's other reason to exist — untouched.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase, eraseCaptureLocation, getPurchase } from '../index.js';
import { purchaseCapture, purchases } from '../schema.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

function insertCaptureRow(purchaseId: string): void {
  opened.db
    .insert(purchaseCapture)
    .values({
      purchaseId,
      capturedAt: '2026-08-01T04:32:07.000Z',
      capturedAtSource: 'exif',
      latitude: -33.87,
      longitude: 151.21,
      locationSource: 'exif',
    })
    .run();
}

describe('eraseCaptureLocation', () => {
  it('nulls the coordinate pair and location source, keeping capturedAt provenance', () => {
    const purchaseId = createPurchase(opened.db, amazonOrder());
    insertCaptureRow(purchaseId);

    expect(eraseCaptureLocation(opened.db, purchaseId)).toBe(true);

    const [row] = opened.db
      .select()
      .from(purchaseCapture)
      .where(eq(purchaseCapture.purchaseId, purchaseId))
      .all();
    expect(row?.latitude).toBeNull();
    expect(row?.longitude).toBeNull();
    expect(row?.locationSource).toBeNull();
    expect(row?.capturedAt).toBe('2026-08-01T04:32:07.000Z');
    expect(row?.capturedAtSource).toBe('exif');
  });

  it('leaves the purchase, its items and its charges intact', () => {
    const purchaseId = createPurchase(
      opened.db,
      amazonOrder({
        shipments: [{ ref: 'box1' }],
        items: [
          {
            ref: 'a',
            shipmentRef: 'box1',
            name: 'Widget',
            unitPriceCents: 500,
            lineTotalCents: 500,
          },
        ],
        charges: [{ sourceChargeRef: 'c', amountCents: 500 }],
      })
    );
    insertCaptureRow(purchaseId);

    expect(eraseCaptureLocation(opened.db, purchaseId)).toBe(true);

    const detail = getPurchase(opened.db, purchaseId);
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]?.item.name).toBe('Widget');
    expect(detail?.charges).toHaveLength(1);
    expect(detail?.charges[0]?.charge.amountCents).toBe(500);
  });

  it('is idempotent — a purchase with no capture row still reports success', () => {
    const purchaseId = createPurchase(opened.db, amazonOrder());

    expect(eraseCaptureLocation(opened.db, purchaseId)).toBe(true);
    expect(eraseCaptureLocation(opened.db, purchaseId)).toBe(true);
    expect(
      opened.db
        .select()
        .from(purchaseCapture)
        .where(eq(purchaseCapture.purchaseId, purchaseId))
        .all()
    ).toEqual([]);
  });

  it('is idempotent — a second erase on an already-stripped location still succeeds', () => {
    const purchaseId = createPurchase(opened.db, amazonOrder());
    insertCaptureRow(purchaseId);

    expect(eraseCaptureLocation(opened.db, purchaseId)).toBe(true);
    expect(eraseCaptureLocation(opened.db, purchaseId)).toBe(true);
  });

  it('reports false for a purchase that does not exist, and writes nothing', () => {
    expect(eraseCaptureLocation(opened.db, 'no-such-purchase')).toBe(false);
    expect(opened.db.select().from(purchases).all()).toEqual([]);
  });
});
