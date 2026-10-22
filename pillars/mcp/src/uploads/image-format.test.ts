import { describe, expect, it } from 'vitest';

import { sniffImageType } from './image-format.js';

function ftyp(brand: string): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`, 'latin1')]);
}

describe('sniffImageType', () => {
  it('recognises JPEG by its SOI marker', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('image/jpeg');
  });

  it.each(['heic', 'heix', 'mif1', 'msf1', 'hevc'])('recognises HEIC brand %s', (brand) => {
    expect(sniffImageType(ftyp(brand))).toBe('image/heic');
  });

  it.each([
    ['PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])],
    ['MP4', ftyp('isom')],
    ['AVIF', ftyp('avif')],
    ['GIF', Buffer.from('GIF89a......', 'latin1')],
    ['truncated JPEG', Buffer.from([0xff, 0xd8])],
    ['truncated ftyp', Buffer.from('\0\0\0\x18ftyphei', 'latin1')],
    ['empty', Buffer.alloc(0)],
  ])('rejects %s', (_label, bytes) => {
    expect(sniffImageType(bytes)).toBeUndefined();
  });
});
