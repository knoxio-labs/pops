import { describe, expect, it } from 'vitest';

import { MAX_RECEIPT_PARTS, nextPartId, type StagedPart } from '../parts';
import { encodeBatch, EMPTY_STAGING, stage, type EncodedBatch, type Staging } from '../staging';

function part(name: string): StagedPart {
  return {
    id: nextPartId(),
    name,
    mediaType: 'image/jpeg',
    dataBase64: 'YQ==',
    byteLength: 1,
  };
}

function batch(overrides: Partial<EncodedBatch> = {}): EncodedBatch {
  return { encoded: [], rejected: [], unreadable: [], ...overrides };
}

function staged(...names: string[]): Staging {
  return { parts: names.map(part), problems: [] };
}

function names(staging: Staging): (string | null)[] {
  return staging.parts.map((one) => one.name);
}

describe('stage', () => {
  it('appends in the order the files were chosen', () => {
    const next = stage(staged('one'), batch({ encoded: [part('two'), part('three')] }));

    expect(names(next)).toEqual(['one', 'two', 'three']);
    expect(next.problems).toEqual([]);
  });

  it('stops at the contract bound and says how many were left out', () => {
    const full = staged(
      ...Array.from({ length: MAX_RECEIPT_PARTS }, (_, i) => `frame-${String(i)}`)
    );

    const next = stage(full, batch({ encoded: [part('spill-1'), part('spill-2')] }));

    expect(next.parts).toHaveLength(MAX_RECEIPT_PARTS);
    expect(names(next)).not.toContain('spill-1');
    expect(next.problems).toEqual([{ kind: 'tooMany', dropped: 2 }]);
  });

  it('takes what fits and reports only the overflow', () => {
    const nearlyFull = staged(
      ...Array.from({ length: MAX_RECEIPT_PARTS - 1 }, (_, i) => `frame-${String(i)}`)
    );

    const next = stage(nearlyFull, batch({ encoded: [part('fits'), part('does-not')] }));

    expect(names(next)).toContain('fits');
    expect(names(next)).not.toContain('does-not');
    expect(next.problems).toEqual([{ kind: 'tooMany', dropped: 1 }]);
  });

  it('reports a refusal, a read failure and an overflow together', () => {
    const full = staged(
      ...Array.from({ length: MAX_RECEIPT_PARTS }, (_, i) => `frame-${String(i)}`)
    );

    const next = stage(
      full,
      batch({ encoded: [part('spill')], rejected: ['till.heic'], unreadable: ['locked.pdf'] })
    );

    expect(next.problems).toEqual([
      { kind: 'rejected', names: ['till.heic'] },
      { kind: 'unreadable', names: ['locked.pdf'] },
      { kind: 'tooMany', dropped: 1 },
    ]);
  });

  it('replaces the previous batch complaints rather than piling them up', () => {
    const complained = stage(EMPTY_STAGING, batch({ rejected: ['till.heic'] }));

    const next = stage(complained, batch({ encoded: [part('frame')] }));

    expect(next.problems).toEqual([]);
    expect(names(next)).toEqual(['frame']);
  });

  it('does not mutate the staging it was given', () => {
    const current = staged('one');
    stage(current, batch({ encoded: [part('two')] }));
    expect(names(current)).toEqual(['one']);
  });
});

describe('encodeBatch', () => {
  it('encodes accepted files in the order they were chosen', async () => {
    const result = await encodeBatch([
      new File(['top'], 'frame-1.jpg', { type: 'image/jpeg' }),
      new File(['bottom'], 'frame-2.png', { type: 'image/png' }),
    ]);

    expect(result.encoded.map((one) => one.name)).toEqual(['frame-1.jpg', 'frame-2.png']);
    expect(result.encoded.map((one) => one.mediaType)).toEqual(['image/jpeg', 'image/png']);
    expect(result.encoded.map((one) => one.dataBase64)).toEqual([btoa('top'), btoa('bottom')]);
    expect(result.encoded.map((one) => one.byteLength)).toEqual([3, 6]);
    expect(result.rejected).toEqual([]);
  });

  it('names the files the upload will not accept, and stages the rest', async () => {
    const result = await encodeBatch([
      new File(['x'], 'till.heic', { type: 'image/heic' }),
      new File(['y'], 'invoice.pdf', { type: 'application/pdf' }),
    ]);

    expect(result.rejected).toEqual(['till.heic']);
    expect(result.encoded.map((one) => one.name)).toEqual(['invoice.pdf']);
  });

  it('names a file this device would not hand over, without losing the batch', async () => {
    const unreadable = new File(['x'], 'locked.pdf', { type: 'application/pdf' });
    Object.defineProperty(unreadable, 'arrayBuffer', {
      value: () => Promise.reject(new Error('the file is gone')),
    });

    const result = await encodeBatch([
      unreadable,
      new File(['y'], 'frame.jpg', { type: 'image/jpeg' }),
    ]);

    expect(result.unreadable).toEqual(['locked.pdf']);
    expect(result.encoded.map((one) => one.name)).toEqual(['frame.jpg']);
  });
});
