import { describe, expect, it } from 'vitest';

import {
  inventoryResultOrder,
  isSearchDebouncing,
  parseSearchScope,
  searchResultDomId,
  stepSearchResult,
} from './search-model.js';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { WebSearchResults } from '../../inventory-web/useWebSearch.js';

function item(id: string): ItemRowModel {
  return {
    id,
    name: id,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'in-hand' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function place(id: string): LocationModel {
  return { id, name: id, parentId: null, kind: 'room' };
}

function results(): WebSearchResults {
  return {
    exact: item('exact'),
    items: [
      { kind: 'item', item: item('prefix'), tier: 'prefix', field: 'type' },
      { kind: 'item', item: item('other'), tier: 'other', field: 'note' },
    ],
    places: [{ kind: 'place', place: place('place'), tier: 'contains' }],
    total: 4,
  };
}

describe('search model', () => {
  it('keeps server order while placing exact and place hits in their result groups', () => {
    expect(inventoryResultOrder(results())).toEqual(['exact', 'prefix', 'place', 'other']);
  });

  it('does not render an exact hit twice when the server also returns it as an item hit', () => {
    const base = results();
    const exact = base.exact;
    if (exact === null) throw new Error('test fixture must contain an exact result');
    const duplicate: WebSearchResults = {
      ...base,
      items: [{ kind: 'item', item: exact, tier: 'prefix', field: 'code' }, ...base.items],
    };
    expect(inventoryResultOrder(duplicate)).toEqual(['exact', 'prefix', 'place', 'other']);
  });

  it('clamps keyboard navigation and starts at the first result', () => {
    expect(stepSearchResult(null, ['one', 'two'], 1)).toBe('one');
    expect(stepSearchResult('one', ['one', 'two'], 1)).toBe('two');
    expect(stepSearchResult('two', ['one', 'two'], 1)).toBe('two');
    expect(stepSearchResult('missing', ['one', 'two'], -1)).toBe('one');
    expect(stepSearchResult(null, [], 1)).toBeNull();
  });

  it('parses only supported scopes and creates encoded active-descendant ids', () => {
    expect(parseSearchScope('purchases')).toBe('purchases');
    expect(parseSearchScope('unknown')).toBe('inventory');
    expect(searchResultDomId('item', 'id with/slash')).toBe('search-result-item-id%20with%2Fslash');
  });

  it('reports query and filter debounce independently from server status', () => {
    expect(
      isSearchDebouncing(
        'lamp',
        'la',
        { typeKey: null, within: 'room' },
        { typeKey: null, within: null }
      )
    ).toBe(true);
    expect(
      isSearchDebouncing(
        'lamp',
        'lamp',
        { typeKey: 'lighting', within: null },
        { typeKey: null, within: null }
      )
    ).toBe(true);
    expect(
      isSearchDebouncing(
        'lamp',
        'lamp',
        { typeKey: null, within: null },
        { typeKey: null, within: null }
      )
    ).toBe(false);
  });
});
