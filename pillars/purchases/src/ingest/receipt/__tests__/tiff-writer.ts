/**
 * The primitive TIFF writers the EXIF fixtures are assembled from.
 *
 * Byte layout only, in both endiannesses. What goes into an entry is
 * `exif-bytes.ts`'s business; this file knows how many bytes it takes and
 * which way round they go.
 */
import type { Rational } from './gps-fixtures.js';

/** One IFD entry, in the twelve-byte on-disk shape. */
export interface Entry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  /** Inline when four bytes or fewer, otherwise a pointer from the header. */
  readonly value: number;
}

/** Two bytes of count, twelve per entry, four for the next-IFD pointer. */
export function ifdSize(entryCount: number): number {
  return 2 + entryCount * 12 + 4;
}

export function ifdBytes(entries: readonly Entry[], littleEndian: boolean): Buffer {
  const buf = Buffer.alloc(ifdSize(entries.length));
  const w16 = (at: number, value: number): void => {
    if (littleEndian) buf.writeUInt16LE(value, at);
    else buf.writeUInt16BE(value, at);
  };
  const w32 = (at: number, value: number): void => {
    if (littleEndian) buf.writeUInt32LE(value, at);
    else buf.writeUInt32BE(value, at);
  };

  w16(0, entries.length);
  entries.forEach((entry, index) => {
    const at = 2 + index * 12;
    w16(at, entry.tag);
    w16(at + 2, entry.type);
    w32(at + 4, entry.count);
    w32(at + 8, entry.value);
  });
  return buf;
}

/** A run of rationals, each an unsigned numerator then denominator. */
export function rationalBytes(values: readonly Rational[], littleEndian: boolean): Buffer {
  const buf = Buffer.alloc(values.length * 8);
  values.forEach(([numerator, denominator], index) => {
    const at = index * 8;
    if (littleEndian) {
      buf.writeUInt32LE(numerator, at);
      buf.writeUInt32LE(denominator, at + 4);
    } else {
      buf.writeUInt32BE(numerator, at);
      buf.writeUInt32BE(denominator, at + 4);
    }
  });
  return buf;
}

/**
 * A one-character ASCII value packed into an entry's inline four bytes.
 *
 * Which end it sits at depends on the byte order, because the reader takes
 * those four bytes in file order and the writer packs them as an integer.
 */
export function inlineAscii(letter: string, littleEndian: boolean): number {
  return littleEndian ? letter.charCodeAt(0) : letter.charCodeAt(0) * 0x100_0000;
}
