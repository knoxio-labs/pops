import { describe, expect, it } from 'vitest';

import { toWireValues } from './wire-values.js';

describe('toWireValues', () => {
  it('narrows every wire value shape and rejects invalid or extra data', () => {
    expect(
      toWireValues([
        'text',
        2,
        true,
        { optionId: 'option-red' },
        { amount: '2', unit: 'm' },
        { targetKind: 'item', targetId: 'item-1' },
      ])
    ).toEqual([
      'text',
      2,
      true,
      { optionId: 'option-red' },
      { amount: '2', unit: 'm' },
      { targetKind: 'item', targetId: 'item-1' },
    ]);
    expect(toWireValues([Number.NaN])).toBeNull();
    expect(toWireValues([null])).toBeNull();
    expect(toWireValues([[1]])).toBeNull();
    expect(toWireValues([{ optionId: 1 }])).toBeNull();
    expect(toWireValues([{ amount: '2' }])).toBeNull();
    expect(toWireValues([{ optionId: 'red', extra: true }])).toBeNull();
  });
});
