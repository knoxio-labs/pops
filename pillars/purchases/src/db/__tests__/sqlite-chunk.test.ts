/**
 * `chunkIds`/`queryChunked`/`mutateChunked` in isolation, with no database
 * involved — the boundary conditions the sweep's chunked queries lean on.
 */
import { describe, expect, it } from 'vitest';

import { chunkIds, mutateChunked, queryChunked, SQLITE_IN_CHUNK_SIZE } from '../index.js';

describe('chunkIds', () => {
  it('yields no chunks for empty input', () => {
    expect(chunkIds([], 3)).toEqual([]);
  });

  it('splits an exact multiple of the chunk size into even chunks', () => {
    const ids = Array.from({ length: 9 }, (_, i) => i);
    expect(chunkIds(ids, 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
    ]);
  });

  it('gives one short chunk one under a chunk boundary', () => {
    expect(chunkIds([0, 1], 3)).toEqual([[0, 1]]);
  });

  it('gives one full chunk exactly at a chunk boundary', () => {
    expect(chunkIds([0, 1, 2], 3)).toEqual([[0, 1, 2]]);
  });

  it('gives a full chunk plus one short chunk one over a chunk boundary', () => {
    expect(chunkIds([0, 1, 2, 3], 3)).toEqual([[0, 1, 2], [3]]);
  });

  it('defaults to SQLITE_IN_CHUNK_SIZE', () => {
    const ids = Array.from({ length: SQLITE_IN_CHUNK_SIZE + 1 }, (_, i) => i);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(SQLITE_IN_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(1);
  });

  it('rejects a non-positive size rather than looping forever', () => {
    expect(() => chunkIds([1, 2], 0)).toThrow(/size must be positive/);
  });
});

describe('queryChunked', () => {
  it('makes no query at all for empty input', () => {
    let calls = 0;
    const result = queryChunked([] as number[], () => {
      calls += 1;
      return [];
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it('concatenates one query result per chunk, in chunk order', () => {
    const seen: (readonly number[])[] = [];
    const result = queryChunked(
      [1, 2, 3, 4, 5],
      (chunk) => {
        seen.push(chunk);
        return chunk.map((id) => id * 10);
      },
      2
    );
    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(seen).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('mutateChunked', () => {
  it('makes no query and returns 0 for empty input', () => {
    let calls = 0;
    const total = mutateChunked([] as number[], () => {
      calls += 1;
      return 1;
    });
    expect(total).toBe(0);
    expect(calls).toBe(0);
  });

  it('sums the row count each chunk reports', () => {
    const chunkCalls: (readonly number[])[] = [];
    const total = mutateChunked(
      [1, 2, 3, 4, 5],
      (chunk) => {
        chunkCalls.push(chunk);
        return chunk.length;
      },
      2
    );
    expect(total).toBe(5);
    expect(chunkCalls).toEqual([[1, 2], [3, 4], [5]]);
  });
});
