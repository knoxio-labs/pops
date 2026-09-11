/**
 * `DELETE /purchases/:id/capture/location` — the API surface a reviewer
 * uses to strip a stored capture location while keeping the purchase.
 *
 * The sensitivity rule the endpoint holds: a coordinate is never echoed
 * back, including in the response confirming its own erasure. Asserted
 * directly on the serialised body, not just on what the schema declares.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, getPurchase } from '../../db/index.js';
import { purchaseCapture } from '../../db/schema.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;
let purchaseId: string;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  purchaseId = createPurchase(opened.db, amazonOrder());
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

function eraseLocation(id: string) {
  return requestOn(app).delete(`/purchases/${id}/capture/location`);
}

it('succeeds and never echoes either coordinate in the response', async () => {
  const res = await eraseLocation(purchaseId).expect(200);

  const serialised = JSON.stringify(res.body);
  expect(serialised).not.toContain('-33.87');
  expect(serialised).not.toContain('151.21');
  expect(res.body).toEqual({ ok: true });
});

it('leaves no readable location, while the order and its capture row stay', async () => {
  await eraseLocation(purchaseId).expect(200);

  const [row] = opened.db
    .select()
    .from(purchaseCapture)
    .where(eq(purchaseCapture.purchaseId, purchaseId))
    .all();
  expect(row?.latitude).toBeNull();
  expect(row?.longitude).toBeNull();
  expect(row?.locationSource).toBeNull();
  expect(row?.capturedAt).toBe('2026-08-01T04:32:07.000Z');

  const detail = getPurchase(opened.db, purchaseId);
  expect(detail?.purchase.id).toBe(purchaseId);
});

it('is idempotent — a second call still succeeds', async () => {
  await eraseLocation(purchaseId).expect(200);
  await eraseLocation(purchaseId).expect(200);
});

it('answers 404 for a purchase that does not exist', async () => {
  const res = await eraseLocation('no-such-purchase').expect(404);
  expect(res.body.code).toBe('NOT_FOUND');
});
