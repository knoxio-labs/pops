/**
 * An EXIF TIFF block, written byte by byte, for the reader's tests.
 *
 * Built rather than checked in as binaries. A malformed fixture has to be
 * malformed in one named way — a truncated block, an IFD claiming more
 * entries than it holds, a value pointer past the end, a rational over zero —
 * and a `.jpg` in a directory cannot say which. The reader's job is to
 * survive exactly those, so the fixtures have to be constructible on purpose
 * rather than found.
 *
 * Layout: header, IFD0 (pointing at the Exif sub-IFD, and optionally at a GPS
 * one), those sub-IFDs, then the values they point into. Every section's size
 * follows from its entry count, so the offsets are known before any bytes are
 * written and no pointer has to be patched afterwards.
 */
import { ifdBytes, ifdSize, inlineAscii, rationalBytes } from './tiff-writer.js';

import type { GpsFixture } from './gps-fixtures.js';
import type { Entry } from './tiff-writer.js';

export interface ExifFixtureOptions {
  /** `YYYY:MM:DD HH:MM:SS`, or absent for a photograph that states none. */
  readonly dateTimeOriginal?: string;
  /** `+HH:MM` / `-HH:MM`, or absent — most cameras write none. */
  readonly offsetTimeOriginal?: string;
  /** Big-endian (`MM`) rather than the little-endian most phones write. */
  readonly bigEndian?: boolean;
  /** Write a GPS IFD holding this fix, as a real phone photograph carries. */
  readonly gps?: GpsFixture;
  /** Write a GPS IFD pointer whose sub-IFD holds no coordinate tags. */
  readonly emptyGps?: boolean;
  /** Claim this many IFD0 entries regardless of how many are there. */
  readonly overstateIfd0Count?: number;
  /** Point every value past the end of the block. */
  readonly danglingValuePointer?: boolean;
  /** Keep only this many bytes of the block. */
  readonly truncateTiffTo?: number;
  /** Write something other than `II` / `MM` as the byte order. */
  readonly badByteOrder?: boolean;
  /** Write a TIFF magic number other than 42. */
  readonly badTiffMagic?: boolean;
}

const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

const TAG_GPS_LATITUDE_REF = 0x0001;
const TAG_GPS_LATITUDE = 0x0002;
const TAG_GPS_LONGITUDE_REF = 0x0003;
const TAG_GPS_LONGITUDE = 0x0004;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;

/** An offset no fixture is anywhere near, for the dangling-pointer case. */
const OFF_THE_END = 0x7fff_0000;

function tiffHeader(options: ExifFixtureOptions, littleEndian: boolean): Buffer {
  const header = Buffer.alloc(8);
  header.write(littleEndian ? 'II' : 'MM', 0, 'latin1');
  const magic = options.badTiffMagic === true ? 43 : 42;
  if (littleEndian) {
    header.writeUInt16LE(magic, 2);
    header.writeUInt32LE(8, 4);
  } else {
    header.writeUInt16BE(magic, 2);
    header.writeUInt32BE(8, 4);
  }
  if (options.badByteOrder === true) header.write('XX', 0, 'latin1');
  return header;
}

/** Where each section lands, once the entry counts are known. */
interface Layout {
  readonly subAt: number;
  readonly gpsAt: number;
  readonly stampAt: number;
  readonly offsetAt: number;
  readonly anglesAt: number;
}

interface Shape {
  readonly withGps: boolean;
  readonly gpsEntries: number;
  readonly stampLength: number;
  readonly offsetLength: number;
  readonly dangling: boolean;
}

function layoutOf(shape: Shape): Layout {
  const subAt = 8 + ifdSize(shape.withGps ? 2 : 1);
  const subEntries = (shape.stampLength === 0 ? 0 : 1) + (shape.offsetLength === 0 ? 0 : 1);
  const gpsAt = subAt + ifdSize(subEntries);
  const valuesAt = gpsAt + (shape.withGps ? ifdSize(shape.gpsEntries) : 0);

  return {
    subAt,
    gpsAt,
    stampAt: shape.dangling ? OFF_THE_END : valuesAt,
    offsetAt: shape.dangling ? OFF_THE_END : valuesAt + shape.stampLength,
    anglesAt: valuesAt + shape.stampLength + shape.offsetLength,
  };
}

