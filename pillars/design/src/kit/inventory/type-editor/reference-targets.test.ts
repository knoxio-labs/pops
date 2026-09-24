import { describe, expect, it } from 'vitest';

import { referenceScope, referenceTargetSummary, showsItemTypes } from './reference-targets';

const labels: Record<string, string> = {
  'type-electronics': 'Electronics',
  'type-furniture': 'Furniture',
};
const typeLabel = (id: string) => labels[id] ?? id;

describe('referenceScope', () => {
  it('classifies each target-kind combination', () => {
    expect(referenceScope({ kinds: ['item'], typeIds: [] })).toBe('items');
    expect(referenceScope({ kinds: ['location'], typeIds: [] })).toBe('locations');
    expect(referenceScope({ kinds: ['item', 'location'], typeIds: [] })).toBe(
      'items-and-locations'
    );
    expect(referenceScope({ kinds: ['location', 'item'], typeIds: [] })).toBe(
      'items-and-locations'
    );
    expect(referenceScope({ kinds: [], typeIds: [] })).toBe('none');
  });
});

describe('referenceTargetSummary', () => {
  it('treats an empty type list as every item type', () => {
    expect(referenceTargetSummary({ kinds: ['item'], typeIds: [] }, typeLabel)).toBe(
      'Accepts any item.'
    );
  });

  it('names constrained item types as alternatives', () => {
    expect(
      referenceTargetSummary(
        { kinds: ['item'], typeIds: ['type-electronics', 'type-furniture'] },
        typeLabel
      )
    ).toBe('Accepts Electronics or Furniture items.');
  });

  it('never lets item types limit locations in a mixed field', () => {
    expect(
      referenceTargetSummary(
        { kinds: ['item', 'location'], typeIds: ['type-furniture'] },
        typeLabel
      )
    ).toBe('Accepts Furniture items or any location.');
  });

  it('ignores stale type ids on a location-only field', () => {
    expect(
      referenceTargetSummary({ kinds: ['location'], typeIds: ['type-furniture'] }, typeLabel)
    ).toBe('Accepts any location.');
  });

  it('asks for a target kind when none is chosen', () => {
    expect(referenceTargetSummary({ kinds: [], typeIds: [] }, typeLabel)).toBe(
      'Choose at least one target kind.'
    );
  });
});

describe('showsItemTypes', () => {
  it('offers the item-type constraint only while items are allowed', () => {
    expect(showsItemTypes({ kinds: ['item'], typeIds: [] })).toBe(true);
    expect(showsItemTypes({ kinds: ['item', 'location'], typeIds: [] })).toBe(true);
    expect(showsItemTypes({ kinds: ['location'], typeIds: [] })).toBe(false);
    expect(showsItemTypes({ kinds: [], typeIds: [] })).toBe(false);
  });
});
