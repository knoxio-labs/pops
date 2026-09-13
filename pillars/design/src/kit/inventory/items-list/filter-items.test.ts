import { describe, expect, it } from 'vitest';

import {
  filterInventoryItems,
  flattenLocations,
  hasAnyActiveFilter,
  type FilterableItem,
  type ItemsFilterState,
  type LocationTreeNodeShape,
} from './filter-items';

function filters(overrides: Partial<ItemsFilterState> = {}): ItemsFilterState {
  return {
    search: '',
    typeFilter: '',
    conditionFilter: '',
    inUseFilter: '',
    locationFilter: '',
    ...overrides,
  };
}

function item(overrides: Partial<FilterableItem> & { id: string }): FilterableItem & {
  id: string;
} {
  return {
    itemName: 'Item',
    type: null,
    condition: null,
    inUse: false,
    locationId: null,
    ...overrides,
  };
}

describe('hasAnyActiveFilter', () => {
  it('is false when nothing but search is set', () => {
    expect(hasAnyActiveFilter(filters())).toBe(false);
  });

  it('is true for each of type, condition, inUse and location alone', () => {
    expect(hasAnyActiveFilter(filters({ typeFilter: 'Electronics' }))).toBe(true);
    expect(hasAnyActiveFilter(filters({ conditionFilter: 'Good' }))).toBe(true);
    expect(hasAnyActiveFilter(filters({ inUseFilter: 'true' }))).toBe(true);
    expect(hasAnyActiveFilter(filters({ locationFilter: 'loc-1' }))).toBe(true);
  });
});

describe('filterInventoryItems', () => {
  const items = [
    item({
      id: 'a',
      itemName: 'LG television',
      type: 'Electronics',
      condition: 'Excellent',
      inUse: true,
      locationId: 'loc-1',
    }),
    item({
      id: 'b',
      itemName: 'Makita drill',
      type: 'Tool',
      condition: 'Good',
      inUse: false,
      locationId: 'loc-2',
    }),
    item({
      id: 'c',
      itemName: 'Reference books',
      type: null,
      condition: null,
      inUse: true,
      locationId: null,
    }),
  ];

  it('returns every item when no filter is active', () => {
    expect(filterInventoryItems(items, filters())).toHaveLength(3);
  });

  it('matches search against itemName only, case-insensitively', () => {
    expect(filterInventoryItems(items, filters({ search: 'MAKITA' })).map((i) => i.id)).toEqual([
      'b',
    ]);
  });

  it('does not match search against fields other than itemName', () => {
    expect(filterInventoryItems(items, filters({ search: 'Electronics' }))).toHaveLength(0);
  });

  it('matches type exactly', () => {
    expect(filterInventoryItems(items, filters({ typeFilter: 'Tool' })).map((i) => i.id)).toEqual([
      'b',
    ]);
  });

  it('matches condition case-insensitively', () => {
    expect(
      filterInventoryItems(items, filters({ conditionFilter: 'excellent' })).map((i) => i.id)
    ).toEqual(['a']);
  });

  it('matches inUse as a boolean', () => {
    expect(filterInventoryItems(items, filters({ inUseFilter: 'false' })).map((i) => i.id)).toEqual(
      ['b']
    );
  });

  it('matches locationId exactly, with no descendant expansion', () => {
    expect(
      filterInventoryItems(items, filters({ locationFilter: 'loc-1' })).map((i) => i.id)
    ).toEqual(['a']);
  });

  it('combines filters with AND', () => {
    expect(
      filterInventoryItems(items, filters({ inUseFilter: 'true', typeFilter: 'Electronics' })).map(
        (i) => i.id
      )
    ).toEqual(['a']);
  });

  it('returns nothing when a filter matches no item', () => {
    expect(filterInventoryItems(items, filters({ typeFilter: 'Nonexistent' }))).toHaveLength(0);
  });
});

describe('flattenLocations', () => {
  const tree: LocationTreeNodeShape[] = [
    { id: 'loc-1', name: 'House', children: [{ id: 'loc-2', name: 'Garage', children: [] }] },
  ];

  it('always leads with the All Locations option', () => {
    expect(flattenLocations([])).toEqual([{ value: '', label: 'All Locations' }]);
  });

  it('indents a child under its parent', () => {
    expect(flattenLocations(tree)).toEqual([
      { value: '', label: 'All Locations' },
      { value: 'loc-1', label: 'House' },
      { value: 'loc-2', label: '  └ Garage' },
    ]);
  });
});
