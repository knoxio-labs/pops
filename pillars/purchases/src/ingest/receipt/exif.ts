/**
 * What a photograph says about itself: when the shutter fired, and where.
 *
 * A receipt that prints no date is dated from its upload, which is the
 * weakest evidence in the pillar — a fact about the server, not about the
 * shop. `DateTimeOriginal` is strictly closer to the event. And a receipt
 * says nothing at all about where it was bought beyond whatever address it
 * happens to print, while the photograph carries a coordinate.
 *
 * Both were already sitting in the file nobody was reading.
 *
 * ## Location is read on purpose
 *
 * This reader resolves the GPS IFD, and that is a decision rather than a side
 * effect of using a general EXIF library — see
 * [ADR-047](../../../../../docs/architecture/adr-047-purchases-stores-capture-location.md).
 * Read that before widening what this returns. Two of its consequences are
 * load-bearing here: a coordinate never reaches a model prompt
 * (`../../api/rest/receipt-capture.ts`), and it describes where the
 * PHOTOGRAPH was taken, which is not always where the shop is.
 *
 * **This file is the whole list of what the pillar learns from an image.**
 * Six tags, named below, and nothing else — which is why it is hand-written
 * rather than a dependency whose next version decides that for us, and why
 * the TIFF plumbing lives in `exif-tiff.ts` instead of crowding the list. It
 * also costs `purchases` no new dependency.
 *
 * ## JPEG only, and absence is ordinary
 *
 * EXIF in a JPEG APP1 segment is what phone cameras write. PNG, WebP, GIF,
 * PDF and pasted text either cannot carry this or do not in practice, and
 * every one of them is an accepted upload — so nothing is the common answer,
 * not a failure. Many phones strip EXIF on share, screenshots have none, and
 * the fleet's own web upload path re-encodes through a canvas
 * (`libs/ui/src/hooks/useImageProcessor.ts`), which drops it.
 */
import {
  TYPE_RATIONAL,
  asciiValue,
  exifTiffBlock,
  readIfd,
  readTiffHeader,
  subIfdAt,
  u32,
  valueAt,
} from './exif-tiff.js';

import type { IfdEntry, Tiff } from './exif-tiff.js';

/** A wall-clock reading off the camera, and the offset it was taken at. */
export interface ExifCaptureTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  /**
   * Minutes ahead of UTC at the moment of capture, from `OffsetTimeOriginal`.
   * Null when the camera wrote none — most do not — leaving the reading a
   * bare wall clock that only a zone can place.
   */
  readonly offsetMinutes: number | null;
}

/** Where the shutter fired, in signed decimal degrees. */
export interface ExifLocation {
  /** -90 to 90. South is negative. */
  readonly latitude: number;
  /** -180 to 180. West is negative. */
  readonly longitude: number;
}

/**
 * Everything this reader will say about a photograph.
 *
 * Two independent halves: a file can carry a capture time and no fix, a fix
 * and no time, or neither. Nothing here fails as a unit.
 */
export interface ExifReading {
  readonly time: ExifCaptureTime | null;
  readonly location: ExifLocation | null;
}

/** No EXIF, or none this reader could believe. */
export const NO_EXIF: ExifReading = { time: null, location: null };

/** The six tags this pillar reads, and the two pointers that reach them. */
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_GPS_LATITUDE_REF = 0x0001;
const TAG_GPS_LATITUDE = 0x0002;
const TAG_GPS_LONGITUDE_REF = 0x0003;
const TAG_GPS_LONGITUDE = 0x0004;

/** Degrees, minutes and seconds — the three rationals a GPS angle is. */
const ANGLE_COMPONENTS = 3;
/** Two `uint32` per rational. */
const RATIONAL_BYTES = 8;

/** `YYYY:MM:DD HH:MM:SS`, the only shape EXIF states a capture time in. */
const DATE_TIME_RE = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u;

/** `+HH:MM` or `-HH:MM`. `Z` is not a value this tag takes. */
const OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/u;

