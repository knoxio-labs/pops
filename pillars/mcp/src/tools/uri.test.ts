import { describe, expect, it } from 'vitest';

import { mapRows, objectUri, withUri } from './uri.js';

import type { CallResult } from '@pops/pillar-sdk/client';

describe('objectUri', () => {
  it('formats string and numeric identifiers', () => {
    expect(objectUri('finance/transaction', 'tx_1')).toBe('pops:finance/transaction/tx_1');
    expect(objectUri('media/movie', 3)).toBe('pops:media/movie/3');
  });

  it('throws for an empty string identifier', () => {
    expect(() => objectUri('finance/transaction', '')).toThrow('Object URI id must not be empty.');
  });
});

describe('mapRows', () => {
  it('maps an array at an envelope key and preserves sibling pagination', () => {
    const result: CallResult<{
      data: Array<{ id: number } | null | string>;
      pagination: { total: number };
    }> = {
      kind: 'ok',
      value: { data: [{ id: 1 }, null, 'keep'], pagination: { total: 3 } },
    };
    const original = structuredClone(result);

    const mapped = mapRows(result, 'data', (row) => ({ ...row, mapped: true }));

    expect(mapped).toEqual({
      kind: 'ok',
      value: {
        data: [{ id: 1, mapped: true }, null, 'keep'],
        pagination: { total: 3 },
      },
    });
    expect(result).toEqual(original);
  });

  it('maps a single object at an envelope key and preserves sibling history', () => {
    const result: CallResult<{ item: { id: string }; history: string[] }> = {
      kind: 'ok',
      value: { item: { id: 'item-1' }, history: ['created'] },
    };

    expect(mapRows(result, 'item', (row) => ({ ...row, mapped: true }))).toEqual({
      kind: 'ok',
      value: { item: { id: 'item-1', mapped: true }, history: ['created'] },
    });
  });

  it('maps a root object when at is null', () => {
    const result: CallResult<{ id: number }> = { kind: 'ok', value: { id: 2 } };

    expect(mapRows(result, null, (row) => ({ ...row, mapped: true }))).toEqual({
      kind: 'ok',
      value: { id: 2, mapped: true },
    });
  });

  it('returns a non-ok result by reference without calling the transform', () => {
    const result: CallResult<unknown> = { kind: 'unavailable', pillar: 'x' };
    let transformCalled = false;
    const transform = (row: Record<string, unknown>) => {
      transformCalled = true;
      return row;
    };

    expect(mapRows(result, null, transform)).toBe(result);
    expect(transformCalled).toBe(false);
  });

  it('returns null values and missing envelope keys by reference', () => {
    const nullResult: CallResult<null> = { kind: 'ok', value: null };
    const missingKeyResult: CallResult<{ history: string[] }> = {
      kind: 'ok',
      value: { history: [] },
    };

    expect(mapRows(nullResult, null, (row) => row)).toBe(nullResult);
    expect(mapRows(missingKeyResult, 'item', (row) => row)).toBe(missingKeyResult);
  });

  it('does not mutate the input while mapping rows', () => {
    const result: CallResult<{ data: Array<{ nested: { count: number } }> }> = {
      kind: 'ok',
      value: { data: [{ nested: { count: 1 } }] },
    };
    const original = structuredClone(result);

    const mapped = mapRows(result, 'data', (row) => {
      const nested = row['nested'] as { count: number };
      nested.count = 2;
      return row;
    });

    expect(mapped).toEqual({ kind: 'ok', value: { data: [{ nested: { count: 2 } }] } });
    expect(result).toEqual(original);
  });
});

describe('withUri', () => {
  it('adds a URI for string and integer ids', () => {
    expect(withUri('media/movie')({ id: 3 })).toEqual({ id: 3, uri: 'pops:media/movie/3' });
    expect(withUri('finance/transaction')({ id: 'tx_1' })).toEqual({
      id: 'tx_1',
      uri: 'pops:finance/transaction/tx_1',
    });
  });

  it.each([
    { name: 'missing', row: { title: 'No id' } },
    { name: 'empty', row: { id: '' } },
    { name: 'non-integer', row: { id: 1.5 } },
  ])('returns a row with a $name id unchanged', ({ row }) => {
    expect(withUri('media/movie')(row)).toBe(row);
  });
});
