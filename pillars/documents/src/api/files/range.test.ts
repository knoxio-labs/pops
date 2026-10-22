import { describe, expect, it } from 'vitest';

import { resolveByteRange, sliceBytes } from './range.js';

describe('resolveByteRange', () => {
  it.each([
    [undefined, 10, { kind: 'full' }],
    ['bytes=0-4', null, { kind: 'full' }],
    ['bytes=0-4', 10, { kind: 'partial', start: 0, end: 4 }],
    ['bytes=9-9', 10, { kind: 'partial', start: 9, end: 9 }],
    ['bytes=5-', 10, { kind: 'partial', start: 5, end: 9 }],
    ['bytes=-20', 10, { kind: 'partial', start: 0, end: 9 }],
    ['bytes=10-', 10, { kind: 'unsatisfiable' }],
    ['bytes=-0', 10, { kind: 'unsatisfiable' }],
    ['bytes=0-0', 0, { kind: 'unsatisfiable' }],
    ['bytes=5-2', 10, { kind: 'full' }],
    ['bytes=-', 10, { kind: 'full' }],
    ['bytes=0-1,3-4', 10, { kind: 'full' }],
    ['items=0-1', 10, { kind: 'full' }],
  ] as const)('%j on %j bytes is %j', (header, size, expected) => {
    expect(resolveByteRange(header, size)).toEqual(expected);
  });
});

async function collect(source: AsyncIterable<Uint8Array>): Promise<string> {
  let out = '';
  for await (const chunk of source) out += Buffer.from(chunk).toString();
  return out;
}

async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield Buffer.from(part);
}

describe('sliceBytes', () => {
  it('slices across chunk boundaries', async () => {
    expect(await collect(sliceBytes(chunks('012', '345', '678', '9'), 2, 7))).toBe('234567');
  });

  it('yields a single byte at a chunk edge', async () => {
    expect(await collect(sliceBytes(chunks('012', '345'), 3, 3))).toBe('3');
  });

  it('stops reading the source once the end is passed', async () => {
    let pulled = 0;
    async function* counting(): AsyncGenerator<Uint8Array> {
      for (const part of ['01', '23', '45', '67']) {
        pulled += 1;
        yield Buffer.from(part);
      }
    }
    expect(await collect(sliceBytes(counting(), 0, 2))).toBe('012');
    expect(pulled).toBe(2);
  });
});
