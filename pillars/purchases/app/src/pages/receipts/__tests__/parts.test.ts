import { describe, expect, it } from 'vitest';

import {
  movePart,
  nextPartId,
  receiptMediaType,
  removePartAt,
  toRequestParts,
  type StagedPart,
} from '../parts';

function part(name: string): StagedPart {
  return {
    id: nextPartId(),
    name,
    mediaType: 'image/jpeg',
    dataBase64: `bytes-of-${name}`,
    byteLength: 12,
  };
}

function names(parts: readonly StagedPart[]): (string | null)[] {
  return parts.map((one) => one.name);
}

describe('receiptMediaType', () => {
  it.each([
    { type: 'image/jpeg', name: 'till.jpg' },
    { type: 'image/png', name: 'till.png' },
    { type: 'image/webp', name: 'till.webp' },
    { type: 'image/gif', name: 'till.gif' },
    { type: 'application/pdf', name: 'invoice.pdf' },
    { type: 'text/plain', name: 'order.txt' },
  ])('believes the browser when it says $type', ({ type, name }) => {
    expect(receiptMediaType({ name, type })).toBe(type);
  });

  it('strips the parameters a browser attaches to a text type', () => {
    expect(receiptMediaType({ name: 'order.txt', type: 'text/plain; charset=utf-8' })).toBe(
      'text/plain'
    );
  });

  it('reads a type case-insensitively', () => {
    expect(receiptMediaType({ name: 'till.JPG', type: 'IMAGE/JPEG' })).toBe('image/jpeg');
  });

  it('falls back to the extension when the browser reports no type', () => {
    expect(receiptMediaType({ name: 'INVOICE.PDF', type: '' })).toBe('application/pdf');
    expect(receiptMediaType({ name: 'frame.jpeg', type: '' })).toBe('image/jpeg');
  });

  it('prefers the browser type over a disagreeing extension', () => {
    expect(receiptMediaType({ name: 'scan.pdf', type: 'image/png' })).toBe('image/png');
  });

  it.each([
    { label: 'a media type the model cannot read', name: 'till.heic', type: 'image/heic' },
    { label: 'a spreadsheet', name: 'orders.csv', type: 'text/csv' },
    { label: 'an unknown extension and no type', name: 'receipt.dat', type: '' },
    { label: 'no name and no type at all', name: '', type: '' },
  ])('refuses $label', ({ name, type }) => {
    expect(receiptMediaType({ name, type })).toBeNull();
  });

  // A prototype property is not an accepted media type, however much an `in`
  // check would like it to be.
  it.each(['constructor', 'toString', '__proto__'])('refuses the inherited key %s', (type) => {
    expect(receiptMediaType({ name: 'x', type })).toBeNull();
  });
});

describe('nextPartId', () => {
  it('never repeats, so reordered rows keep their identity', () => {
    const ids = [nextPartId(), nextPartId(), nextPartId()];
    expect(new Set(ids).size).toBe(3);
  });
});

describe('movePart', () => {
  const three = [part('a'), part('b'), part('c')];

  it('moves a part earlier', () => {
    expect(names(movePart(three, 1, -1))).toEqual(['b', 'a', 'c']);
  });

  it('moves a part later', () => {
    expect(names(movePart(three, 1, 1))).toEqual(['a', 'c', 'b']);
  });

  it.each([
    { label: 'the first part earlier', index: 0, offset: -1 as const },
    { label: 'the last part later', index: 2, offset: 1 as const },
    { label: 'a part that is not there', index: 9, offset: -1 as const },
  ])('leaves the order alone when asked to move $label', ({ index, offset }) => {
    expect(names(movePart(three, index, offset))).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the list it was given', () => {
    const original = [part('a'), part('b')];
    movePart(original, 0, 1);
    expect(names(original)).toEqual(['a', 'b']);
  });
});

describe('removePartAt', () => {
  it('drops exactly one part and keeps the rest in order', () => {
    expect(names(removePartAt([part('a'), part('b'), part('c')], 1))).toEqual(['a', 'c']);
  });

  it('leaves the list alone for an index that is not there', () => {
    expect(names(removePartAt([part('a')], 4))).toEqual(['a']);
  });
});

describe('toRequestParts', () => {
  it('sends the two fields the contract has, and nothing the browser invented', () => {
    const request = toRequestParts([part('a')]);

    expect(request).toEqual([{ mediaType: 'image/jpeg', dataBase64: 'bytes-of-a' }]);
    expect(Object.keys(request[0] ?? {})).toEqual(['mediaType', 'dataBase64']);
  });

  it('keeps the staged order, which is the order the receipt is read in', () => {
    expect(toRequestParts([part('a'), part('b')]).map((one) => one.dataBase64)).toEqual([
      'bytes-of-a',
      'bytes-of-b',
    ]);
  });
});
