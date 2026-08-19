/**
 * When the photograph was taken, from whoever knew.
 *
 * Three sources can say when a receipt was captured, and they are not equally
 * good:
 *
 * 1. the client said so on the upload body — a phone at the till knows;
 * 2. the photograph's own EXIF said so (`exif.ts`);
 * 3. nobody said, and the upload instant is all there is.
 *
 * None of them outranks the date the receipt itself prints. A photo taken at
 * the till and a photo of the same slip taken at home a week later must
 * produce the same purchase date, and only the paper knows that. Capture time
 * replaces the *upload* instant in the undated fallback — a strictly better
 * guess in the same slot, still tagged `date-uncertain`, because it is still
 * not something the receipt said.
 *
 * ## Why capture time is checked at all
 *
 * Both sources are clocks this fleet does not own. A handset whose battery
 * died and came back at the Unix epoch, a camera that never had its date set,
 * a device someone put forward to unlock something — each produces a
 * confident timestamp that is wrong by years. A receipt dated 2041 entering
 * the ledger is not a cosmetic defect: it sits outside every reconciliation
 * window forever, and it distorts any spend total that has no upper bound on
 * its date range.
 *
 * So a capture instant is used only if it falls inside a window it could
 * plausibly have happened in, and is otherwise discarded — falling through to
 * the next source, exactly as though the device had said nothing. Discarded
 * rather than refused: the bytes are the evidence and the pillar's whole
 * posture is to keep them (see `receipt-handlers.ts`). A phone with a broken
 * clock cannot fix it by retrying, so answering `400` would cost the receipt
 * and buy nothing.
 *
 * ## Location rides along, and is not a clock
 *
 * The same EXIF block states where the shutter fired, and the pillar stores
 * it — [ADR-047](../../../../../docs/architecture/adr-047-purchases-stores-capture-location.md).
 * It gets no ranking of its own because nothing competes with it: the paper
 * does not state a coordinate and the server has none. Either the photograph
 * carried a believable fix or the purchase has no location, and both are
 * ordinary.
 *
 * It is deliberately not used to derive a zone. Turning a coordinate into an
 * IANA zone needs a shapefile this pillar does not carry, and the model has
 * already read the printed address, which is about the shop rather than
 * about the photographer.
 */
import { instantFromLocalParts, instantFromLocalPartsAtOffset } from '../local-time.js';
import { NO_EXIF } from './exif.js';

import type { ExifCaptureTime, ExifLocation, ExifReading } from './exif.js';

/**
 * The earliest moment a photographed receipt could have been captured for.
 *
 * Not a guess at the fleet's own age — a floor low enough that no real
 * photograph is refused and high enough that the two failure modes that
 * actually occur are. A dead-battery clock resets to 1970 and an unset camera
 * clock to its firmware's epoch, typically 1980; both land below this, and
 * neither is a receipt.
 */
export const EARLIEST_PLAUSIBLE_CAPTURE = Date.UTC(2000, 0, 1);

/**
 * How far past the upload a capture instant may still be believed.
 *
 * A photograph cannot be taken after it is uploaded, so the true ceiling is
 * the upload itself. The allowance is for the device's clock rather than for
 * the sequence: an unsynchronised handset drifts, and one restored from a
 * backup or brought back from a flat battery can be a day out while still
 * describing a shop that really happened this week. Beyond that the reading
 * is not drift, it is a wrong clock, and a wrong clock is worse evidence than
 * the upload time it would replace.
 */
export const CLOCK_SKEW_ALLOWANCE_MS = 24 * 60 * 60 * 1000;

/**
 * The candidate instant, normalised to UTC, or null when it could not have
 * happened.
 *
 * Normalised because everything downstream compares `orderedAt` values as
 * instants, and two spellings of the same moment (`+11:00` and `Z`) would
 * make an equality check on the column lie.
 */
export function plausibleCaptureInstant(
  candidate: string | null | undefined,
  uploadedAt: string
): string | null {
  if (candidate === null || candidate === undefined || candidate === '') return null;
  const at = Date.parse(candidate);
  if (Number.isNaN(at)) return null;

  const upload = Date.parse(uploadedAt);
  const ceiling = (Number.isNaN(upload) ? Date.now() : upload) + CLOCK_SKEW_ALLOWANCE_MS;
  if (at < EARLIEST_PLAUSIBLE_CAPTURE || at > ceiling) return null;

  return new Date(at).toISOString();
}

/**
 * An EXIF reading resolved to an instant, or null.
 *
 * With `OffsetTimeOriginal` the reading is already absolute and the zone is
 * not consulted. Without it the wall clock is bare, and the receipt's own
 * resolved zone is the best available placing — wrong only if the photograph
 * was taken in a different zone from the one the shop is in, which costs
 * hours on a value whose whole job is to beat the upload instant.
 */
export function exifCaptureInstant(exif: ExifCaptureTime | null, zone: string): string | null {
  if (exif === null) return null;
  return exif.offsetMinutes === null
    ? instantFromLocalParts(exif, zone)
    : instantFromLocalPartsAtOffset(exif, exif.offsetMinutes);
}

/** What the caller knew about the capture, before any of it is believed. */
export interface ReceiptCapture {
  /** ISO instant with an offset, from the uploading client's own clock. */
  readonly capturedAt: string | null;
  /** IANA zone the uploading client was in. Validated against the runtime. */
  readonly timeZone: string | null;
  /** Read out of the first photograph's bytes. */
  readonly exif: ExifReading;
}

/** Nothing was supplied and nothing was readable — the plain upload path. */
export const NO_CAPTURE: ReceiptCapture = {
  capturedAt: null,
  timeZone: null,
  exif: NO_EXIF,
};

/**
 * Where the photograph was taken, when it said.
 *
 * Named for the photograph rather than for the purchase, everywhere it
 * appears, because the two are only usually the same place: a receipt
 * photographed at home a week later carries home's coordinate. Calling the
 * column `purchase_location` would be a claim the data cannot support.
 */
export function captureLocation(capture: ReceiptCapture): ExifLocation | null {
  return capture.exif.location;
}

/**
 * The best believable capture instant, client first, EXIF second.
 *
 * The client wins because it is the only source that can be certain: a phone
 * uploading at the till reports its own clock at the moment of capture,
 * where EXIF may belong to a photograph taken a week earlier and shared on.
 * An implausible client value does not veto EXIF — it is discarded, and EXIF
 * gets the slot it would have had anyway.
 */
export function captureInstant(
  capture: ReceiptCapture,
  zone: string,
  uploadedAt: string
): string | null {
  return (
    plausibleCaptureInstant(capture.capturedAt, uploadedAt) ??
    plausibleCaptureInstant(exifCaptureInstant(capture.exif.time, zone), uploadedAt)
  );
}
