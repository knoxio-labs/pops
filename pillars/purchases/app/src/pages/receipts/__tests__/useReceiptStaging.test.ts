import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StagedPart } from '../parts.js';
import type { EncodedBatch } from '../staging.js';

const encodeBatchMock = vi.fn();

vi.mock('../staging.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../staging.js')>();
  return { ...actual, encodeBatch: (files: readonly File[]) => encodeBatchMock(files) };
});

const { useReceiptStaging } = await import('../useReceiptStaging.js');

function part(name: string): StagedPart {
  return {
    id: name,
    name,
    mediaType: 'image/jpeg',
    dataBase64: 'AA==',
    byteLength: 1,
  };
}

function batch(...names: string[]): EncodedBatch {
  return { encoded: names.map(part), rejected: [], unreadable: [] };
}

/** A promise this test resolves by hand, so encode order is not a race. */
function deferred(): { promise: Promise<EncodedBatch>; resolve: (b: EncodedBatch) => void } {
  let resolve!: (b: EncodedBatch) => void;
  const promise = new Promise<EncodedBatch>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  encodeBatchMock.mockReset();
});

describe('useReceiptStaging', () => {
  // The server reads the parts top to bottom as one document, so the order the
  // reader added them in is the order that must go on the wire. Encoding is
  // concurrent and a small second batch routinely finishes before a large
  // first one, which is exactly the case this asserts.
  it('stages batches in the order they were added, not the order they encode', async () => {
    const slowFirst = deferred();
    const fastSecond = deferred();
    encodeBatchMock.mockReturnValueOnce(slowFirst.promise).mockReturnValueOnce(fastSecond.promise);

    const { result } = renderHook(() => useReceiptStaging());

    act(() => {
      result.current.addFiles([new File(['a'], 'first.jpg')]);
      result.current.addFiles([new File(['b'], 'second.jpg')]);
    });

    // The second batch finishes encoding first — the inversion that a bare
    // `.then()` per batch would stage in the wrong order.
    await act(async () => {
      fastSecond.resolve(batch('second.jpg'));
      await Promise.resolve();
    });

    await act(async () => {
      slowFirst.resolve(batch('first.jpg'));
      await Promise.resolve();
    });

    expect(result.current.staging.parts.map((p) => p.name)).toEqual(['first.jpg', 'second.jpg']);
  });

  it('drops a stale complaint once the reader edits the list', async () => {
    encodeBatchMock.mockResolvedValueOnce({
      encoded: [part('kept.jpg')],
      rejected: ['notes.txt'],
      unreadable: [],
    });

    const { result } = renderHook(() => useReceiptStaging());

    await act(async () => {
      result.current.addFiles([new File(['a'], 'kept.jpg')]);
    });
    expect(result.current.staging.problems.length).toBeGreaterThan(0);

    act(() => {
      result.current.remove(0);
    });

    expect(result.current.staging.problems).toEqual([]);
  });
});
