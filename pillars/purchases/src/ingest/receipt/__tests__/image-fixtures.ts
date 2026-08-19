/**
 * The envelopes a TIFF block travels in.
 *
 * Separate from `exif-fixtures.ts` for the same reason the reader is split
 * from its containers: one file knows how to build EXIF, the other knows
 * where each image format keeps it. Nothing here is an image a decoder
 * would accept — there is no pixel data at all, and the reader never looks
 * for any.
 */
import { tiffBlock } from './exif-fixtures.js';

import type { ExifSpec } from './exif-fixtures.js';

const EXIF_PREAMBLE = Buffer.from('Exif\0\0', 'ascii');

/** A JPEG carrying an APP0 segment and then the APP1 the reader wants. */
export function jpegWithTiff(tiff: Buffer | null): Buffer {
  const app0 = Buffer.concat([
    Buffer.from([0xff, 0xe0]),
    lengthPrefixed(Buffer.from('JFIF\0\0\0\0\0\0', 'latin1')),
  ]);
  const app1 =
    tiff === null
      ? Buffer.alloc(0)
      : Buffer.concat([
          Buffer.from([0xff, 0xe1]),
          lengthPrefixed(Buffer.concat([EXIF_PREAMBLE, tiff])),
        ]);
  // Start of scan, so a reader walking segments stops where a real one does.
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x02]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, sos]);
}

function lengthPrefixed(payload: Buffer): Buffer {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([length, payload]);
}

export function jpegWithExif(spec: ExifSpec): Buffer {
  return jpegWithTiff(tiffBlock(spec));
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  // The CRC is never verified by the reader, and a wrong one here would
  // prove that rather than hide it.
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

export function pngWithExif(spec: ExifSpec): Buffer {
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', Buffer.alloc(13)),
    pngChunk('eXIf', tiffBlock(spec)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function riffChunk(fourcc: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32LE(data.length);
  const padding = data.length % 2 === 0 ? Buffer.alloc(0) : Buffer.alloc(1);
  return Buffer.concat([Buffer.from(fourcc, 'ascii'), length, data, padding]);
}

/**
 * `preamble` writes the JPEG-style `Exif\0\0` in front of the TIFF block.
 * The WebP spec says a bare block; encoders in the wild write both.
 */
export function webpWithExif(spec: ExifSpec, options: { preamble?: boolean } = {}): Buffer {
  const tiff = tiffBlock(spec);
  const body = Buffer.concat([
    Buffer.from('WEBP', 'ascii'),
    riffChunk('VP8 ', Buffer.alloc(9)),
    riffChunk('EXIF', options.preamble === true ? Buffer.concat([EXIF_PREAMBLE, tiff]) : tiff),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), size, body]);
}
