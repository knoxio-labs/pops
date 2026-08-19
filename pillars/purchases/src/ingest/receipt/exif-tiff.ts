/**
 * How to walk a JPEG to its EXIF, and how to read one entry out of it.
 *
 * Structure only. Nothing here knows what a capture time or a coordinate is —
 * `exif.ts` owns the enumerated list of tags this pillar reads, and keeping
 * that list in one small file is the point of the split (ADR-047, constraint
 * 2). This half would be the same code whatever those tags were.
 *
 * ## Untrusted bytes
 *
 * Every read is bounds-checked against the segment rather than left to throw,
 * every count is capped, and every offset is validated before use. A
 * malformed, truncated or hostile block yields nothing, which is the same
 * answer as an image with no EXIF at all — and for this pillar's purposes it
 * is the same situation.
 */

const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;
const JPEG_APP1 = 0xe1;
const MARKER = 0xff;

/** `Exif\0\0`, the six bytes that make an APP1 segment an EXIF one. */
const EXIF_HEADER = Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);

/**
 * A JPEG has a handful of segments before its first scan. Anything past this
 * is a file constructed to make a parser walk, not a photograph.
 */
const MAX_SEGMENTS = 64;

/** One IFD in a real photograph holds tens of entries. */
const MAX_IFD_ENTRIES = 512;

/** Longer than any of the tags this pillar wants. */
const MAX_ASCII_BYTES = 64;

const TIFF_MAGIC = 42;
export const TYPE_ASCII = 2;
export const TYPE_LONG = 4;
export const TYPE_RATIONAL = 5;

/** One segment's marker and where its payload begins and ends. */
interface Segment {
  readonly marker: number;
  readonly payloadAt: number;
  readonly end: number;
}

/**
 * The segment beginning at `at`, or null when the bytes there are not one.
 *
 * Padding between segments is written as repeated `0xFF`, so the scan for the
 * marker skips it. A declared length under two is a segment claiming to be
 * shorter than its own length field.
 */
function segmentAt(bytes: Buffer, from: number): Segment | null {
  let at = from;
  while (at + 1 < bytes.length && bytes[at] === MARKER && bytes[at + 1] === MARKER) at += 1;
  if (at + 4 > bytes.length || bytes[at] !== MARKER) return null;

  const marker = bytes[at + 1];
  if (marker === undefined) return null;
  const length = bytes.readUInt16BE(at + 2);
  if (length < 2) return null;

  const end = at + 2 + length;
  return end > bytes.length ? null : { marker, payloadAt: at + 4, end };
}

/**
 * The TIFF block inside a JPEG's EXIF APP1 segment, or null.
 *
 * Walks the marker chain rather than scanning for the header bytes: an
 * arbitrary JPEG's compressed scan data can contain `Exif\0\0` by chance, and
 * a scan for it would then parse image pixels as a TIFF header. For the same
 * reason the walk stops at the start of the scan — past it there is only
 * pixel data, and EXIF is never there.
 */
export function exifTiffBlock(bytes: Buffer): Buffer | null {
  if (bytes.length < 4 || bytes[0] !== MARKER || bytes[1] !== JPEG_SOI) return null;

  let at = 2;
  for (let count = 0; count < MAX_SEGMENTS; count += 1) {
    const segment = segmentAt(bytes, at);
    if (segment === null) return null;
    if (segment.marker === JPEG_SOS || segment.marker === JPEG_EOI) return null;

    const header = bytes.subarray(segment.payloadAt, segment.payloadAt + EXIF_HEADER.length);
    if (segment.marker === JPEG_APP1 && header.equals(EXIF_HEADER)) {
      return bytes.subarray(segment.payloadAt + EXIF_HEADER.length, segment.end);
    }
    at = segment.end;
  }
  return null;
}

export interface Tiff {
  readonly buf: Buffer;
  /** `II` little-endian, `MM` big-endian. Both appear in the wild. */
  readonly littleEndian: boolean;
}

