import { coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { referenceOptions, targetsPhrase } from './reference-options';

const label = (id: string) =>
  ({ 'type-furniture': 'Furniture', 'type-electronics': 'Electronics' })[id] ?? id;

describe('targetsPhrase', () => {
  it('names item types and places in one phrase', () => {
    expect(targetsPhrase({ kinds: ['item', 'location'], typeIds: ['type-furniture'] }, label)).toBe(
      'Furniture items or any place'
    );
    expect(targetsPhrase({ kinds: ['item'], typeIds: [] }, label)).toBe('Any item');
    expect(targetsPhrase({ kinds: ['location'], typeIds: [] }, label)).toBe('Any place');
  });
});

describe('referenceOptions', () => {
  const furnitureOrPlace = { kinds: ['item', 'location'] as const, typeIds: ['type-furniture'] };

  it('puts allowed rows before refused ones, with the reason on the refused', () => {
    const options = referenceOptions({
      world: coreWorld,
      targets: furnitureOrPlace,
      query: 'desk',
      typeLabel: label,
    });
    expect(options.map((option) => option.refusal)).toEqual([null, null, 'Only Furniture items']);
    const names = options.map((option) =>
      option.kind === 'item' ? option.item.name : option.location.name
    );
    expect(names).toEqual(['Desk', 'Standing desk', 'Desk lamp']);
  });

  it('refuses places on an item-only field', () => {
    const options = referenceOptions({
      world: coreWorld,
      targets: { kinds: ['item'], typeIds: [] },
      query: 'garage',
      typeLabel: label,
    });
    expect(options).toEqual([
      expect.objectContaining({ kind: 'location', refusal: 'Places are not allowed here' }),
    ]);
  });

  it('never offers inactive items and stops at the limit', () => {
    const options = referenceOptions({
      world: coreWorld,
      targets: { kinds: ['item'], typeIds: [] },
      query: '',
      typeLabel: label,
      limit: 5,
    });
    expect(options).toHaveLength(5);
    const all = referenceOptions({
      world: coreWorld,
      targets: { kinds: ['item'], typeIds: [] },
      query: 'film camera',
      typeLabel: label,
    });
    expect(all).toEqual([]);
  });
});
