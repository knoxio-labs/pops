import { MAX_RECEIPT_PARTS } from '@/kit/purchases/receipts/parts';
import { EMPTY_STAGING, stage, withRefused } from '@/kit/purchases/receipts/staging';
import { describe, expect, it } from 'vitest';

import type { StagedPart } from '@/fixtures/purchases-receipt-intake';

function part(id: string): StagedPart {
  return { id, name: `${id}.jpg`, mediaType: 'image/jpeg', byteLength: 100 };
}

describe('stage', () => {
  it('appends a clean batch with no problems', () => {
    const result = stage(EMPTY_STAGING, { staged: [part('a')], rejected: [] });
    expect(result).toEqual({ parts: [part('a')], problems: [] });
  });

  it('preserves the order parts were staged in across batches', () => {
    const first = stage(EMPTY_STAGING, { staged: [part('a'), part('b')], rejected: [] });
    const second = stage(first, { staged: [part('c')], rejected: [] });
    expect(second.parts.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('reports a rejected file as its own problem', () => {
    const result = stage(EMPTY_STAGING, { staged: [], rejected: ['bad.heic'] });
    expect(result.problems).toEqual([{ kind: 'rejected', names: ['bad.heic'] }]);
  });

  it('drops parts past the contract bound and reports how many', () => {
    const full = Array.from({ length: MAX_RECEIPT_PARTS }, (_, i) => part(`p${String(i)}`));
    const current = stage(EMPTY_STAGING, { staged: full, rejected: [] });
    const result = stage(current, { staged: [part('overflow')], rejected: [] });
    expect(result.parts).toHaveLength(MAX_RECEIPT_PARTS);
    expect(result.problems).toEqual([{ kind: 'tooMany', dropped: 1 }]);
  });

  it('only fits the parts that have room, dropping the rest of the same batch', () => {
    const current = stage(EMPTY_STAGING, {
      staged: Array.from({ length: MAX_RECEIPT_PARTS - 1 }, (_, i) => part(`p${String(i)}`)),
      rejected: [],
    });
    const result = stage(current, { staged: [part('x'), part('y'), part('z')], rejected: [] });
    expect(result.parts).toHaveLength(MAX_RECEIPT_PARTS);
    expect(result.problems).toEqual([{ kind: 'tooMany', dropped: 2 }]);
  });

  it('replaces the previous problems rather than accumulating them', () => {
    const withProblem = stage(EMPTY_STAGING, { staged: [], rejected: ['bad.heic'] });
    const result = stage(withProblem, { staged: [part('a')], rejected: [] });
    expect(result.problems).toEqual([]);
  });
});

describe('withRefused', () => {
  it('leaves staging untouched for an empty list of names', () => {
    expect(withRefused(EMPTY_STAGING, [])).toBe(EMPTY_STAGING);
  });

  it('folds a refused name into a new rejected problem', () => {
    const result = withRefused(EMPTY_STAGING, ['bad.heic']);
    expect(result.problems).toEqual([{ kind: 'rejected', names: ['bad.heic'] }]);
  });

  it('merges with an existing rejection rather than adding a second one', () => {
    const withRejection = stage(EMPTY_STAGING, { staged: [], rejected: ['first.heic'] });
    const result = withRefused(withRejection, ['second.heic']);
    expect(result.problems).toEqual([{ kind: 'rejected', names: ['first.heic', 'second.heic'] }]);
  });

  it('leaves a non-rejection problem in place beside the merged one', () => {
    const full = Array.from({ length: MAX_RECEIPT_PARTS }, (_, i) => part(`p${String(i)}`));
    const overflowed = stage(EMPTY_STAGING, { staged: full, rejected: [] });
    const withOverflow = stage(overflowed, { staged: [part('extra')], rejected: [] });
    const result = withRefused(withOverflow, ['bad.heic']);
    expect(result.problems).toContainEqual({ kind: 'tooMany', dropped: 1 });
    expect(result.problems).toContainEqual({ kind: 'rejected', names: ['bad.heic'] });
  });
});
