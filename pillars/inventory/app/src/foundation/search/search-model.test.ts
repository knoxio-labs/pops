import { describe, expect, it } from 'vitest';

import { coreWorld } from '../test-fixtures/core';
import { drill, hdmiCables, television } from '../test-fixtures/core-items';
import { coreLocations } from '../test-fixtures/core-locations';
import { parentPath, resultOrder, splitHits, stepActive, typeaheadRows } from './search-model';

import type { SearchItemHit, SearchPlaceHit } from '../../inventory-web/useWebSearch';

function itemHit(
  item: SearchItemHit['item'],
  tier: SearchItemHit['tier'],
  field: SearchItemHit['field'] = null
): SearchItemHit {
  return { kind: 'item', item, tier, field };
}

function placeHit(placeId: string, tier: SearchPlaceHit['tier']): SearchPlaceHit {
  const place = coreLocations.find((location) => location.id === placeId);
  if (place === undefined) throw new Error(`Missing test place ${placeId}`);
  return { kind: 'place', place, tier };
}

describe('stepActive', () => {
  const order = ['a', 'b', 'c'];

  it('moves and clamps at both ends', () => {
    expect(stepActive(order, 'a', 1)).toBe('b');
    expect(stepActive(order, 'c', 1)).toBe('c');
    expect(stepActive(order, 'a', -1)).toBe('a');
  });

  it('starts at the top when nothing or a vanished row is active', () => {
    expect(stepActive(order, null, 1)).toBe('a');
    expect(stepActive(order, 'gone', -1)).toBe('a');
    expect(stepActive([], 'a', 1)).toBeNull();
  });
});

describe('splitHits', () => {
  it('keeps server order inside both groups without ranking or filtering', () => {
    const items = [
      itemHit(drill, 'contains'),
      itemHit(hdmiCables, 'other', 'code'),
      itemHit(television, 'prefix'),
    ];

    expect(splitHits(items).byName.map((hit) => hit.item.id)).toEqual(['itm-drill', 'itm-tv']);
    expect(splitHits(items).elsewhere.map((hit) => hit.item.id)).toEqual(['itm-hdmi']);
  });
});

describe('resultOrder', () => {
  it('draws name matches, then places, then matches elsewhere', () => {
    const results = {
      exact: television,
      items: [itemHit(drill, 'contains'), itemHit(hdmiCables, 'other', 'code')],
      places: [placeHit('loc-garage', 'contains')],
    };

    expect(resultOrder(results)).toEqual(['itm-tv', 'itm-drill', 'loc-garage', 'itm-hdmi']);
  });
});

describe('typeaheadRows', () => {
  it('is a prefix of the page order, capped', () => {
    const results = {
      exact: null,
      items: [
        itemHit(drill, 'prefix'),
        itemHit(hdmiCables, 'other', 'note'),
        itemHit(television, 'contains'),
      ],
      places: [placeHit('loc-garage', 'prefix')],
    };

    const rows = typeaheadRows(results, 3);
    const ids = rows.map((row) => (row.kind === 'item' ? row.hit.item.id : row.place.id));
    expect(ids).toEqual(resultOrder(results).slice(0, 3));
  });

  it('marks the exact code row', () => {
    const [first] = typeaheadRows({ exact: television, items: [], places: [] });
    expect(first).toMatchObject({
      kind: 'item',
      exact: true,
      hit: { item: { id: 'itm-tv' }, tier: 'prefix', field: 'code' },
    });
  });

  it('is empty for an empty query', () => {
    expect(typeaheadRows({ exact: null, items: [], places: [] })).toEqual([]);
  });
});

describe('parentPath', () => {
  it('leaves out the place itself and returns an empty string at the root', () => {
    expect(parentPath(coreWorld, 'loc-workbench')).toBe('Wattle Street house › Garage');
    expect(parentPath(coreWorld, 'loc-house')).toBe('');
  });
});
