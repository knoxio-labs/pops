/**
 * What a photograph says about itself.
 *
 * A receipt photograph carries evidence the paper does not.
 * `DateTimeOriginal` is when the shutter fired, `OffsetTimeOriginal` is the
 * UTC offset in force at that moment, and the GPS tags are where the phone
 * was standing. All three are recorded data rather than inference, which is
 * what makes them worth reading — the drop-zone otherwise infers a timezone
 * from a printed address and dates an undated receipt from its upload.
 *
 * **Absent metadata is the ordinary case, not a failure.** iOS and Android
 * both strip EXIF on share, a screenshot never had any, and a PDF invoice
 * is not a photograph at all. Every function here answers `null` for those
 * and the upload proceeds exactly as it did before.
 *
 * **This reads a photograph, not a shop.** A receipt photographed at home a
 * week later carries home's coordinates and that week's date, which is why
 * `capture.ts` ranks what comes out of here below the timezone inferred
 * from the receipt's own printed address. Nothing in this file decides how
 * far to trust its own output.
 *
 * No dependency. Four tags are needed and the containers that carry them
 * are a few dozen lines each, where an EXIF library is a large parser
 * running over bytes an untrusted client uploaded. Everything here is
 * bounds-checked and returns `null` rather than throwing, so a truncated,
 * malformed or hostile file costs a reading and never an upload.
 */
import { tiffBlockOf } from './exif-containers.js';
import {
  asciiOf,
  entriesAt,
  pointerOf,
  rationalTripleOf,
  tiffOf,
  type Entry,
  type Tiff,
} from './exif-tiff.js';

import type { ReceiptMediaType } from './vision.js';

/** Where the phone was when the shutter fired. Sensitive: never logged. */
export interface CaptureLocation {
  /** Signed decimal degrees, south negative. */
  readonly latitude: number;
  /** Signed decimal degrees, west negative. */
  readonly longitude: number;
}

/** The wall clock the camera wrote, with no zone attached to it. */
export interface CaptureLocalTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** Whatever the file stated, with every field independently optional. */
export interface PhotoCapture {
  readonly localTime: CaptureLocalTime | null;
  /** Minutes ahead of UTC at the moment of capture, when the file states one. */
  readonly utcOffsetMinutes: number | null;
  readonly location: CaptureLocation | null;
}

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_GPS_LATITUDE_REF = 0x0001;
const TAG_GPS_LATITUDE = 0x0002;
const TAG_GPS_LONGITUDE_REF = 0x0003;
const TAG_GPS_LONGITUDE = 0x0004;

const DATE_TIME_RE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/u;

function inRange(value: number, low: number, high: number): boolean {
  return value >= low && value <= high;
}

/**
 * `2026:08:01 14:32:07` → parts, or null.
 *
 * Cameras that have never held a date write the field as zeroes or spaces
 * rather than omitting it, and a zeroed date parses as year 0 — a confident
 * reading of nothing. The ranges are checked here; whether the parts name a
 * real day is settled by `local-time.ts`, which already refuses 31 February.
 */
function parseExifDateTime(value: string | null): CaptureLocalTime | null {
  if (value === null) return null;
  const match = DATE_TIME_RE.exec(value);
  if (match === null) return null;

  // `Number(undefined)` is NaN, which fails every range below — so a group
  // the regex somehow did not fill needs no separate check.
  const group = (index: number): number => Number(match[index]);
  const parts = {
    year: group(1),
    month: group(2),
    day: group(3),
    hour: group(4),
    minute: group(5),
    second: group(6),
  };

  return plausibleDateTime(parts) ? parts : null;
}

function plausibleDateTime(parts: CaptureLocalTime): boolean {
  return (
    inRange(parts.year, 1900, 9999) &&
    inRange(parts.month, 1, 12) &&
    inRange(parts.day, 1, 31) &&
    inRange(parts.hour, 0, 23) &&
    inRange(parts.minute, 0, 59) &&
    inRange(parts.second, 0, 59)
  );
}

const OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/u;

/** `+11:00` → 660. The EXIF field has no other legal form. */
function parseExifOffset(value: string | null): number | null {
  if (value === null) return null;
  const match = OFFSET_RE.exec(value);
  if (match === null) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return match[1] === '-' ? -total : total;
}

function coordinate(
  dms: [number, number, number] | null,
  ref: string | null,
  negativeRef: string,
  limit: number
): number | null {
  if (dms === null || ref === null) return null;
  const [degrees, minutes, seconds] = dms;
  const magnitude = degrees + minutes / 60 + seconds / 3600;
  if (!Number.isFinite(magnitude) || magnitude > limit) return null;
  const upper = ref.toUpperCase();
  if (upper !== negativeRef && upper !== positiveRef(negativeRef)) return null;
  return upper === negativeRef ? -magnitude : magnitude;
}

function positiveRef(negativeRef: string): string {
  return negativeRef === 'S' ? 'N' : 'E';
}

function locationFrom(tiff: Tiff, gps: Map<number, Entry>): CaptureLocation | null {
  const latitude = coordinate(
    rationalTripleOf(tiff, gps.get(TAG_GPS_LATITUDE)),
    asciiOf(tiff, gps.get(TAG_GPS_LATITUDE_REF)),
    'S',
    90
  );
  const longitude = coordinate(
    rationalTripleOf(tiff, gps.get(TAG_GPS_LONGITUDE)),
    asciiOf(tiff, gps.get(TAG_GPS_LONGITUDE_REF)),
    'W',
    180
  );
  // Half a coordinate is not a place. Both or neither.
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

/**
 * Read the capture tags out of a raw TIFF block.
 *
 * Only IFD0 and the two directories it points at are visited. IFD1
 * describes the embedded thumbnail, which is a different image of the same
 * scene and states nothing this pillar wants.
 */
function readTiff(bytes: Buffer): PhotoCapture | null {
  const header = tiffOf(bytes);
  if (header === null) return null;
  const { tiff, ifd0At } = header;
  const ifd0 = entriesAt(tiff, ifd0At);

  const exifAt = pointerOf(tiff, ifd0.get(TAG_EXIF_IFD));
  const exif = exifAt === null ? new Map<number, Entry>() : entriesAt(tiff, exifAt);
  const gpsAt = pointerOf(tiff, ifd0.get(TAG_GPS_IFD));
  const gps = gpsAt === null ? new Map<number, Entry>() : entriesAt(tiff, gpsAt);

  const localTime = parseExifDateTime(asciiOf(tiff, exif.get(TAG_DATE_TIME_ORIGINAL)));
  const utcOffsetMinutes = parseExifOffset(asciiOf(tiff, exif.get(TAG_OFFSET_TIME_ORIGINAL)));
  const location = locationFrom(tiff, gps);

  if (localTime === null && utcOffsetMinutes === null && location === null) return null;
  return { localTime, utcOffsetMinutes, location };
}

/**
 * What this file says about when and where it was taken, or `null`.
 *
 * `null` is the ordinary answer: phones strip EXIF on share, screenshots
 * never had it, and a pasted email body is not a photograph.
 */
export function readPhotoCapture(bytes: Buffer, mediaType: ReceiptMediaType): PhotoCapture | null {
  const tiff = tiffBlockOf(bytes, mediaType);
  return tiff === null ? null : readTiff(tiff);
}
