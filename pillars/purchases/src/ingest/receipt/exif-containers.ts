/**
 * Where the EXIF block lives in each container.
 *
 * Three formats carry the same payload in three different envelopes: a
 * JPEG's APP1 segment, a PNG's `eXIf` chunk, a WebP's `EXIF` chunk. All
 * three hand back a raw TIFF block, which is the only thing `exif.ts`
 * knows how to read — so growing a fourth container is a change here and
 * nowhere else.
 *
 * Every walk is bounded by the lengths the file itself declares and
 * answers `null` rather than throwing. These bytes came from an upload.
 */
import type { ReceiptMediaType } from './vision.js';

const EXIF_HEADER = 'Exif\0\0';

const JPEG_SOI = 0xffd8;
const JPEG_APP1 = 0xffe1;
const JPEG_SOS = 0xffda;

/**
 * The TIFF block inside a JPEG's APP1 segment.
 *
 * Segments are walked by their declared length rather than scanned for, so
 * a marker-shaped pair of bytes inside compressed image data cannot be
 * mistaken for a segment header. The walk stops at the start of scan: EXIF
 * is always ahead of it, and everything after is entropy-coded.
 */
function jpegTiff(bytes: Buffer): Buffer | null {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== JPEG_SOI) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    const marker = bytes.readUInt16BE(at);
    if ((marker & 0xff00) !== 0xff00 || marker === JPEG_SOS) return null;
    const length = bytes.readUInt16BE(at + 2);
    // A segment's length includes its own two bytes; anything shorter would
    // step backwards and loop forever.
    if (length < 2 || at + 2 + length > bytes.length) return null;
    if (marker === JPEG_APP1) {
      const payload = bytes.subarray(at + 4, at + 2 + length);
      if (payload.subarray(0, 6).toString('ascii') === EXIF_HEADER) return payload.subarray(6);
    }
    at += 2 + length;
  }
  return null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CHUNK_OVERHEAD = 12;

/** The `eXIf` chunk of a PNG carries the same raw TIFF block a JPEG does. */
function pngTiff(bytes: Buffer): Buffer | null {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let at = 8;
  while (at + PNG_CHUNK_OVERHEAD <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString('ascii');
    const dataAt = at + 8;
    if (dataAt + length > bytes.length) return null;
    if (type === 'eXIf') return bytes.subarray(dataAt, dataAt + length);
    if (type === 'IDAT' || type === 'IEND') return null;
    at = dataAt + length + 4;
  }
  return null;
}

const RIFF_HEADER_BYTES = 12;
const RIFF_CHUNK_HEADER_BYTES = 8;

/**
 * The `EXIF` chunk of a WebP.
 *
 * The spec says the chunk holds a bare TIFF block, and some encoders write
 * the JPEG-style `Exif\0\0` preamble in front of it anyway. Both are read,
 * because refusing the second would drop metadata that is plainly there.
 */
function webpTiff(bytes: Buffer): Buffer | null {
  if (bytes.length < RIFF_HEADER_BYTES) return null;
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
  if (bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return null;

  let at = RIFF_HEADER_BYTES;
  while (at + RIFF_CHUNK_HEADER_BYTES <= bytes.length) {
    const fourcc = bytes.subarray(at, at + 4).toString('ascii');
    const length = bytes.readUInt32LE(at + 4);
    const dataAt = at + RIFF_CHUNK_HEADER_BYTES;
    if (dataAt + length > bytes.length) return null;
    if (fourcc === 'EXIF') {
      const payload = bytes.subarray(dataAt, dataAt + length);
      return payload.subarray(0, 6).toString('ascii') === EXIF_HEADER
        ? payload.subarray(6)
        : payload;
    }
    // RIFF chunks are padded to an even length.
    at = dataAt + length + (length % 2);
  }
  return null;
}

/**
 * Total, and deliberately not a fallback — the same rule `vision.ts` keeps
 * for its own switch. Adding a media type without deciding whether it can
 * carry EXIF fails to compile rather than silently reading none.
 */
const TIFF_READERS: Readonly<Record<ReceiptMediaType, (bytes: Buffer) => Buffer | null>> = {
  'image/jpeg': jpegTiff,
  'image/png': pngTiff,
  'image/webp': webpTiff,
  // GIF has no EXIF container at all, and the other two are not photographs.
  'image/gif': () => null,
  'application/pdf': () => null,
  'text/plain': () => null,
};

/**
 * The raw TIFF block this file carries, or `null`.
 *
 * `null` is the ordinary answer: phones strip EXIF on share, screenshots
 * never had it, and a pasted email body is not a photograph.
 */
export function tiffBlockOf(bytes: Buffer, mediaType: ReceiptMediaType): Buffer | null {
  return TIFF_READERS[mediaType](bytes);
}
