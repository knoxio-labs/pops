/**
 * Synthetic JPEGs wrapping the EXIF blocks `exif-bytes.ts` writes.
 *
 * These carry no image data. The reader stops at the first scan marker and
 * never looks at pixels, so a JPEG that is only its header is a complete
 * subject for it — and a real photograph as a fixture would be megabytes of
 * bytes nothing asserts on.
 */
import { tiffBlock } from './exif-bytes.js';

import type { ExifFixtureOptions } from './exif-bytes.js';

export { SYDNEY_GPS, degrees } from './gps-fixtures.js';
export type { GpsFixture, Rational } from './gps-fixtures.js';
export type { ExifFixtureOptions } from './exif-bytes.js';

const JFIF_APP0 = Buffer.from([
  0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
]);

/** A start-of-scan header and a little "pixel" data behind it. */
const SCAN = Buffer.concat([
  Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
  Buffer.alloc(32, 0x5a),
]);

const EOI = Buffer.from([0xff, 0xd9]);

function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt8(0xff, 0);
  header.writeUInt8(marker, 1);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** `SOI`, the given segments, then a scan and an end-of-image. */
function jpeg(segments: readonly Buffer[]): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8]), ...segments, SCAN, EOI]);
}

function exifApp1(options: ExifFixtureOptions): Buffer {
  return segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiffBlock(options)]));
}

/** A JPEG with no EXIF at all — a screenshot, or a re-encoded upload. */
export function jpegWithoutExif(): Buffer {
  return jpeg([segment(0xe0, JFIF_APP0)]);
}

/** A JPEG whose APP1 segment holds the EXIF the options describe. */
export function jpegWithExif(options: ExifFixtureOptions): Buffer {
  return jpeg([segment(0xe0, JFIF_APP0), exifApp1(options)]);
}

/**
 * A JPEG cut off mid-APP1, so the segment's declared length runs past the end
 * of the file — the shape a partly-transferred upload takes.
 */
export function jpegWithTruncatedApp1(): Buffer {
  return jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07' }).subarray(0, 30);
}

/**
 * A JPEG whose only EXIF-shaped bytes sit AFTER the start of the scan — a
 * complete, well-formed APP1 segment, in the place image data belongs.
 *
 * Compressed pixels are arbitrary bytes and can spell anything, including a
 * marker and a length. A reader that scanned for `Exif\0\0`, or that kept
 * walking the marker chain past the scan, would read this as the photograph's
 * capture time. The file's actual EXIF says nothing, so the only right answer
 * is nothing.
 */
export function jpegWithExifAfterScanStart(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, JFIF_APP0),
    SCAN,
    exifApp1({ dateTimeOriginal: '1999:12:31 23:59:00' }),
    EOI,
  ]);
}