function gpsIfd(fix: GpsFixture, anglesAt: number, littleEndian: boolean): Buffer {
  return ifdBytes(
    [
      {
        tag: TAG_GPS_LATITUDE_REF,
        type: TYPE_ASCII,
        count: 2,
        value: inlineAscii(fix.latitudeRef, littleEndian),
      },
      { tag: TAG_GPS_LATITUDE, type: TYPE_RATIONAL, count: 3, value: anglesAt },
      {
        tag: TAG_GPS_LONGITUDE_REF,
        type: TYPE_ASCII,
        count: 2,
        value: inlineAscii(fix.longitudeRef, littleEndian),
      },
      { tag: TAG_GPS_LONGITUDE, type: TYPE_RATIONAL, count: 3, value: anglesAt + 24 },
    ],
    littleEndian
  );
}

function ifd0Bytes(
  options: ExifFixtureOptions,
  shape: Shape,
  layout: Layout,
  littleEndian: boolean
): Buffer {
  const entries: Entry[] = [
    { tag: TAG_EXIF_IFD_POINTER, type: TYPE_LONG, count: 1, value: layout.subAt },
  ];
  if (shape.withGps) {
    entries.push({ tag: TAG_GPS_IFD_POINTER, type: TYPE_LONG, count: 1, value: layout.gpsAt });
  }

  const bytes = ifdBytes(entries, littleEndian);
  const overstated = options.overstateIfd0Count;
  if (overstated !== undefined) {
    if (littleEndian) bytes.writeUInt16LE(overstated, 0);
    else bytes.writeUInt16BE(overstated, 0);
  }
  return bytes;
}

function subIfdBytes(shape: Shape, layout: Layout, littleEndian: boolean): Buffer {
  const entries: Entry[] = [];
  if (shape.stampLength > 0) {
    entries.push({
      tag: TAG_DATE_TIME_ORIGINAL,
      type: TYPE_ASCII,
      count: shape.stampLength,
      value: layout.stampAt,
    });
  }
  if (shape.offsetLength > 0) {
    entries.push({
      tag: TAG_OFFSET_TIME_ORIGINAL,
      type: TYPE_ASCII,
      count: shape.offsetLength,
      value: layout.offsetAt,
    });
  }
  return ifdBytes(entries, littleEndian);
}

function nulTerminated(value: string | undefined): Buffer {
  return value === undefined ? Buffer.alloc(0) : Buffer.from(`${value}\0`, 'latin1');
}

/** The whole TIFF block the options describe. */
export function tiffBlock(options: ExifFixtureOptions): Buffer {
  const littleEndian = options.bigEndian !== true;
  const fix = options.gps;
  const stamp = nulTerminated(options.dateTimeOriginal);
  const offset = nulTerminated(options.offsetTimeOriginal);
  const shape: Shape = {
    withGps: fix !== undefined || options.emptyGps === true,
    gpsEntries: fix === undefined ? 0 : 4,
    stampLength: stamp.length,
    offsetLength: offset.length,
    dangling: options.danglingValuePointer === true,
  };
  const layout = layoutOf(shape);

  const gps =
    fix === undefined ? ifdBytes([], littleEndian) : gpsIfd(fix, layout.anglesAt, littleEndian);
  const angles =
    fix === undefined
      ? Buffer.alloc(0)
      : rationalBytes([...fix.latitude, ...fix.longitude], littleEndian);

  const block = Buffer.concat([
    tiffHeader(options, littleEndian),
    ifd0Bytes(options, shape, layout, littleEndian),
    subIfdBytes(shape, layout, littleEndian),
    ...(shape.withGps ? [gps] : []),
    stamp,
    offset,
    angles,
  ]);

  return options.truncateTiffTo === undefined ? block : block.subarray(0, options.truncateTiffTo);
}
