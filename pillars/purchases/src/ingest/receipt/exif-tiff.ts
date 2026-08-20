/**
 * Reading a TIFF directory, with no idea what any of it means.
 *
 * EXIF is TIFF: a byte-order mark, a chain of directories, and entries that
 * are four bytes of value or four bytes of offset depending on how long the
 * value is. That mechanism is what this file knows. Which tag is a date and
 * which is a latitude belongs to `exif.ts`.
 *
 * Every accessor is bounds-checked and answers `null` rather than throwing.
 * These bytes came from an upload, and a reading is a cheaper thing to lose
 * than a receipt.
 */
const TIFF_LITTLE_ENDIAN = 0x4949;
const TIFF_BIG_ENDIAN = 0x4d4d;
const TIFF_MAGIC = 42;

export const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
export const TYPE_LONG = 4;
export const TYPE_RATIONAL = 5;

const TYPE_SIZES: Readonly<Record<number, number>> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
};

const IFD_ENTRY_BYTES = 12;

export interface Tiff {
  readonly bytes: Buffer;
  readonly little: boolean;
}

export interface Entry {
  readonly type: number;
  readonly count: number;
  /** Absolute offset into the TIFF block of the entry's own four value bytes. */
  readonly valueAt: number;
}

/** The block's header, or null when these bytes are not TIFF at all. */
export function tiffOf(bytes: Buffer): { tiff: Tiff; ifd0At: number } | null {
  if (bytes.length < 8) return null;
  const order = bytes.readUInt16BE(0);
  if (order !== TIFF_LITTLE_ENDIAN && order !== TIFF_BIG_ENDIAN) return null;
  const tiff: Tiff = { bytes, little: order === TIFF_LITTLE_ENDIAN };
  if (u16(tiff, 2) !== TIFF_MAGIC) return null;
  const ifd0At = u32(tiff, 4);
  return ifd0At === null ? null : { tiff, ifd0At };
}

export function u16(tiff: Tiff, at: number): number | null {
  if (at < 0 || at + 2 > tiff.bytes.length) return null;
  return tiff.little ? tiff.bytes.readUInt16LE(at) : tiff.bytes.readUInt16BE(at);
}

export function u32(tiff: Tiff, at: number): number | null {
  if (at < 0 || at + 4 > tiff.bytes.length) return null;
  return tiff.little ? tiff.bytes.readUInt32LE(at) : tiff.bytes.readUInt32BE(at);
}

/**
 * Where an entry's data actually lives.
 *
 * Four bytes or fewer sit inline in the entry itself; anything longer is
 * addressed by an offset from the start of the TIFF block. Getting this
 * backwards reads the offset as a date, which is why it is one function
 * rather than a rule each caller applies.
 */
function dataRange(tiff: Tiff, entry: Entry): { at: number; length: number } | null {
  const size = TYPE_SIZES[entry.type];
  if (size === undefined) return null;
  const length = size * entry.count;
  if (length <= 0) return null;
  if (length <= 4) return { at: entry.valueAt, length };
  const at = u32(tiff, entry.valueAt);
  if (at === null || at + length > tiff.bytes.length) return null;
  return { at, length };
}

/**
 * Every entry of one image file directory, or an empty map.
 *
 * A directory whose declared entry count runs past the end of the block is
 * refused whole rather than read as far as it goes: a partial IFD read from
 * a truncated file is a directory whose entries are whatever the next bytes
 * happen to be.
 */
export function entriesAt(tiff: Tiff, offset: number): Map<number, Entry> {
  const found = new Map<number, Entry>();
  const count = u16(tiff, offset);
  if (count === null) return found;
  const end = offset + 2 + count * IFD_ENTRY_BYTES;
  if (end > tiff.bytes.length) return found;

  for (let index = 0; index < count; index += 1) {
    const at = offset + 2 + index * IFD_ENTRY_BYTES;
    const tag = u16(tiff, at);
    const type = u16(tiff, at + 2);
    const valueCount = u32(tiff, at + 4);
    if (tag === null || type === null || valueCount === null) continue;
    found.set(tag, { type, count: valueCount, valueAt: at + 8 });
  }
  return found;
}

export function asciiOf(tiff: Tiff, entry: Entry | undefined): string | null {
  if (entry === undefined || entry.type !== TYPE_ASCII) return null;
  const range = dataRange(tiff, entry);
  if (range === null) return null;
  const raw = tiff.bytes.subarray(range.at, range.at + range.length).toString('ascii');
  const text = raw.replace(/\0.*$/su, '').trim();
  return text === '' ? null : text;
}

/** A pointer to a nested directory: one LONG (some writers emit a SHORT). */
export function pointerOf(tiff: Tiff, entry: Entry | undefined): number | null {
  if (entry === undefined || entry.count !== 1) return null;
  if (entry.type === TYPE_LONG) return u32(tiff, entry.valueAt);
  if (entry.type === TYPE_SHORT) return u16(tiff, entry.valueAt);
  return null;
}

/**
 * Degrees, minutes and seconds as three unsigned rationals.
 *
 * A zero denominator is refused rather than divided by: it yields Infinity
 * or NaN, and a coordinate that is neither is worse than no coordinate.
 */
export function rationalTripleOf(
  tiff: Tiff,
  entry: Entry | undefined
): [number, number, number] | null {
  if (entry === undefined || entry.type !== TYPE_RATIONAL || entry.count !== 3) return null;
  const range = dataRange(tiff, entry);
  if (range === null) return null;

  const parts: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const numerator = u32(tiff, range.at + index * 8);
    const denominator = u32(tiff, range.at + index * 8 + 4);
    if (numerator === null || denominator === null || denominator === 0) return null;
    parts.push(numerator / denominator);
  }
  const [degrees, minutes, seconds] = parts;
  if (degrees === undefined || minutes === undefined || seconds === undefined) return null;
  return [degrees, minutes, seconds];
}
