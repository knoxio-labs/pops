import { describe, expect, it } from 'vitest';

import { toCandidate } from './add-dialog';
import { labelsHref, MAX_LABEL_IDS, parseIds, readLabelParams } from './label-params';
import { codeSaveResult } from './useSaveCode';

describe('label page address', () => {
  it('reads ids trimmed, without blanks or repeats', () => {
    expect(parseIds(' a, b,,a ,c ')).toEqual(['a', 'b', 'c']);
    expect(parseIds(null)).toEqual([]);
    expect(parseIds('')).toEqual([]);
  });

  it(`keeps at most ${MAX_LABEL_IDS} ids`, () => {
    const ids = Array.from({ length: MAX_LABEL_IDS + 5 }, (_, index) => `id-${index}`);
    expect(parseIds(ids.join(','))).toHaveLength(MAX_LABEL_IDS);
    expect(new URLSearchParams(labelsHref(ids).split('?')[1]).get('ids')?.split(',')).toHaveLength(
      MAX_LABEL_IDS
    );
  });

  it('reads the template, sheet and contents flag, with an unknown template as auto', () => {
    expect(
      readLabelParams(new URLSearchParams('ids=a&template=item&sheet=L7163&contents=1'))
    ).toEqual({ ids: ['a'], template: 'item', sheetId: 'L7163', contents: true });
    expect(readLabelParams(new URLSearchParams('template=poster'))).toEqual({
      ids: [],
      template: 'auto',
      sheetId: null,
      contents: false,
    });
  });

  it('links to the page with the ids, and the contents flag when asked', () => {
    expect(labelsHref(['a', 'b'])).toBe('/inventory/labels?ids=a%2Cb');
    expect(labelsHref(['a'], { contents: true })).toBe('/inventory/labels?ids=a&contents=1');
  });
});

describe('code save outcomes', () => {
  it('reads an applied save as saved', () => {
    expect(
      codeSaveResult({ status: 'applied', mutationId: 'm', revision: 2, seq: 3, converged: true })
    ).toEqual({ status: 'saved' });
  });

  it('reads a code collision as taken, with the holder and the next free code', () => {
    expect(
      codeSaveResult({
        status: 'conflict',
        kind: 'code_collision',
        mutationId: 'm',
        heldBy: { id: 'g', name: 'Coffee grinder' },
        suggestedCode: 'KIT-032',
      })
    ).toEqual({ status: 'taken', holder: 'Coffee grinder', suggestion: 'KIT-032' });
  });

  it('reads a rejection as failed, with the server message', () => {
    expect(
      codeSaveResult({
        status: 'rejected',
        mutationId: 'm',
        reason: 'invalid',
        message: 'Too long',
      })
    ).toEqual({ status: 'failed', message: 'Too long' });
  });

  it('reads a deferred save as failed', () => {
    expect(codeSaveResult({ status: 'deferred', mutationId: 'm', waitingOn: 'x' }).status).toBe(
      'failed'
    );
  });
});

describe('search results', () => {
  it('reads an item hit into a candidate', () => {
    expect(
      toCandidate({ uri: '/inventory/items/abc', data: { itemName: 'Lamp', assetId: 'L01' } })
    ).toEqual({ id: 'abc', name: 'Lamp', code: 'L01' });
    expect(toCandidate({ uri: '/inventory/items/abc', data: { itemName: 'Lamp' } })).toEqual({
      id: 'abc',
      name: 'Lamp',
      code: null,
    });
  });

  it('skips a hit that is not an item or has no name', () => {
    expect(toCandidate({ uri: '/inventory/locations/abc', data: { itemName: 'X' } })).toBeNull();
    expect(toCandidate({ uri: '/inventory/items/', data: { itemName: 'X' } })).toBeNull();
    expect(toCandidate({ uri: '/inventory/items/abc', data: {} })).toBeNull();
  });
});
