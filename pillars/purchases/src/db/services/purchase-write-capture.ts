/**
 * Writing `purchase_capture` — when and where an uploaded receipt was
 * photographed.
 *
 * Its own module for the same reason it is its own table: the coordinates
 * are the most sensitive thing this pillar stores, and the one function
 * that writes them is easier to hold to that when it is not buried in the
 * order-ingest path. Nothing here logs a value.
 */
import { eq } from 'drizzle-orm';

import { purchaseCapture, purchases } from '../schema.js';

import type { CaptureSource } from '../../contract/constants.js';
import type { PurchasesDb } from './internal.js';
import type { CreateCaptureInput } from './purchase-input.js';
import type { IngestContext } from './purchase-write-context.js';

interface LocationColumns {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly locationSource: CaptureSource | null;
}

/**
 * Both coordinates or neither.
 *
 * Half a coordinate is not a place, and storing one would leave a reader
 * either dividing by a missing half or reporting a point on the meridian.
 * The table carries the same rule as a CHECK, for a writer that has not
 * been written yet.
 */
function locationColumns(input: CreateCaptureInput): LocationColumns {
  if (input.latitude == null || input.longitude == null) {
    return { latitude: null, longitude: null, locationSource: null };
  }
  return {
    latitude: input.latitude,
    longitude: input.longitude,
    locationSource: input.locationSource ?? null,
  };
}

/**
 * Record the capture facts, when there are any.
 *
 * An input stating nothing writes no row: a row of NULLs asserts that a
 * capture event was examined and found empty, which is not the ordinary
 * case of nothing having been supplied. Callers therefore need no `if` of
 * their own.
 */
export function insertCapture(ctx: IngestContext, input: CreateCaptureInput | undefined): void {
  if (input === undefined) return;

  const location = locationColumns(input);
  const capturedAt = input.capturedAt ?? null;
  const utcOffsetMinutes = input.utcOffsetMinutes ?? null;
  const declaredTimeZone = input.declaredTimeZone ?? null;
  const stated =
    capturedAt !== null ||
    utcOffsetMinutes !== null ||
    declaredTimeZone !== null ||
    location.latitude !== null;
  if (!stated) return;

  ctx.tx
    .insert(purchaseCapture)
    .values({
      purchaseId: ctx.purchase.id,
      capturedAt,
      capturedAtSource: capturedAt === null ? null : (input.capturedAtSource ?? null),
      utcOffsetMinutes,
      declaredTimeZone,
      ...location,
      createdAt: ctx.now,
    })
    .run();
}

/**
 * Strip a purchase's stored capture location, keeping the purchase and
 * everything else the capture row holds.
 *
 * Nulls `latitude`, `longitude` and `location_source` rather than deleting
 * the row: `capturedAt` and its timezone provenance are a separate fact the
 * row also carries, and deleting it would erase that too. The CHECK the
 * table already declares (`ck_purchase_capture_location_pair`) is what
 * forces the pair to move together here as well as on every insert.
 *
 * Idempotent by design: a purchase with no capture row, or one whose
 * location is already null, both report success. Only an unknown purchase
 * id is a failure, reported as `false` so the caller can answer 404 without
 * this function needing to know about HTTP.
 */
export function eraseCaptureLocation(db: PurchasesDb, purchaseId: string): boolean {
  const found = db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .all()[0];
  if (found === undefined) return false;

  db.update(purchaseCapture)
    .set({ latitude: null, longitude: null, locationSource: null })
    .where(eq(purchaseCapture.purchaseId, purchaseId))
    .run();

  return true;
}
