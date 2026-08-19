/**
 * Writing `purchase_capture` — when and where an uploaded receipt was
 * photographed.
 *
 * Its own module for the same reason it is its own table: the coordinates
 * are the most sensitive thing this pillar stores, and the one function
 * that writes them is easier to hold to that when it is not buried in the
 * order-ingest path. Nothing here logs a value.
 */
import { purchaseCapture } from '../schema.js';

import type { CaptureSource } from '../../contract/constants.js';
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