function offsetMinutesOf(value: string | null): number | null {
  if (value === null) return null;
  const match = OFFSET_RE.exec(value.trim());
  if (match === null) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  // A camera writing an hour or minute field out of range is writing
  // nonsense, and a nonsense offset placed on a real wall clock is worse than
  // no offset at all — it would look authoritative.
  if (hours > 23 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return match[1] === '-' ? -total : total;
}

/**
 * One GPS angle, in decimal degrees, unsigned.
 *
 * EXIF stores it as three rationals — degrees, minutes, seconds — each a
 * numerator over a denominator. A zero denominator is not a zero angle, it is
 * a corrupt field, and treating it as `0` would put the receipt on the
 * equator rather than nowhere.
 */
function angleDegrees(tiff: Tiff, entry: IfdEntry): number | null {
  if (entry.type !== TYPE_RATIONAL || entry.count !== ANGLE_COMPONENTS) return null;
  const at = valueAt(tiff, entry, ANGLE_COMPONENTS * RATIONAL_BYTES);
  if (at === null) return null;

  let degrees = 0;
  for (let index = 0; index < ANGLE_COMPONENTS; index += 1) {
    const numerator = u32(tiff, at + index * RATIONAL_BYTES);
    const denominator = u32(tiff, at + index * RATIONAL_BYTES + 4);
    if (numerator === null || denominator === null || denominator === 0) return null;
    degrees += numerator / denominator / 60 ** index;
  }
  return Number.isFinite(degrees) ? degrees : null;
}

/** Which way a hemisphere letter points, or null when it is neither. */
function hemisphereSign(
  letter: string | undefined,
  negative: string,
  positive: string
): number | null {
  if (letter === negative) return -1;
  if (letter === positive) return 1;
  return null;
}

/**
 * One signed axis: the angle, with its hemisphere letter applied.
 *
 * A letter that is not one of the pair is a hemisphere nobody can place, not
 * a default to fall back on.
 */
function signedAngle(
  tiff: Tiff,
  entries: readonly IfdEntry[],
  tags: { readonly angle: number; readonly reference: number },
  hemispheres: { readonly negative: string; readonly positive: string }
): number | null {
  const angleEntry = entries.find((entry) => entry.tag === tags.angle);
  const referenceEntry = entries.find((entry) => entry.tag === tags.reference);
  if (angleEntry === undefined || referenceEntry === undefined) return null;

  const letter = asciiValue(tiff, referenceEntry)?.trim().toUpperCase();
  const sign = hemisphereSign(letter, hemispheres.negative, hemispheres.positive);
  const size = angleDegrees(tiff, angleEntry);
  return sign === null || size === null ? null : sign * size;
}

/**
 * The fix a photograph states, or null.
 *
 * Beyond "the tags are absent", three ways to get null, each a real file
 * rather than a hypothetical:
 *
 * - a hemisphere letter that is not one of the four, or an angle whose
 *   rationals do not decode — a corrupt block, not a place;
 * - an angle out of range, which no receiver produces and no reader should
 *   pass on: a latitude of 200 is a bug somewhere upstream, and storing it
 *   would put the purchase at a point that does not exist;
 * - exactly `0, 0`. Null Island is where a device with no fix writes zeros,
 *   and it is 600km off the coast of Ghana. Nobody's receipt is from there,
 *   and a real fix landing on it to the full precision of three rationals is
 *   not a case worth preserving at the cost of admitting every unset one.
 */
function readLocation(tiff: Tiff, gpsIfdAt: number): ExifLocation | null {
  const entries = readIfd(tiff, gpsIfdAt);
  const latitude = signedAngle(
    tiff,
    entries,
    { angle: TAG_GPS_LATITUDE, reference: TAG_GPS_LATITUDE_REF },
    { negative: 'S', positive: 'N' }
  );
  const longitude = signedAngle(
    tiff,
    entries,
    { angle: TAG_GPS_LONGITUDE, reference: TAG_GPS_LONGITUDE_REF },
    { negative: 'W', positive: 'E' }
  );
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}

/**
 * The wall clock the Exif sub-IFD states, or null.
 *
 * Seconds are dropped. A purchase instant derived from a photograph is
 * evidence about which minute the shop happened in, and carrying a second the
 * receipt never stated would suggest a precision the inference does not have.
 *
 * The reading is not checked for plausibility here — `0000:00:00 00:00:00`,
 * which some cameras write for "unset", parses fine as digits. Deciding
 * whether a moment could have happened belongs with the upload instant it has
 * to be compared against, in `capture.ts`.
 */
function readCaptureTime(tiff: Tiff, exifIfdAt: number): ExifCaptureTime | null {
  const entries = readIfd(tiff, exifIfdAt);
  const stamp = entries.find((entry) => entry.tag === TAG_DATE_TIME_ORIGINAL);
  if (stamp === undefined) return null;
  const parsed = DATE_TIME_RE.exec(asciiValue(tiff, stamp)?.trim() ?? '');
  if (parsed === null) return null;

  const offsetTag = entries.find((entry) => entry.tag === TAG_OFFSET_TIME_ORIGINAL);
  const offsetMinutes =
    offsetTag === undefined ? null : offsetMinutesOf(asciiValue(tiff, offsetTag));

  return {
    year: Number(parsed[1]),
    month: Number(parsed[2]),
    day: Number(parsed[3]),
    hour: Number(parsed[4]),
    minute: Number(parsed[5]),
    offsetMinutes,
  };
}

/** What a JPEG says about when and where it was taken. */
export function readExif(bytes: Buffer): ExifReading {
  const header = readTiffHeader(exifTiffBlock(bytes));
  if (header === null) return NO_EXIF;

  const { tiff } = header;
  const ifd0 = readIfd(tiff, header.ifd0At);
  const exifIfdAt = subIfdAt(tiff, ifd0, TAG_EXIF_IFD_POINTER);
  const gpsIfdAt = subIfdAt(tiff, ifd0, TAG_GPS_IFD_POINTER);

  return {
    time: exifIfdAt === null ? null : readCaptureTime(tiff, exifIfdAt),
    location: gpsIfdAt === null ? null : readLocation(tiff, gpsIfdAt),
  };
}
