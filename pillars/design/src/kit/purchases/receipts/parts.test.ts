import {
  movePart,
  nextPartId,
  receiptMediaType,
  removePartAt,
} from '@/kit/purchases/receipts/parts';
import { describe, expect, it } from 'vitest';

import type { StagedPart } from '@/fixtures/purchases-receipt-intake';

function part(id: string): StagedPart {
  return { id, name: `${id}.jpg`, mediaType: 'image/jpeg', byteLength: 100 };
}

describe('receiptMediaType', () => {
  it('believes the browser-reported type first', () => {
    expect(receiptMediaType({ name: 'whatever.bin', type: 'image/png' })).toBe('image/png');
  });

  it('falls back to the extension when the type is empty', () => {
    expect(receiptMediaType({ name: 'receipt.pdf', type: '' })).toBe('application/pdf');
  });

  it('is case-insensitive on both the declared type and the extension', () => {
    expect(receiptMediaType({ name: 'RECEIPT.JPG', type: '' })).toBe('image/jpeg');
    expect(receiptMediaType({ name: 'x', type: 'IMAGE/WEBP' })).toBe('image/webp');
  });

  it('strips a charset parameter off the declared type', () => {
    expect(receiptMediaType({ name: 'x.txt', type: 'text/plain;charset=utf-8' })).toBe(
      'text/plain'
    );
  });

  it('refuses a type the upload does not accept, extension included', () => {
    expect(receiptMediaType({ name: 'photo.heic', type: 'image/heic' })).toBeNull();
    expect(receiptMediaType({ name: 'photo.heic', type: '' })).toBeNull();
  });

  it('prefers the browser type over a disagreeing extension', () => {
    expect(receiptMediaType({ name: 'scan.pdf', type: 'image/png' })).toBe('image/png');
  });

  it('refuses a file with no name and no type at all', () => {
    expect(receiptMediaType({ name: '', type: '' })).toBeNull();
  });

  // A prototype property is not an accepted media type, however much an `in`
  // check would like it to be.
  it.each(['constructor', 'toString', '__proto__'])('refuses the inherited key %s', (type) => {
    expect(receiptMediaType({ name: 'x', type })).toBeNull();
  });
});

describe('nextPartId', () => {
  it('never repeats across calls', () => {
    const ids = new Set(Array.from({ length: 5 }, () => nextPartId()));
    expect(ids.size).toBe(5);
  });
});

describe('removePartAt', () => {
  it('drops only the part at the given index', () => {
    const parts = [part('a'), part('b'), part('c')];
    expect(removePartAt(parts, 1).map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('leaves the list unchanged for an out-of-range index', () => {
    const parts = [part('a')];
    expect(removePartAt(parts, 5)).toEqual(parts);
  });
});

describe('movePart', () => {
  it('swaps a part with its earlier neighbour', () => {
    const parts = [part('a'), part('b'), part('c')];
    expect(movePart(parts, 1, -1).map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('swaps a part with its later neighbour', () => {
    const parts = [part('a'), part('b'), part('c')];
    expect(movePart(parts, 1, 1).map((p) => p.id)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the list alone when the move would run off either end', () => {
    const parts = [part('a'), part('b')];
    expect(movePart(parts, 0, -1).map((p) => p.id)).toEqual(['a', 'b']);
    expect(movePart(parts, 1, 1).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the list it was given', () => {
    const original = [part('a'), part('b')];
    movePart(original, 0, 1);
    expect(original.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