/** The block's own header, validated, or null when it is not a TIFF. */
export function readTiffHeader(block: Buffer | null): { tiff: Tiff; ifd0At: number } | null {
  if (block === null || block.length < 8) return null;

  const order = block.subarray(0, 2).toString('latin1');
  if (order !== 'II' && order !== 'MM') return null;
  const tiff: Tiff = { buf: block, littleEndian: order === 'II' };
  if (u16(tiff, 2) !== TIFF_MAGIC) return null;

  const ifd0At = u32(tiff, 4);
  // The header itself occupies the first eight bytes, so an IFD claiming to
  // start inside it is pointing at the pointer.
  return ifd0At === null || ifd0At < 8 ? null : { tiff, ifd0At };
}

export function u16(tiff: Tiff, at: number): number | null {
  if (at < 0 || at + 2 > tiff.buf.length) return null;
  return tiff.littleEndian ? tiff.buf.readUInt16LE(at) : tiff.buf.readUInt16BE(at);
}

export function u32(tiff: Tiff, at: number): number | null {
  if (at < 0 || at + 4 > tiff.buf.length) return null;
  return tiff.littleEndian ? tiff.buf.readUInt32LE(at) : tiff.buf.readUInt32BE(at);
}

export interface IfdEntry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  /** Where the twelve-byte entry starts, relative to the TIFF header. */
  readonly at: number;
}

/**
 * One IFD's entries, or none.
 *
 * An entry that cannot be read whole ends the walk rather than being skipped:
 * the entries are fixed-width and consecutive, so one that runs off the end
 * means every later one does too.
 */
export function readIfd(tiff: Tiff, ifdAt: number): IfdEntry[] {
  const count = u16(tiff, ifdAt);
  if (count === null || count > MAX_IFD_ENTRIES) return [];

  const entries: IfdEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = ifdAt + 2 + index * 12;
    const tag = u16(tiff, at);
    const type = u16(tiff, at + 2);
    const valueCount = u32(tiff, at + 4);
    if (tag === null || type === null || valueCount === null) return entries;
    entries.push({ tag, type, count: valueCount, at });
  }
  return entries;
}

/**
 * Where an entry's value actually is: inline in the entry for four bytes or
 * fewer, otherwise at an offset from the TIFF header.
 */
export function valueAt(tiff: Tiff, entry: IfdEntry, byteLength: number): number | null {
  const inline = entry.at + 8;
  const at = byteLength <= 4 ? inline : u32(tiff, inline);
  if (at === null || at < 0 || at + byteLength > tiff.buf.length) return null;
  return at;
}

/**
 * An ASCII entry's value.
 *
 * `latin1` rather than `utf8` because the spec says these are 7-bit ASCII,
 * and a lenient decode of a corrupt field must not produce replacement
 * characters that then fail a caller's pattern for a different reason than
 * the one that is true.
 */
export function asciiValue(tiff: Tiff, entry: IfdEntry): string | null {
  if (entry.type !== TYPE_ASCII || entry.count <= 0 || entry.count > MAX_ASCII_BYTES) return null;
  const at = valueAt(tiff, entry, entry.count);
  if (at === null) return null;

  const raw = tiff.buf.subarray(at, at + entry.count).toString('latin1');
  const terminator = raw.indexOf('\0');
  return terminator === -1 ? raw : raw.slice(0, terminator);
}

/** The sub-IFD a `LONG` pointer entry names, validated. */
export function subIfdAt(tiff: Tiff, ifd0: readonly IfdEntry[], tag: number): number | null {
  const pointer = ifd0.find(
    (entry) => entry.tag === tag && entry.type === TYPE_LONG && entry.count === 1
  );
  if (pointer === undefined) return null;
  const at = u32(tiff, pointer.at + 8);
  return at === null || at < 8 ? null : at;
}
