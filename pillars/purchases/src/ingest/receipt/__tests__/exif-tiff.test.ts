/**
 * The TIFF reader's refusals, driven directly rather than through a file.
 *
 * `exif.test.ts` exercises this module the way production does — whole
 * images, whole EXIF blocks — and that reaches the paths a real camera
 * produces. It does not reach the ones a corrupt upload produces: an entry
 * declaring no values, an offset pointing outside the block, a directory
 * pointer written as a SHORT. Those are the bounds checks, and a bounds
 * check that is never crossed in a test is a claim rather than a result.
 *
 * Driven through the exported accessors because that is what `exif.ts`
 * holds: a `Tiff` and an `Entry` are its currency, and every one of them
 * originates in bytes somebody uploaded.
 */
import { describe, expect, it } from 'vitest';

import { asciiOf, pointerOf, tiffOf, TYPE_ASCII, TYPE_LONG, u16, u32 } from '../exif-tiff.js';

import type { Entry, Tiff } from '../exif-tiff.js';

/**
 * The wire number for a 16-bit unsigned value. Not exported by the module —
 * it is a TIFF constant rather than an API — so it is written out here for
 * the one case that needs it.
 */
const TYPE_SHORT = 3;

/** A little-endian block of `bytes`, with no header of its own. */
function tiffOver(...bytes: readonly number[]): Tiff {
  return { bytes: Buffer.from(bytes), little: true };
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return { type: TYPE_ASCII, count: 4, valueAt: 0, ...overrides };
}

describe('tiffOf', () => {
  it('refuses a block too short to hold a header', () => {
    // Eight bytes is the header: order, magic, and the offset of the first
    // directory. Anything shorter has nothing to read, and reading it as
    // though it did is how a truncated upload becomes a date.
    for (const length of [0, 1, 7]) {
      expect(tiffOf(Buffer.alloc(length)), `${String(length)} bytes`).toBeNull();
    }
  });

  it('refuses a byte-order mark that is neither order', () => {
    const bytes = Buffer.from([0x00, 0x00, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);

    expect(tiffOf(bytes)).toBeNull();
  });

  it('refuses a header whose magic number is not 42', () => {
    const bytes = Buffer.from([0x49, 0x49, 0x2b, 0x00, 0x08, 0x00, 0x00, 0x00]);

    expect(tiffOf(bytes)).toBeNull();
  });

  it('reads both byte orders and reports where the first directory starts', () => {
    expect(tiffOf(Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]))).toMatchObject({
      ifd0At: 8,
      tiff: { little: true },
    });
    expect(tiffOf(Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]))).toMatchObject({
      ifd0At: 8,
      tiff: { little: false },
    });
  });
});

describe('the bounded reads', () => {
  const tiff = tiffOver(1, 2, 3, 4);

  it('refuses to read before the start of the block', () => {
    expect(u16(tiff, -1)).toBeNull();
    expect(u32(tiff, -1)).toBeNull();
  });

  it('refuses a read that would run past the end', () => {
    // Every offset in a TIFF comes out of the file itself, so "past the
    // end" is the ordinary consequence of a corrupt one rather than an
    // exceptional case. Returning null keeps it from becoming a value.
    expect(u16(tiff, 3)).toBeNull();
    expect(u32(tiff, 1)).toBeNull();
    expect(u32(tiff, 4_000_000)).toBeNull();
  });

  it('reads what does fit', () => {
    expect(u16(tiff, 2)).toBe(0x0403);
    expect(u32(tiff, 0)).toBe(0x04030201);
  });
});

describe('asciiOf', () => {
  it('refuses an entry that declares no values', () => {
    // `count: 0` gives a zero-length range. Reading it yields the empty
    // string, which would be indistinguishable from a tag that was there
    // and said nothing.
    expect(asciiOf(tiffOver(65, 66, 67, 0), entry({ count: 0 }))).toBeNull();
  });

  it('refuses a value that is only padding', () => {
    // ASCII values are NUL-terminated and padded, so a tag written but
    // never filled in reads as four NULs. That is not a merchant name.
    expect(asciiOf(tiffOver(0, 0, 0, 0), entry())).toBeNull();
    expect(asciiOf(tiffOver(0x20, 0x20, 0x00, 0x00), entry())).toBeNull();
  });

  it('reads an inline value up to the terminator', () => {
    expect(asciiOf(tiffOver(0x41, 0x42, 0x00, 0x43), entry())).toBe('AB');
  });

  it('refuses an entry of any other type', () => {
    expect(asciiOf(tiffOver(0x41, 0x42, 0x00, 0x00), entry({ type: TYPE_LONG }))).toBeNull();
    expect(asciiOf(tiffOver(0x41, 0x42, 0x00, 0x00), undefined)).toBeNull();
  });
});

describe('pointerOf', () => {
  const tiff = tiffOver(0x08, 0x00, 0x00, 0x00);

  it('reads a directory pointer written as a LONG', () => {
    expect(pointerOf(tiff, entry({ type: TYPE_LONG, count: 1 }))).toBe(8);
  });

  it('reads one written as a SHORT, which some writers emit', () => {
    // Its own branch, and the reason the function exists rather than the
    // caller reading a LONG: a SHORT pointer read as a LONG picks up the
    // two bytes after it, which belong to the next entry.
    expect(pointerOf(tiff, entry({ type: TYPE_SHORT, count: 1 }))).toBe(8);
  });

  it('refuses anything that is not a single pointer', () => {
    expect(pointerOf(tiff, entry({ type: TYPE_LONG, count: 2 }))).toBeNull();
    expect(pointerOf(tiff, entry({ type: TYPE_ASCII, count: 1 }))).toBeNull();
    expect(pointerOf(tiff, undefined)).toBeNull();
  });
});
